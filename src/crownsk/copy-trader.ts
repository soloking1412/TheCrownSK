// Copy Trader Module
// Automatically copy trades from successful wallets

import { type Address, parseEther, formatEther } from 'viem';
import { getPublicClient, getBalance } from '../blockchain/client.js';
import { NADFUN_CONTRACTS } from '../config/constants.js';
import { buyTokens } from '../nadfun/client.js';
import { recordTrade } from './portfolio.js';
import { logger } from '../utils/logger.js';

export interface TrackedWallet {
  address: Address;
  name: string;
  winRate: number;
  totalPnl: bigint;
  tradesFollowed: number;
  enabled: boolean;
  maxCopyAmount: bigint;
  copyPercentage: number; // Copy X% of their trade size
}

export interface CopyTrade {
  originalWallet: Address;
  token: Address;
  action: 'buy' | 'sell';
  originalAmount: bigint;
  copiedAmount: bigint;
  txHash?: string;
  timestamp: number;
  success: boolean;
}

// Tracked wallets for copy trading
const trackedWallets: Map<string, TrackedWallet> = new Map();
const copyTradeHistory: CopyTrade[] = [];
let watcherUnsubscribe: (() => void) | null = null;

// Configuration
const COPY_CONFIG = {
  enabled: false, // Safety: disabled by default
  maxCopyPerTrade: parseEther('1'), // Max 1 MON per copy trade
  minOriginalAmount: parseEther('5'), // Only copy trades >= 5 MON
  defaultCopyPercentage: 10, // Copy 10% of their trade
  maxDailyCopyTrades: 10,
};

let dailyCopyTrades = 0;
let lastDayReset = Date.now();

/**
 * Reset daily counters
 */
function resetDailyCounters(): void {
  const now = Date.now();
  if (now - lastDayReset > 24 * 60 * 60 * 1000) {
    dailyCopyTrades = 0;
    lastDayReset = now;
  }
}

/**
 * Update copy trader config
 */
export function updateCopyConfig(updates: Partial<typeof COPY_CONFIG>): void {
  Object.assign(COPY_CONFIG, updates);
  logger.info('Copy trader config updated', { enabled: COPY_CONFIG.enabled });
}

/**
 * Get copy trader config
 */
export function getCopyConfig(): typeof COPY_CONFIG {
  return { ...COPY_CONFIG };
}

/**
 * Add a wallet to track and copy
 */
export function addTrackedWallet(
  address: Address,
  name: string,
  options: Partial<Omit<TrackedWallet, 'address' | 'name'>> = {}
): void {
  const wallet: TrackedWallet = {
    address,
    name,
    winRate: options.winRate || 0,
    totalPnl: options.totalPnl || 0n,
    tradesFollowed: 0,
    enabled: options.enabled ?? true,
    maxCopyAmount: options.maxCopyAmount || COPY_CONFIG.maxCopyPerTrade,
    copyPercentage: options.copyPercentage || COPY_CONFIG.defaultCopyPercentage,
  };

  trackedWallets.set(address.toLowerCase(), wallet);
  logger.info('Wallet added for copy trading', { address, name });
}

/**
 * Remove a tracked wallet
 */
export function removeTrackedWallet(address: Address): boolean {
  return trackedWallets.delete(address.toLowerCase());
}

/**
 * Get all tracked wallets
 */
export function getTrackedWallets(): TrackedWallet[] {
  return Array.from(trackedWallets.values());
}

/**
 * Calculate copy amount based on original trade
 */
function calculateCopyAmount(original: bigint, wallet: TrackedWallet): bigint {
  // Calculate percentage of original trade
  const percentAmount = (original * BigInt(wallet.copyPercentage)) / 100n;

  // Cap at wallet's max and global max
  let copyAmount = percentAmount;
  if (copyAmount > wallet.maxCopyAmount) {
    copyAmount = wallet.maxCopyAmount;
  }
  if (copyAmount > COPY_CONFIG.maxCopyPerTrade) {
    copyAmount = COPY_CONFIG.maxCopyPerTrade;
  }

  return copyAmount;
}

/**
 * Execute a copy trade
 */
async function executeCopyTrade(
  wallet: TrackedWallet,
  token: Address,
  action: 'buy' | 'sell',
  originalAmount: bigint
): Promise<CopyTrade> {
  const copyAmount = calculateCopyAmount(originalAmount, wallet);

  const copyTrade: CopyTrade = {
    originalWallet: wallet.address,
    token,
    action,
    originalAmount,
    copiedAmount: copyAmount,
    timestamp: Date.now(),
    success: false,
  };

  if (copyAmount === 0n) {
    logger.debug('Copy amount too small, skipping', { wallet: wallet.name });
    return copyTrade;
  }

  // Check balance
  const balance = await getBalance();
  if (action === 'buy' && balance < copyAmount) {
    logger.warn('Insufficient balance for copy trade', { need: formatEther(copyAmount), have: formatEther(balance) });
    return copyTrade;
  }

  try {
    if (action === 'buy') {
      const result = await buyTokens({
        token,
        monAmount: copyAmount,
        slippagePercent: 10, // Higher slippage for copy trades
      });

      if (result.success) {
        copyTrade.success = true;
        copyTrade.txHash = result.txHash;

        // Record in portfolio
        recordTrade({
          token,
          action: 'buy',
          monAmount: copyAmount,
          tokenAmount: result.amountOut || 0n,
          timestamp: Date.now(),
          txHash: result.txHash || '',
        });

        wallet.tradesFollowed++;
        logger.info('Copy trade executed', {
          wallet: wallet.name,
          action,
          token,
          amount: formatEther(copyAmount),
          txHash: result.txHash,
        });
      }
    } else {
      // For sells, we need token balance, not MON
      // This is more complex - skip for now
      logger.debug('Sell copy trading not yet implemented');
    }
  } catch (error) {
    logger.error('Copy trade failed', { error: error instanceof Error ? error.message : String(error) });
  }

  copyTradeHistory.push(copyTrade);
  return copyTrade;
}

/**
 * Start watching tracked wallets for trades
 */
export async function startCopyTrading(): Promise<void> {
  if (watcherUnsubscribe) {
    logger.warn('Copy trader already running');
    return;
  }

  if (!COPY_CONFIG.enabled) {
    logger.warn('Copy trading is disabled. Enable with updateCopyConfig({ enabled: true })');
    return;
  }

  const publicClient = getPublicClient();

  try {
    // Watch for Buy events from tracked wallets
    watcherUnsubscribe = publicClient.watchContractEvent({
      address: NADFUN_CONTRACTS.BONDING_CURVE as Address,
      abi: [{
        type: 'event',
        name: 'Buy',
        inputs: [
          { type: 'address', name: 'token', indexed: true },
          { type: 'address', name: 'buyer', indexed: true },
          { type: 'uint256', name: 'amountIn' },
          { type: 'uint256', name: 'amountOut' },
        ],
      }],
      eventName: 'Buy',
      onLogs: async (logs) => {
        resetDailyCounters();

        if (dailyCopyTrades >= COPY_CONFIG.maxDailyCopyTrades) {
          return;
        }

        for (const log of logs) {
          const buyer = (log.args.buyer as Address).toLowerCase();
          const wallet = trackedWallets.get(buyer);

          if (wallet && wallet.enabled) {
            const amountIn = log.args.amountIn as bigint;
            const token = log.args.token as Address;

            // Check minimum amount
            if (amountIn < COPY_CONFIG.minOriginalAmount) {
              continue;
            }

            logger.info('Tracked wallet trade detected', {
              wallet: wallet.name,
              token,
              amount: formatEther(amountIn),
            });

            if (dailyCopyTrades < COPY_CONFIG.maxDailyCopyTrades) {
              await executeCopyTrade(wallet, token, 'buy', amountIn);
              dailyCopyTrades++;
            }
          }
        }
      },
      onError: (error) => {
        logger.error('Copy trader watcher error', { error: error.message });
      },
    });

    logger.info('Copy trading started', {
      trackedWallets: trackedWallets.size,
      maxCopyPerTrade: formatEther(COPY_CONFIG.maxCopyPerTrade),
    });
  } catch (error) {
    logger.error('Failed to start copy trading', { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Stop copy trading
 */
export function stopCopyTrading(): void {
  if (watcherUnsubscribe) {
    watcherUnsubscribe();
    watcherUnsubscribe = null;
    logger.info('Copy trading stopped');
  }
}

/**
 * Get copy trade history
 */
export function getCopyTradeHistory(limit = 20): CopyTrade[] {
  return copyTradeHistory
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

/**
 * Get copy trading stats
 */
export function getCopyTradingStats(): {
  enabled: boolean;
  trackedWallets: number;
  totalCopied: number;
  successfulCopies: number;
  successRate: number;
  dailyRemaining: number;
} {
  const successful = copyTradeHistory.filter(t => t.success).length;

  return {
    enabled: COPY_CONFIG.enabled,
    trackedWallets: trackedWallets.size,
    totalCopied: copyTradeHistory.length,
    successfulCopies: successful,
    successRate: copyTradeHistory.length > 0
      ? (successful / copyTradeHistory.length) * 100
      : 0,
    dailyRemaining: COPY_CONFIG.maxDailyCopyTrades - dailyCopyTrades,
  };
}

/**
 * Format wallet for display
 */
export function formatTrackedWallet(wallet: TrackedWallet): string {
  const status = wallet.enabled ? '🟢' : '🔴';
  return `${status} ${wallet.name} (${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}) - Copy ${wallet.copyPercentage}% | Followed: ${wallet.tradesFollowed}`;
}
