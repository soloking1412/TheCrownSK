// Portfolio Tracker Module
// Tracks holdings, P&L, and trading history

import { type Address, formatEther } from 'viem';
import { getAccount, getBalance } from '../blockchain/client.js';
import { getTokenBalance, getAmountOut, getTokenInfo } from '../nadfun/client.js';
import { fetchTrendingTokens } from './live-scanner.js';
import { logger } from '../utils/logger.js';

export interface TokenHolding {
  token: Address;
  name: string;
  symbol: string;
  balance: bigint;
  costBasis: bigint; // Total MON spent
  currentValue: bigint; // Current value in MON
  pnl: bigint; // Profit/Loss in MON
  pnlPercent: number;
}

export interface Trade {
  token: Address;
  action: 'buy' | 'sell';
  monAmount: bigint;
  tokenAmount: bigint;
  timestamp: number;
  txHash: string;
}

export interface PortfolioSummary {
  walletAddress: Address;
  monBalance: bigint;
  totalHoldingsValue: bigint;
  totalPortfolioValue: bigint;
  totalPnl: bigint;
  totalPnlPercent: number;
  holdings: TokenHolding[];
  tradeCount: number;
}

// Trade history storage
const tradeHistory: Trade[] = [];
const costBasis: Map<string, bigint> = new Map();

/**
 * Record a trade
 */
export function recordTrade(trade: Trade): void {
  tradeHistory.push(trade);

  const key = trade.token.toLowerCase();
  const existing = costBasis.get(key) || 0n;

  if (trade.action === 'buy') {
    costBasis.set(key, existing + trade.monAmount);
  } else {
    // Reduce cost basis proportionally when selling
    costBasis.set(key, existing > trade.monAmount ? existing - trade.monAmount : 0n);
  }

  logger.info('Trade recorded', {
    action: trade.action,
    token: trade.token,
    monAmount: formatEther(trade.monAmount),
  });
}

/**
 * Get token holding with current value
 */
export async function getTokenHolding(token: Address): Promise<TokenHolding | null> {
  const account = getAccount();

  try {
    const [balance, info] = await Promise.all([
      getTokenBalance(token, account.address),
      getTokenInfo(token),
    ]);

    if (balance === 0n) {
      return null;
    }

    // Get current value
    let currentValue = 0n;
    try {
      const quote = await getAmountOut(token, balance, false);
      currentValue = quote.amountOut;
    } catch {
      // Token might not be tradeable
    }

    const cost = costBasis.get(token.toLowerCase()) || 0n;
    const pnl = currentValue - cost;
    const pnlPercent = cost > 0n ? Number((pnl * 10000n) / cost) / 100 : 0;

    return {
      token,
      name: info.name,
      symbol: info.symbol,
      balance,
      costBasis: cost,
      currentValue,
      pnl,
      pnlPercent,
    };
  } catch (error) {
    logger.warn('Failed to get token holding', { token, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * Get full portfolio summary
 */
export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  const account = getAccount();
  const monBalance = await getBalance();

  // Get list of tokens we might hold
  const knownTokens = Array.from(costBasis.keys());

  // Also check trending tokens in case we have any
  try {
    const trending = await fetchTrendingTokens(20);
    for (const t of trending) {
      if (!knownTokens.includes(t.address.toLowerCase())) {
        knownTokens.push(t.address.toLowerCase());
      }
    }
  } catch {
    // Ignore errors
  }

  // Get holdings
  const holdings: TokenHolding[] = [];
  let totalHoldingsValue = 0n;
  let totalCostBasis = 0n;

  for (const token of knownTokens.slice(0, 20)) {
    // Limit to 20 tokens
    const holding = await getTokenHolding(token as Address);
    if (holding && holding.balance > 0n) {
      holdings.push(holding);
      totalHoldingsValue += holding.currentValue;
      totalCostBasis += holding.costBasis;
    }
  }

  const totalPortfolioValue = monBalance + totalHoldingsValue;
  const totalPnl = totalHoldingsValue - totalCostBasis;
  const totalPnlPercent = totalCostBasis > 0n ? Number((totalPnl * 10000n) / totalCostBasis) / 100 : 0;

  return {
    walletAddress: account.address,
    monBalance,
    totalHoldingsValue,
    totalPortfolioValue,
    totalPnl,
    totalPnlPercent,
    holdings: holdings.sort((a, b) => Number(b.currentValue - a.currentValue)),
    tradeCount: tradeHistory.length,
  };
}

/**
 * Get trade history
 */
export function getTradeHistory(limit = 50): Trade[] {
  return tradeHistory
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

/**
 * Get trades for a specific token
 */
export function getTokenTrades(token: Address): Trade[] {
  return tradeHistory.filter(
    t => t.token.toLowerCase() === token.toLowerCase()
  );
}

/**
 * Calculate win rate
 */
export function getWinRate(): { wins: number; losses: number; winRate: number } {
  // Group trades by token
  const tokenPnL: Map<string, bigint> = new Map();

  for (const trade of tradeHistory) {
    const key = trade.token.toLowerCase();
    const existing = tokenPnL.get(key) || 0n;

    if (trade.action === 'buy') {
      tokenPnL.set(key, existing - trade.monAmount);
    } else {
      tokenPnL.set(key, existing + trade.monAmount);
    }
  }

  let wins = 0;
  let losses = 0;

  for (const pnl of tokenPnL.values()) {
    if (pnl > 0n) wins++;
    else if (pnl < 0n) losses++;
  }

  const total = wins + losses;
  const winRate = total > 0 ? (wins / total) * 100 : 0;

  return { wins, losses, winRate };
}

/**
 * Format portfolio for display
 */
export function formatPortfolio(summary: PortfolioSummary): string {
  const lines: string[] = [];

  lines.push('=== Portfolio Summary ===');
  lines.push(`Wallet: ${summary.walletAddress}`);
  lines.push(`MON Balance: ${formatEther(summary.monBalance)}`);
  lines.push(`Holdings Value: ${formatEther(summary.totalHoldingsValue)} MON`);
  lines.push(`Total Value: ${formatEther(summary.totalPortfolioValue)} MON`);

  const pnlEmoji = summary.totalPnl >= 0n ? '📈' : '📉';
  lines.push(`P&L: ${pnlEmoji} ${formatEther(summary.totalPnl)} MON (${summary.totalPnlPercent.toFixed(2)}%)`);
  lines.push(`Trades: ${summary.tradeCount}`);

  if (summary.holdings.length > 0) {
    lines.push('\n--- Holdings ---');
    for (const h of summary.holdings.slice(0, 5)) {
      const pnlSign = h.pnl >= 0n ? '+' : '';
      lines.push(`${h.symbol}: ${formatEther(h.balance)} (${pnlSign}${h.pnlPercent.toFixed(1)}%)`);
    }
  }

  return lines.join('\n');
}
