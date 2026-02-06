// Momentum Detector Module
// Detect price and volume momentum for better entry/exit timing

import { type Address, formatEther, parseAbiItem } from 'viem';
import { getPublicClient } from '../blockchain/client.js';
import { NADFUN_CONTRACTS } from '../config/constants.js';
import { getAmountOut } from '../nadfun/client.js';
import { logger } from '../utils/logger.js';

export interface TokenMomentum {
  token: Address;
  priceChange5m: number;
  priceChange15m: number;
  priceChange1h: number;
  volumeChange: number;
  buyPressure: number; // 0-100, higher = more buys vs sells
  momentumScore: number; // -100 to 100
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  trend: 'up' | 'down' | 'sideways';
}

export interface TradeEvent {
  token: Address;
  action: 'buy' | 'sell';
  amountMon: bigint;
  amountToken: bigint;
  blockNumber: bigint;
  timestamp: number;
}

// Price history for momentum calculation
const priceHistory: Map<string, Array<{ price: bigint; timestamp: number }>> = new Map();
const tradeHistory: Map<string, TradeEvent[]> = new Map();

/**
 * Record a trade event
 */
function recordTradeEvent(event: TradeEvent): void {
  const key = event.token.toLowerCase();
  if (!tradeHistory.has(key)) {
    tradeHistory.set(key, []);
  }

  const history = tradeHistory.get(key)!;
  history.push(event);

  // Keep only last 2 hours of trades
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  const filtered = history.filter(t => t.timestamp > twoHoursAgo);
  tradeHistory.set(key, filtered);
}

/**
 * Calculate current "price" (MON per token unit)
 */
async function getTokenPrice(token: Address): Promise<bigint> {
  try {
    const quote = await getAmountOut(token, 10n ** 18n, false); // Price of 1 token in MON
    return quote.amountOut;
  } catch {
    return 0n;
  }
}

/**
 * Record current price snapshot
 */
export async function snapshotPrice(token: Address): Promise<void> {
  const price = await getTokenPrice(token);
  if (price === 0n) return;

  const key = token.toLowerCase();
  if (!priceHistory.has(key)) {
    priceHistory.set(key, []);
  }

  const history = priceHistory.get(key)!;
  history.push({ price, timestamp: Date.now() });

  // Keep only last 2 hours
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  const filtered = history.filter(p => p.timestamp > twoHoursAgo);
  priceHistory.set(key, filtered);
}

/**
 * Scan for recent trade events
 */
export async function scanTradeEvents(token: Address, blocksBack = 50): Promise<TradeEvent[]> {
  const publicClient = getPublicClient();
  const events: TradeEvent[] = [];

  try {
    const currentBlock = await publicClient.getBlockNumber();
    const fromBlock = currentBlock - BigInt(blocksBack);

    // Get buy events
    const buyLogs = await publicClient.getLogs({
      address: NADFUN_CONTRACTS.BONDING_CURVE as Address,
      event: parseAbiItem('event Buy(address indexed token, address indexed buyer, uint256 amountIn, uint256 amountOut)'),
      args: { token },
      fromBlock,
      toBlock: currentBlock,
    });

    for (const log of buyLogs) {
      const event: TradeEvent = {
        token: log.args.token as Address,
        action: 'buy',
        amountMon: log.args.amountIn as bigint,
        amountToken: log.args.amountOut as bigint,
        blockNumber: log.blockNumber,
        timestamp: Date.now(), // Approximation
      };
      events.push(event);
      recordTradeEvent(event);
    }

    // Get sell events
    const sellLogs = await publicClient.getLogs({
      address: NADFUN_CONTRACTS.BONDING_CURVE as Address,
      event: parseAbiItem('event Sell(address indexed token, address indexed seller, uint256 amountIn, uint256 amountOut)'),
      args: { token },
      fromBlock,
      toBlock: currentBlock,
    });

    for (const log of sellLogs) {
      const event: TradeEvent = {
        token: log.args.token as Address,
        action: 'sell',
        amountMon: log.args.amountOut as bigint,
        amountToken: log.args.amountIn as bigint,
        blockNumber: log.blockNumber,
        timestamp: Date.now(),
      };
      events.push(event);
      recordTradeEvent(event);
    }

    return events;
  } catch (error) {
    logger.warn('Failed to scan trade events', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

/**
 * Calculate price change percentage
 */
function calculatePriceChange(prices: Array<{ price: bigint; timestamp: number }>, minutesAgo: number): number {
  if (prices.length < 2) return 0;

  const now = Date.now();
  const targetTime = now - minutesAgo * 60 * 1000;

  // Find price closest to target time
  const oldPrice = prices.reduce((closest, p) => {
    if (Math.abs(p.timestamp - targetTime) < Math.abs(closest.timestamp - targetTime)) {
      return p;
    }
    return closest;
  });

  const currentPrice = prices[prices.length - 1];

  if (oldPrice.price === 0n) return 0;

  const change = Number(currentPrice.price - oldPrice.price) / Number(oldPrice.price);
  return Math.round(change * 10000) / 100; // Percentage with 2 decimals
}

/**
 * Calculate buy pressure (ratio of buy volume to total volume)
 */
function calculateBuyPressure(trades: TradeEvent[]): number {
  if (trades.length === 0) return 50;

  let buyVolume = 0n;
  let sellVolume = 0n;

  for (const trade of trades) {
    if (trade.action === 'buy') {
      buyVolume += trade.amountMon;
    } else {
      sellVolume += trade.amountMon;
    }
  }

  const totalVolume = buyVolume + sellVolume;
  if (totalVolume === 0n) return 50;

  return Math.round(Number((buyVolume * 100n) / totalVolume));
}

/**
 * Calculate momentum score
 */
function calculateMomentumScore(
  priceChange5m: number,
  priceChange15m: number,
  priceChange1h: number,
  buyPressure: number
): number {
  // Weighted combination
  const priceScore = priceChange5m * 3 + priceChange15m * 2 + priceChange1h;
  const pressureScore = (buyPressure - 50) * 2; // Center at 50

  // Combine and normalize to -100 to 100
  const rawScore = priceScore + pressureScore;
  return Math.max(-100, Math.min(100, Math.round(rawScore)));
}

/**
 * Get signal from momentum score
 */
function getSignalFromMomentum(score: number): TokenMomentum['signal'] {
  if (score >= 50) return 'strong_buy';
  if (score >= 20) return 'buy';
  if (score <= -50) return 'strong_sell';
  if (score <= -20) return 'sell';
  return 'neutral';
}

/**
 * Analyze token momentum
 */
export async function analyzeTokenMomentum(token: Address): Promise<TokenMomentum> {
  const key = token.toLowerCase();

  // Snapshot current price
  await snapshotPrice(token);

  // Scan recent trades
  await scanTradeEvents(token, 100);

  const prices = priceHistory.get(key) || [];
  const trades = tradeHistory.get(key) || [];

  // Calculate metrics
  const priceChange5m = calculatePriceChange(prices, 5);
  const priceChange15m = calculatePriceChange(prices, 15);
  const priceChange1h = calculatePriceChange(prices, 60);
  const buyPressure = calculateBuyPressure(trades);

  // Recent trades only for volume change
  const recentTrades = trades.filter(t => t.timestamp > Date.now() - 15 * 60 * 1000);
  const olderTrades = trades.filter(t =>
    t.timestamp > Date.now() - 30 * 60 * 1000 &&
    t.timestamp <= Date.now() - 15 * 60 * 1000
  );

  const recentVolume = recentTrades.reduce((sum, t) => sum + Number(formatEther(t.amountMon)), 0);
  const olderVolume = olderTrades.reduce((sum, t) => sum + Number(formatEther(t.amountMon)), 0);
  const volumeChange = olderVolume > 0 ? ((recentVolume - olderVolume) / olderVolume) * 100 : 0;

  const momentumScore = calculateMomentumScore(priceChange5m, priceChange15m, priceChange1h, buyPressure);

  // Determine trend
  let trend: TokenMomentum['trend'] = 'sideways';
  if (priceChange1h > 5 && priceChange15m > 0) trend = 'up';
  else if (priceChange1h < -5 && priceChange15m < 0) trend = 'down';

  return {
    token,
    priceChange5m,
    priceChange15m,
    priceChange1h,
    volumeChange: Math.round(volumeChange),
    buyPressure,
    momentumScore,
    signal: getSignalFromMomentum(momentumScore),
    trend,
  };
}

/**
 * Find tokens with strong momentum
 */
export async function findMomentumTokens(tokens: Address[]): Promise<TokenMomentum[]> {
  const results: TokenMomentum[] = [];

  for (const token of tokens.slice(0, 10)) { // Limit to avoid rate limiting
    try {
      const momentum = await analyzeTokenMomentum(token);
      results.push(momentum);
    } catch {
      // Skip failed tokens
    }
  }

  // Sort by momentum score
  return results.sort((a, b) => b.momentumScore - a.momentumScore);
}

/**
 * Format momentum for display
 */
export function formatMomentum(m: TokenMomentum): string {
  const emoji = m.signal === 'strong_buy' ? '🟢🟢' :
                m.signal === 'buy' ? '🟢' :
                m.signal === 'strong_sell' ? '🔴🔴' :
                m.signal === 'sell' ? '🔴' : '⚪';

  const trendEmoji = m.trend === 'up' ? '📈' : m.trend === 'down' ? '📉' : '➡️';

  return `${emoji} ${m.token.slice(0, 10)}... | Score: ${m.momentumScore} | ${m.signal.toUpperCase()}
   ${trendEmoji} 5m: ${m.priceChange5m >= 0 ? '+' : ''}${m.priceChange5m.toFixed(1)}% | 1h: ${m.priceChange1h >= 0 ? '+' : ''}${m.priceChange1h.toFixed(1)}%
   Buy Pressure: ${m.buyPressure}% | Vol Change: ${m.volumeChange >= 0 ? '+' : ''}${m.volumeChange}%`;
}
