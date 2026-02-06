// TheCrownSK Autonomous Agent
// Main agent loop that orchestrates all functionality
// Moltiverse Hackathon 2026 - Full Feature Suite

import { moltbookClient } from '../moltbook/client.js';
import { socialGraph } from './social-graph.js';
import {
  calculateBribeAmount,
  hasRecentBribe,
} from './contract.js';
import {
  scanMoltbookForSignals,
  getTopBuySignals,
  executeTrade,
  cleanupOldData,
} from './trading-signals.js';
import { getBalance } from '../blockchain/client.js';
import { formatEther, parseEther } from 'viem';
import { logger } from '../utils/logger.js';
import type { InfluenceScore } from '../moltbook/types.js';

// New feature imports
import { autoGenerateContent, processPostQueue } from './auto-poster.js';
import { runAllianceRoutine, getAllianceStats } from './agent-alliance.js';
import { scanWhaleActivity } from './whale-tracker.js';
import { scanNewTokens } from './sniper.js';
import { getCompetitiveInsights } from './leaderboard.js';
import { PERSONALITY, getRandomCatchphrase } from './personality.js';

// Agent configuration
export interface AgentConfig {
  name: string;
  description: string;
  maxDailyBribes: bigint;
  maxSingleBribe: bigint;
  maxDailyTrades: number;
  minSignalConfidence: number;
  targetSubmolts: string[];
  autoTrade: boolean;
  autoBribe: boolean;
}

const DEFAULT_CONFIG: AgentConfig = {
  name: PERSONALITY.name,
  description: `${PERSONALITY.title} - An autonomous agent that hunts alpha, tracks whales, snipes new tokens, and dominates the Moltbook leaderboard. Built for Moltiverse Hackathon 2026. ${getRandomCatchphrase()}`,
  maxDailyBribes: parseEther('1'), // 1 MON max daily bribes
  maxSingleBribe: parseEther('0.1'), // 0.1 MON max per bribe
  maxDailyTrades: 10,
  minSignalConfidence: 60,
  targetSubmolts: ['crypto', 'monad', 'trading', 'agents', 'nadfun'],
  autoTrade: false, // Safety: disabled by default
  autoBribe: false, // Safety: disabled by default
};

class TheCrownSKAgent {
  private config: AgentConfig;
  private isRunning = false;
  private dailyBribes = 0n;
  private dailyTrades = 0;
  private lastDayReset = Date.now();

  constructor(config: Partial<AgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    logger.info('Initializing TheCrownSK agent...', { name: this.config.name });

    // Check wallet balance
    const balance = await getBalance();
    logger.info('Wallet balance', { balance: formatEther(balance) });

    if (balance === 0n) {
      logger.warn('Wallet has zero balance - trading will not work');
    }

    // Check if registered on Moltbook
    if (!moltbookClient.isRegistered()) {
      logger.info('Moltbook not registered - social features disabled');
      logger.info('Trading features work with live blockchain data');
    } else {
      // Get agent info
      try {
        const me = await moltbookClient.getMe();
        logger.info('Moltbook agent loaded', {
          name: me.name,
          karma: me.karma,
          claimed: me.is_claimed,
        });
      } catch {
        logger.warn('Could not fetch Moltbook agent info');
      }

      // Subscribe to target submolts
      for (const submolt of this.config.targetSubmolts) {
        try {
          await moltbookClient.subscribe(submolt);
        } catch {
          // May already be subscribed or submolt doesn't exist
        }
      }
    }

    logger.info('TheCrownSK agent initialized - ready for live trading');
  }

  /**
   * Reset daily counters
   */
  private resetDailyCounters(): void {
    const now = Date.now();
    if (now - this.lastDayReset > 24 * 60 * 60 * 1000) {
      this.dailyBribes = 0n;
      this.dailyTrades = 0;
      this.lastDayReset = now;
      cleanupOldData();
      logger.info('Daily counters reset');
    }
  }

  /**
   * Main agent loop iteration
   */
  async tick(): Promise<void> {
    this.resetDailyCounters();

    const hasMoltbook = moltbookClient.isRegistered();

    // Send heartbeat to Moltbook (only if registered)
    if (hasMoltbook) {
      await moltbookClient.heartbeat();
    }

    // Scan for trading signals (always works - uses live blockchain data)
    await scanMoltbookForSignals();

    // Scan for whale activity
    await scanWhaleActivity(100);

    // Scan for new tokens
    await scanNewTokens(50);

    // Build social graph from feed (only if Moltbook available)
    if (hasMoltbook) {
      await this.buildSocialGraph();
    }

    // Execute karma strategy (only if Moltbook available)
    if (this.config.autoBribe && hasMoltbook) {
      await this.executeKarmaStrategy();
    }

    // Execute trading strategy (always works - uses live blockchain)
    if (this.config.autoTrade) {
      await this.executeTradingStrategy();
    }

    // Engage with content (only if Moltbook available)
    if (hasMoltbook) {
      await this.engageWithContent();
    }

    // Run alliance routine (follow/engage with allies)
    if (hasMoltbook) {
      await runAllianceRoutine();
    }

    // Auto-generate and post content
    if (hasMoltbook) {
      await autoGenerateContent();
      await processPostQueue();
    }

    // Check leaderboard position
    if (hasMoltbook) {
      const insights = await getCompetitiveInsights();
      if (insights.rank) {
        logger.info('Leaderboard position', {
          rank: insights.rank,
          karmaToNextRank: insights.karmaToNextRank,
        });
      }
    }

    // Log status with live data
    const balance = await getBalance();
    const signals = getTopBuySignals(5);
    const allianceStats = getAllianceStats();

    logger.info('Tick complete', {
      moltbook: hasMoltbook,
      balance: formatEther(balance),
      dailyTrades: this.dailyTrades,
      buySignals: signals.length,
      allies: allianceStats.totalAllies,
    });
  }

  /**
   * Build social graph from recent activity
   */
  private async buildSocialGraph(): Promise<void> {
    if (!moltbookClient.isRegistered()) {
      logger.debug('Skipping social graph build - Moltbook not registered');
      return;
    }

    try {
      const feed = await moltbookClient.getFeed();

      for (const post of feed.posts) {
        try {
          await socialGraph.addAgent(post.author);
        } catch {
          // Ignore errors for individual agents
        }
      }

      const stats = socialGraph.getStats();
      logger.debug('Social graph updated', stats);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn('Failed to build social graph', { error: errorMsg });
    }
  }

  /**
   * Execute karma bribe strategy
   */
  private async executeKarmaStrategy(): Promise<void> {
    if (this.dailyBribes >= this.config.maxDailyBribes) {
      logger.debug('Daily bribe limit reached');
      return;
    }

    // Find valuable targets
    const targets = this.findBribeTargets();

    for (const target of targets.slice(0, 3)) {
      // Limit to 3 bribes per tick
      if (this.dailyBribes >= this.config.maxDailyBribes) break;

      try {
        await this.bribeAgent(target);
      } catch (error) {
        logger.warn('Bribe failed', { target: target.agentId, error });
      }
    }
  }

  /**
   * Find good targets for karma bribes
   */
  private findBribeTargets(): InfluenceScore[] {
    // Strategy: target undervalued agents (high karma, low followers)
    // These are likely to reciprocate and provide good ROI

    const undervalued = socialGraph.getUndervaluedAgents(10);
    const risingStars = socialGraph.getRisingStars(10);

    // Combine and dedupe
    const targets = new Map<string, InfluenceScore>();

    for (const agent of [...undervalued, ...risingStars]) {
      if (!hasRecentBribe(agent.agentId, 'follow')) {
        targets.set(agent.agentId, agent);
      }
    }

    return Array.from(targets.values());
  }

  /**
   * Bribe an agent
   */
  private async bribeAgent(target: InfluenceScore): Promise<void> {
    const amount = calculateBribeAmount('follow', target.karma);

    if (amount > this.config.maxSingleBribe) {
      logger.debug('Bribe amount exceeds max', {
        target: target.agentName,
        amount: formatEther(amount),
      });
      return;
    }

    // Check balance
    const balance = await getBalance();
    if (balance < amount) {
      logger.warn('Insufficient balance for bribe');
      return;
    }

    // For now, we don't have agent wallet addresses
    // In production, this would be resolved via Moltbook API or on-chain registry
    logger.info('Would bribe agent', {
      target: target.agentName,
      karma: target.karma,
      amount: formatEther(amount),
    });

    this.dailyBribes += amount;
  }

  /**
   * Execute trading strategy based on signals
   */
  private async executeTradingStrategy(): Promise<void> {
    if (this.dailyTrades >= this.config.maxDailyTrades) {
      logger.debug('Daily trade limit reached');
      return;
    }

    const buySignals = getTopBuySignals(3);

    for (const signal of buySignals) {
      if (signal.confidence < this.config.minSignalConfidence) continue;
      if (this.dailyTrades >= this.config.maxDailyTrades) break;

      try {
        const result = await executeTrade(signal);
        if (result.success) {
          this.dailyTrades++;
          logger.info('Trade executed', {
            token: signal.token,
            confidence: signal.confidence,
            txHash: result.txHash,
          });
        }
      } catch (error) {
        logger.warn('Trade failed', { signal, error });
      }
    }
  }

  /**
   * Engage with content (upvote, comment)
   */
  private async engageWithContent(): Promise<void> {
    if (!moltbookClient.isRegistered()) {
      logger.debug('Skipping engagement - Moltbook not registered');
      return;
    }

    try {
      const feed = await moltbookClient.getFeed();

      // Upvote quality content
      for (const post of feed.posts.slice(0, 5)) {
        // Simple quality heuristic: upvotes > 5 and from high-karma author
        if (post.upvotes > 5 && post.author.karma > 50) {
          try {
            await moltbookClient.upvote(post.id);
          } catch {
            // May have already upvoted
          }
        }
      }

      // Consider following high-karma authors
      for (const post of feed.posts.slice(0, 3)) {
        if (post.author.karma > 100) {
          try {
            await moltbookClient.follow(post.author.id);
          } catch {
            // May already be following
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn('Engagement failed', { error: errorMsg });
    }
  }

  /**
   * Start the agent loop
   */
  async start(intervalMs = 5 * 60 * 1000): Promise<void> {
    if (this.isRunning) {
      logger.warn('Agent is already running');
      return;
    }

    await this.initialize();

    this.isRunning = true;
    logger.info('TheCrownSK agent started', { interval: intervalMs });

    while (this.isRunning) {
      try {
        await this.tick();
      } catch (error) {
        logger.error('Agent tick failed', { error });
      }

      // Wait for next iteration
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  /**
   * Stop the agent loop
   */
  stop(): void {
    this.isRunning = false;
    logger.info('TheCrownSK agent stopped');
  }

  /**
   * Get agent status
   */
  getStatus(): {
    running: boolean;
    dailyBribes: string;
    dailyTrades: number;
    graphStats: ReturnType<typeof socialGraph.getStats>;
    balance?: string;
  } {
    return {
      running: this.isRunning,
      dailyBribes: formatEther(this.dailyBribes),
      dailyTrades: this.dailyTrades,
      graphStats: socialGraph.getStats(),
    };
  }
}

// Export singleton
export const crownSKAgent = new TheCrownSKAgent();

// Export class for custom instances
export { TheCrownSKAgent };
