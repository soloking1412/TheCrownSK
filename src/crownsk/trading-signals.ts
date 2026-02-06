// Trading Signal Generator
// Analyzes tokens from nad.fun to generate trading signals

import { moltbookClient } from '../moltbook/client.js';
import { getTokenStatus, buyTokens } from '../nadfun/client.js';
import { parseEther, formatEther, type Address } from 'viem';
import { logger } from '../utils/logger.js';
import type { TradingSignal, MoltbookPost } from '../moltbook/types.js';

// Sentiment keywords
const POSITIVE_KEYWORDS = [
  'moon', 'pump', 'buy', 'bullish', 'gem', 'alpha', '100x', '1000x',
  'undervalued', 'strong', 'hodl', 'diamond', 'fire', 'rocket',
  'accumulate', 'dip', 'opportunity', 'breakout', 'ath',
];

const NEGATIVE_KEYWORDS = [
  'dump', 'sell', 'bearish', 'scam', 'rug', 'avoid', 'crash',
  'exit', 'dead', 'warning', 'fake', 'honeypot', 'ponzi',
];

interface TokenSignalData {
  token: string;
  name: string;
  symbol: string;
  holders: number;
  graduated: boolean;
  progress: number;
  score: number;
  sentiment: number;
  signals: string[];
  recommendation: 'buy' | 'sell' | 'hold';
  lastUpdate: number;
}

const tokenSignals: Map<string, TokenSignalData> = new Map();

/**
 * Calculate sentiment score for text (-1 to 1)
 */
function calculateSentiment(text: string): number {
  const lowerText = text.toLowerCase();

  let positiveCount = 0;
  let negativeCount = 0;

  for (const keyword of POSITIVE_KEYWORDS) {
    if (lowerText.includes(keyword)) positiveCount++;
  }

  for (const keyword of NEGATIVE_KEYWORDS) {
    if (lowerText.includes(keyword)) negativeCount++;
  }

  const total = positiveCount + negativeCount;
  if (total === 0) return 0;

  return (positiveCount - negativeCount) / total;
}

/**
 * Process a post for token mentions and sentiment
 */
export async function processPost(post: MoltbookPost): Promise<void> {
  const content = `${post.title} ${post.content || ''}`;
  const sentiment = calculateSentiment(content);

  // Extract contract addresses
  const addressMatches = content.match(/0x[a-fA-F0-9]{40}/g) || [];

  for (const address of addressMatches) {
    const existing = tokenSignals.get(address);
    if (existing) {
      existing.sentiment = (existing.sentiment + sentiment) / 2;
      existing.lastUpdate = Date.now();
    }
  }
}

/**
 * Scan for trading signals from multiple sources
 */
export async function scanMoltbookForSignals(): Promise<void> {
  logger.info('Scanning for trading signals...');

  // Scan Moltbook if registered
  if (moltbookClient.isRegistered()) {
    try {
      const feed = await moltbookClient.getFeed();
      for (const post of feed.posts) {
        await processPost(post);
      }
      logger.info('Moltbook scan complete');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn('Moltbook scan failed', { error: errorMsg });
    }
  }

  // Always scan live on-chain data from nad.fun
  await scanLiveTokens();

  logger.info('Signal scan complete', { totalSignals: tokenSignals.size });
}

/**
 * Scan live tokens from nad.fun API and blockchain
 */
async function scanLiveTokens(): Promise<void> {
  const { scanLiveOpportunities } = await import('./live-scanner.js');

  try {
    const opportunities = await scanLiveOpportunities();

    for (const opp of opportunities) {
      const token = opp.token;
      const analysis = opp.analysis;

      // Calculate sentiment from score
      const sentiment = (analysis.score - 50) / 50;

      tokenSignals.set(token.address, {
        token: token.address,
        name: token.name,
        symbol: token.symbol,
        holders: token.holders || 0,
        graduated: token.graduated,
        progress: token.progress,
        score: analysis.score,
        sentiment,
        signals: analysis.signals,
        recommendation: analysis.recommendation,
        lastUpdate: Date.now(),
      });
    }

    logger.info('Live token scan complete', { tokensFound: opportunities.length });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.warn('Live token scan failed', { error: errorMsg });
  }
}

/**
 * Generate trading signal for a token
 */
export function generateSignal(tokenAddress: string): TradingSignal {
  const data = tokenSignals.get(tokenAddress);

  if (!data) {
    return {
      token: tokenAddress,
      action: 'hold',
      confidence: 0,
      reason: 'No data available',
      socialMetrics: {
        mentions: 0,
        sentiment: 0,
        influencerEndorsements: 0,
      },
    };
  }

  // Calculate confidence based on multiple factors
  let confidence = data.score;

  // Boost for graduated tokens (on DEX = more liquid)
  if (data.graduated) {
    confidence += 5;
  }

  // Boost for high holder count
  if (data.holders > 1000) {
    confidence += 10;
  } else if (data.holders > 100) {
    confidence += 5;
  }

  // Cap confidence at 100
  confidence = Math.min(confidence, 100);

  // Build reason string
  const reasons: string[] = [];

  if (data.graduated) {
    reasons.push('Graduated to DEX');
  } else {
    reasons.push(`Bonding curve ${data.progress.toFixed(1)}%`);
  }

  reasons.push(`${data.holders} holders`);

  if (data.signals.length > 0) {
    reasons.push(data.signals[0]);
  }

  return {
    token: tokenAddress,
    action: data.recommendation,
    confidence,
    reason: reasons.join(' | '),
    socialMetrics: {
      mentions: data.holders,
      sentiment: data.sentiment,
      influencerEndorsements: 0,
    },
  };
}

/**
 * Get all current trading signals
 */
export function getAllSignals(): TradingSignal[] {
  const signals: TradingSignal[] = [];

  for (const [token] of tokenSignals) {
    signals.push(generateSignal(token));
  }

  return signals.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get detailed token data (for display)
 */
export function getTokenData(): TokenSignalData[] {
  return Array.from(tokenSignals.values()).sort((a, b) => b.score - a.score);
}

/**
 * Get top buy signals
 */
export function getTopBuySignals(limit = 5): TradingSignal[] {
  return getAllSignals()
    .filter(s => s.action === 'buy')
    .slice(0, limit);
}

/**
 * Get top sell signals
 */
export function getTopSellSignals(limit = 5): TradingSignal[] {
  return getAllSignals()
    .filter(s => s.action === 'sell')
    .slice(0, limit);
}

/**
 * Execute a trade based on signal
 */
export async function executeTrade(
  signal: TradingSignal,
  maxAmount: bigint = parseEther('0.1')
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (signal.confidence < 60) {
    return { success: false, error: 'Signal confidence too low' };
  }

  const tokenAddress = signal.token as Address;

  try {
    await getTokenStatus(tokenAddress);

    if (signal.action === 'buy') {
      const amount = (maxAmount * BigInt(signal.confidence)) / 100n;

      logger.info('Executing buy', {
        token: tokenAddress,
        amount: formatEther(amount),
        confidence: signal.confidence,
      });

      const result = await buyTokens({
        token: tokenAddress,
        monAmount: amount,
        slippagePercent: 5,
      });

      return {
        success: result.success,
        txHash: result.txHash,
        error: result.error,
      };
    } else if (signal.action === 'sell') {
      logger.info('Sell signal detected', {
        token: tokenAddress,
        confidence: signal.confidence,
      });

      return { success: true };
    }

    return { success: false, error: 'Unknown action' };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Trade execution failed', { error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Clear old data (older than 1 hour)
 */
export function cleanupOldData(): void {
  const cutoff = Date.now() - 60 * 60 * 1000;

  for (const [token, data] of tokenSignals) {
    if (data.lastUpdate < cutoff) {
      tokenSignals.delete(token);
    }
  }
}
