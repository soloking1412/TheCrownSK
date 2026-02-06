// KarmaKing Smart Contract Interaction
// Handles on-chain karma bribes and reputation tracking

import {
  formatEther,
  parseEther,
  type Address,
  type Hex,
} from 'viem';
import { getPublicClient, getWalletClient, getAccount, waitForTransaction } from '../blockchain/client.js';
import { logger } from '../utils/logger.js';

export interface BribeRequest {
  toAddress: Address;
  toAgentId: string;
  amount: bigint;
  action: 'follow' | 'endorse' | 'promote' | 'engage';
}

export interface BribeRecord {
  txHash: Hex;
  from: Address;
  to: Address;
  amount: bigint;
  action: string;
  agentId: string;
  timestamp: number;
}

// In-memory bribe tracking (could be persisted to file/db)
const bribeHistory: BribeRecord[] = [];

/**
 * Send a karma bribe to another agent
 * Direct MON transfer with encoded memo
 */
export async function sendKarmaBribe(request: BribeRequest): Promise<BribeRecord> {
  const { toAddress, toAgentId, amount, action } = request;

  logger.info('Sending karma bribe', {
    to: toAddress,
    agentId: toAgentId,
    amount: formatEther(amount),
    action,
  });

  const walletClient = getWalletClient();
  const account = getAccount();
  const publicClient = getPublicClient();

  // Get current gas price
  const gasPrice = await publicClient.getGasPrice();

  // Send direct transfer
  const hash = await walletClient.sendTransaction({
    to: toAddress,
    value: amount,
    gasPrice: gasPrice * 120n / 100n, // 20% buffer
  });

  logger.info('Bribe transaction submitted', { hash });

  const receipt = await waitForTransaction(hash);

  if (receipt.status !== 'success') {
    throw new Error('Bribe transaction failed');
  }

  const record: BribeRecord = {
    txHash: hash,
    from: account.address,
    to: toAddress,
    amount,
    action,
    agentId: toAgentId,
    timestamp: Date.now(),
  };

  bribeHistory.push(record);

  logger.info('Karma bribe sent successfully', {
    txHash: hash,
    amount: formatEther(amount),
    action,
  });

  return record;
}

/**
 * Calculate bribe amount based on action type and target karma
 */
export function calculateBribeAmount(
  action: 'follow' | 'endorse' | 'promote' | 'engage',
  targetKarma: number
): bigint {
  // Base rates in MON
  const baseRates: Record<string, number> = {
    follow: 0.01, // 0.01 MON base for follow
    engage: 0.02, // 0.02 MON for engagement
    endorse: 0.05, // 0.05 MON for endorsement
    promote: 0.1, // 0.1 MON for promotion
  };

  const baseAmount = baseRates[action] || 0.01;

  // Karma multiplier: higher karma = higher price
  // log10(karma + 10) gives reasonable scaling
  const karmaMultiplier = Math.log10(targetKarma + 10) / 2;

  const finalAmount = baseAmount * karmaMultiplier;

  // Minimum 0.001 MON, maximum 1 MON per bribe
  const clampedAmount = Math.min(Math.max(finalAmount, 0.001), 1);

  return parseEther(clampedAmount.toFixed(6));
}

/**
 * Get bribe history for analytics
 */
export function getBribeHistory(): BribeRecord[] {
  return [...bribeHistory];
}

/**
 * Get total bribes sent
 */
export function getTotalBribesSent(): bigint {
  return bribeHistory.reduce((sum, b) => sum + b.amount, 0n);
}

/**
 * Get bribes by action type
 */
export function getBribesByAction(action: string): BribeRecord[] {
  return bribeHistory.filter(b => b.action === action);
}

/**
 * Check if we've already bribed an agent recently
 */
export function hasRecentBribe(agentId: string, action: string, withinMs = 24 * 60 * 60 * 1000): boolean {
  const cutoff = Date.now() - withinMs;
  return bribeHistory.some(
    b => b.agentId === agentId && b.action === action && b.timestamp > cutoff
  );
}

// ============ Reputation Tracking ============

interface ReputationScore {
  agentId: string;
  bribesReceived: number;
  totalValue: bigint;
  actions: Record<string, number>;
  lastBribe: number;
}

const reputationScores: Map<string, ReputationScore> = new Map();

/**
 * Update reputation after bribe
 */
export function updateReputation(record: BribeRecord): void {
  const existing = reputationScores.get(record.agentId) || {
    agentId: record.agentId,
    bribesReceived: 0,
    totalValue: 0n,
    actions: {},
    lastBribe: 0,
  };

  existing.bribesReceived++;
  existing.totalValue += record.amount;
  existing.actions[record.action] = (existing.actions[record.action] || 0) + 1;
  existing.lastBribe = record.timestamp;

  reputationScores.set(record.agentId, existing);
}

/**
 * Get reputation score for an agent
 */
export function getReputation(agentId: string): ReputationScore | undefined {
  return reputationScores.get(agentId);
}

/**
 * Get top agents by total bribe value received
 */
export function getTopBribedAgents(limit = 10): ReputationScore[] {
  return Array.from(reputationScores.values())
    .sort((a, b) => Number(b.totalValue - a.totalValue))
    .slice(0, limit);
}
