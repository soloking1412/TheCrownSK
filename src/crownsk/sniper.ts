// Token Sniper Module
// Detects new token launches and provides early entry

import { type Address, parseAbiItem, formatEther, parseEther } from 'viem';
import { getPublicClient, getBalance } from '../blockchain/client.js';
import { NADFUN_CONTRACTS } from '../config/constants.js';
import { getTokenStatus, buyTokens } from '../nadfun/client.js';
import { logger } from '../utils/logger.js';

export interface NewToken {
  address: Address;
  creator: Address;
  blockNumber: bigint;
  txHash: string;
  timestamp: number;
  virtualMon: bigint;
  virtualToken: bigint;
}

export interface SnipeConfig {
  enabled: boolean;
  maxBuyAmount: bigint; // Max MON per snipe
  minCreatorBalance: bigint; // Min creator balance to trust
  blacklistedCreators: Set<string>;
  autoSnipe: boolean;
  slippage: number;
}

const DEFAULT_CONFIG: SnipeConfig = {
  enabled: true,
  maxBuyAmount: parseEther('0.5'),
  minCreatorBalance: parseEther('1'),
  blacklistedCreators: new Set(),
  autoSnipe: false, // Safety: manual by default
  slippage: 10,
};

let config = { ...DEFAULT_CONFIG };
const detectedTokens: NewToken[] = [];
let watcherUnsubscribe: (() => void) | null = null;

/**
 * Update sniper configuration
 */
export function updateSniperConfig(updates: Partial<SnipeConfig>): void {
  config = { ...config, ...updates };
  logger.info('Sniper config updated', { autoSnipe: config.autoSnipe, maxBuy: formatEther(config.maxBuyAmount) });
}

/**
 * Get sniper configuration
 */
export function getSniperConfig(): SnipeConfig {
  return { ...config };
}

/**
 * Scan for recently created tokens
 */
export async function scanNewTokens(blocksBack = 50): Promise<NewToken[]> {
  const publicClient = getPublicClient();
  const tokens: NewToken[] = [];

  try {
    const currentBlock = await publicClient.getBlockNumber();
    const fromBlock = currentBlock - BigInt(blocksBack);

    const logs = await publicClient.getLogs({
      address: NADFUN_CONTRACTS.BONDING_CURVE as Address,
      event: parseAbiItem('event Create(address indexed token, address indexed creator, uint256 virtualMon, uint256 virtualToken)'),
      fromBlock,
      toBlock: currentBlock,
    });

    for (const log of logs) {
      const token: NewToken = {
        address: log.args.token as Address,
        creator: log.args.creator as Address,
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
        timestamp: Date.now(),
        virtualMon: log.args.virtualMon as bigint,
        virtualToken: log.args.virtualToken as bigint,
      };

      tokens.push(token);

      // Store if not already tracked
      if (!detectedTokens.find(t => t.address.toLowerCase() === token.address.toLowerCase())) {
        detectedTokens.push(token);
      }
    }

    logger.info('New token scan complete', { found: tokens.length });
    return tokens;
  } catch (error) {
    logger.warn('New token scan failed', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

/**
 * Start watching for new tokens in real-time
 */
export async function startTokenWatcher(callback?: (token: NewToken) => void): Promise<void> {
  if (watcherUnsubscribe) {
    logger.warn('Token watcher already running');
    return;
  }

  const publicClient = getPublicClient();

  try {
    watcherUnsubscribe = publicClient.watchContractEvent({
      address: NADFUN_CONTRACTS.BONDING_CURVE as Address,
      abi: [{
        type: 'event',
        name: 'Create',
        inputs: [
          { type: 'address', name: 'token', indexed: true },
          { type: 'address', name: 'creator', indexed: true },
          { type: 'uint256', name: 'virtualMon' },
          { type: 'uint256', name: 'virtualToken' },
        ],
      }],
      eventName: 'Create',
      onLogs: async (logs) => {
        for (const log of logs) {
          const token: NewToken = {
            address: log.args.token as Address,
            creator: log.args.creator as Address,
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
            timestamp: Date.now(),
            virtualMon: log.args.virtualMon as bigint,
            virtualToken: log.args.virtualToken as bigint,
          };

          detectedTokens.push(token);
          logger.info('🚀 New token detected!', {
            address: token.address,
            creator: token.creator,
          });

          // Auto-snipe if enabled
          if (config.autoSnipe && config.enabled) {
            await attemptSnipe(token);
          }

          // Callback for UI updates
          if (callback) {
            callback(token);
          }
        }
      },
      onError: (error) => {
        logger.error('Token watcher error', { error: error.message });
      },
    });

    logger.info('Token watcher started');
  } catch (error) {
    logger.error('Failed to start token watcher', { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Stop token watcher
 */
export function stopTokenWatcher(): void {
  if (watcherUnsubscribe) {
    watcherUnsubscribe();
    watcherUnsubscribe = null;
    logger.info('Token watcher stopped');
  }
}

/**
 * Evaluate if a token is worth sniping
 */
export async function evaluateForSnipe(token: NewToken): Promise<{
  shouldSnipe: boolean;
  reason: string;
  recommendedAmount: bigint;
}> {
  const publicClient = getPublicClient();

  // Check if creator is blacklisted
  if (config.blacklistedCreators.has(token.creator.toLowerCase())) {
    return { shouldSnipe: false, reason: 'Creator is blacklisted', recommendedAmount: 0n };
  }

  // Check creator balance
  try {
    const creatorBalance = await publicClient.getBalance({ address: token.creator });
    if (creatorBalance < config.minCreatorBalance) {
      return {
        shouldSnipe: false,
        reason: `Creator balance too low: ${formatEther(creatorBalance)} MON`,
        recommendedAmount: 0n,
      };
    }
  } catch {
    // Continue anyway
  }

  // Check token status
  try {
    const status = await getTokenStatus(token.address);
    if (status.graduated) {
      return { shouldSnipe: false, reason: 'Token already graduated', recommendedAmount: 0n };
    }

    // Early tokens are better
    if (status.progressPercent > 10) {
      return {
        shouldSnipe: false,
        reason: `Token already ${status.progressPercent.toFixed(1)}% filled`,
        recommendedAmount: 0n,
      };
    }
  } catch {
    // New token, good to snipe
  }

  // Calculate recommended amount based on our balance
  const balance = await getBalance();
  const recommendedAmount = balance > config.maxBuyAmount
    ? config.maxBuyAmount
    : balance / 2n;

  return {
    shouldSnipe: true,
    reason: 'Token looks good for entry',
    recommendedAmount,
  };
}

/**
 * Attempt to snipe a token
 */
export async function attemptSnipe(token: NewToken, amount?: bigint): Promise<{
  success: boolean;
  txHash?: string;
  tokensReceived?: bigint;
  error?: string;
}> {
  if (!config.enabled) {
    return { success: false, error: 'Sniper is disabled' };
  }

  const evaluation = await evaluateForSnipe(token);
  if (!evaluation.shouldSnipe) {
    return { success: false, error: evaluation.reason };
  }

  const buyAmount = amount || evaluation.recommendedAmount;
  if (buyAmount === 0n) {
    return { success: false, error: 'No funds available for snipe' };
  }

  logger.info('Attempting snipe', {
    token: token.address,
    amount: formatEther(buyAmount),
  });

  try {
    const result = await buyTokens({
      token: token.address,
      monAmount: buyAmount,
      slippagePercent: config.slippage,
    });

    if (result.success) {
      logger.info('🎯 Snipe successful!', {
        token: token.address,
        spent: formatEther(buyAmount),
        received: formatEther(result.amountOut || 0n),
        txHash: result.txHash,
      });

      return {
        success: true,
        txHash: result.txHash,
        tokensReceived: result.amountOut,
      };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Snipe failed', { error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Get recently detected tokens
 */
export function getDetectedTokens(limit = 20): NewToken[] {
  return detectedTokens
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

/**
 * Blacklist a creator
 */
export function blacklistCreator(creator: Address): void {
  config.blacklistedCreators.add(creator.toLowerCase());
  logger.info('Creator blacklisted', { creator });
}

/**
 * Format new token for display
 */
export function formatNewToken(token: NewToken): string {
  const shortAddr = `${token.address.slice(0, 10)}...${token.address.slice(-6)}`;
  const shortCreator = `${token.creator.slice(0, 6)}...${token.creator.slice(-4)}`;
  const age = Math.floor((Date.now() - token.timestamp) / 1000);
  return `🆕 ${shortAddr} by ${shortCreator} (${age}s ago)`;
}
