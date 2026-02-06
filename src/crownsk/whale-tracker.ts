// Whale Tracker Module
// Tracks large holders and copy-trades smart money

import { type Address, parseAbiItem, formatEther } from 'viem';
import { getPublicClient } from '../blockchain/client.js';
import { NADFUN_CONTRACTS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

export interface WhaleActivity {
  wallet: Address;
  token: Address;
  action: 'buy' | 'sell';
  amount: bigint;
  tokenAmount: bigint;
  timestamp: number;
  txHash: string;
}

export interface WhaleProfile {
  address: Address;
  totalBuys: number;
  totalSells: number;
  totalVolume: bigint;
  profitableTrades: number;
  winRate: number;
  tokens: Set<string>;
  lastActive: number;
}

// Track whale activities
const whaleActivities: WhaleActivity[] = [];
const whaleProfiles: Map<string, WhaleProfile> = new Map();

// Minimum MON amount to consider as whale activity
const WHALE_THRESHOLD = 10n * 10n ** 18n; // 10 MON

/**
 * Scan recent blocks for whale activity
 */
export async function scanWhaleActivity(blocksBack = 100): Promise<WhaleActivity[]> {
  const publicClient = getPublicClient();
  const activities: WhaleActivity[] = [];

  try {
    const currentBlock = await publicClient.getBlockNumber();
    const batchSize = 99n;
    const batches = Math.ceil(blocksBack / 99);

    for (let i = 0; i < batches; i++) {
      const toBlock = currentBlock - (BigInt(i) * batchSize);
      const fromBlock = toBlock - batchSize;

      if (fromBlock < 0n) break;

      try {
        // Scan for Buy events
        const buyLogs = await publicClient.getLogs({
          address: NADFUN_CONTRACTS.BONDING_CURVE as Address,
          event: parseAbiItem('event Buy(address indexed token, address indexed buyer, uint256 amountIn, uint256 amountOut)'),
          fromBlock,
          toBlock,
        });

        for (const log of buyLogs) {
          const amountIn = log.args.amountIn as bigint;

          // Only track whale-sized trades
          if (amountIn >= WHALE_THRESHOLD) {
            const activity: WhaleActivity = {
              wallet: log.args.buyer as Address,
              token: log.args.token as Address,
              action: 'buy',
              amount: amountIn,
              tokenAmount: log.args.amountOut as bigint,
              timestamp: Date.now(),
              txHash: log.transactionHash,
            };

            activities.push(activity);
            updateWhaleProfile(activity);
          }
        }

        // Scan for Sell events
        const sellLogs = await publicClient.getLogs({
          address: NADFUN_CONTRACTS.BONDING_CURVE as Address,
          event: parseAbiItem('event Sell(address indexed token, address indexed seller, uint256 amountIn, uint256 amountOut)'),
          fromBlock,
          toBlock,
        });

        for (const log of sellLogs) {
          const amountOut = log.args.amountOut as bigint;

          if (amountOut >= WHALE_THRESHOLD) {
            const activity: WhaleActivity = {
              wallet: log.args.seller as Address,
              token: log.args.token as Address,
              action: 'sell',
              amount: amountOut,
              tokenAmount: log.args.amountIn as bigint,
              timestamp: Date.now(),
              txHash: log.transactionHash,
            };

            activities.push(activity);
            updateWhaleProfile(activity);
          }
        }
      } catch {
        // Continue to next batch
      }
    }

    // Store activities
    whaleActivities.push(...activities);

    // Keep only last 1000 activities
    if (whaleActivities.length > 1000) {
      whaleActivities.splice(0, whaleActivities.length - 1000);
    }

    logger.info('Whale scan complete', { activitiesFound: activities.length });
    return activities;
  } catch (error) {
    logger.warn('Whale scan failed', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

/**
 * Update whale profile with new activity
 */
function updateWhaleProfile(activity: WhaleActivity): void {
  const key = activity.wallet.toLowerCase();
  const existing = whaleProfiles.get(key) || {
    address: activity.wallet,
    totalBuys: 0,
    totalSells: 0,
    totalVolume: 0n,
    profitableTrades: 0,
    winRate: 0,
    tokens: new Set<string>(),
    lastActive: 0,
  };

  if (activity.action === 'buy') {
    existing.totalBuys++;
  } else {
    existing.totalSells++;
  }

  existing.totalVolume += activity.amount;
  existing.tokens.add(activity.token.toLowerCase());
  existing.lastActive = activity.timestamp;

  // Simplified win rate calculation
  const totalTrades = existing.totalBuys + existing.totalSells;
  existing.winRate = totalTrades > 0 ? (existing.profitableTrades / totalTrades) * 100 : 0;

  whaleProfiles.set(key, existing);
}

/**
 * Get top whales by volume
 */
export function getTopWhales(limit = 10): WhaleProfile[] {
  return Array.from(whaleProfiles.values())
    .sort((a, b) => Number(b.totalVolume - a.totalVolume))
    .slice(0, limit);
}

/**
 * Get recent whale activities
 */
export function getRecentWhaleActivity(limit = 20): WhaleActivity[] {
  return whaleActivities
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

/**
 * Get whale activities for a specific token
 */
export function getTokenWhaleActivity(token: Address): WhaleActivity[] {
  return whaleActivities.filter(
    a => a.token.toLowerCase() === token.toLowerCase()
  );
}

/**
 * Check if wallet is a known whale
 */
export function isWhale(wallet: Address): boolean {
  const profile = whaleProfiles.get(wallet.toLowerCase());
  return profile !== undefined && profile.totalVolume >= WHALE_THRESHOLD * 10n;
}

/**
 * Get tokens that whales are buying
 */
export function getWhaleAccumulatingTokens(): Array<{ token: Address; buyCount: number; totalVolume: bigint }> {
  const tokenStats: Map<string, { buyCount: number; totalVolume: bigint }> = new Map();

  // Only look at recent activities (last hour)
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  for (const activity of whaleActivities) {
    if (activity.timestamp < oneHourAgo) continue;
    if (activity.action !== 'buy') continue;

    const key = activity.token.toLowerCase();
    const existing = tokenStats.get(key) || { buyCount: 0, totalVolume: 0n };
    existing.buyCount++;
    existing.totalVolume += activity.amount;
    tokenStats.set(key, existing);
  }

  return Array.from(tokenStats.entries())
    .map(([token, stats]) => ({
      token: token as Address,
      buyCount: stats.buyCount,
      totalVolume: stats.totalVolume,
    }))
    .sort((a, b) => b.buyCount - a.buyCount);
}

/**
 * Format whale activity for display
 */
export function formatWhaleActivity(activity: WhaleActivity): string {
  const emoji = activity.action === 'buy' ? '🐋 BUY' : '🔴 SELL';
  const amount = formatEther(activity.amount);
  const shortWallet = `${activity.wallet.slice(0, 6)}...${activity.wallet.slice(-4)}`;
  const shortToken = `${activity.token.slice(0, 6)}...${activity.token.slice(-4)}`;
  return `${emoji} ${shortWallet} ${activity.action === 'buy' ? 'bought' : 'sold'} ${amount} MON of ${shortToken}`;
}
