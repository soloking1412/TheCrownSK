// Auto-Poster Module
// Automatically generates and posts content to Moltbook

import { moltbookClient } from '../moltbook/client.js';
import { logger } from '../utils/logger.js';
import {
  generateWhaleAlert,
  generateNewTokenAlert,
  generateMarketInsight,
  generateSignalPost,
  generateGreeting,
} from './personality.js';
import { getTokenData } from './trading-signals.js';
import { getWhaleAccumulatingTokens } from './whale-tracker.js';
import { getDetectedTokens, evaluateForSnipe } from './sniper.js';
import type { WhaleActivity } from './whale-tracker.js';
import type { NewToken } from './sniper.js';

// Rate limiting
let lastPostTime = 0;
const MIN_POST_INTERVAL = 30 * 60 * 1000; // 30 minutes (Moltbook allows 1 per 30 min)
const postQueue: Array<{ title: string; content: string; submolt: string }> = [];

/**
 * Check if we can post (rate limit)
 */
function canPost(): boolean {
  return Date.now() - lastPostTime >= MIN_POST_INTERVAL;
}

/**
 * Queue a post for later
 */
export function queuePost(submolt: string, title: string, content: string): void {
  postQueue.push({ submolt, title, content });
  logger.debug('Post queued', { submolt, title, queueLength: postQueue.length });
}

/**
 * Process the post queue
 */
export async function processPostQueue(): Promise<boolean> {
  if (!moltbookClient.isRegistered()) {
    return false;
  }

  if (!canPost()) {
    const waitTime = Math.ceil((MIN_POST_INTERVAL - (Date.now() - lastPostTime)) / 60000);
    logger.debug('Rate limited', { waitMinutes: waitTime });
    return false;
  }

  const post = postQueue.shift();
  if (!post) {
    return false;
  }

  try {
    await moltbookClient.createPost(post.submolt, post.title, post.content);
    lastPostTime = Date.now();
    logger.info('Posted to Moltbook', { submolt: post.submolt, title: post.title });
    return true;
  } catch (error) {
    // Re-queue on failure (unless rate limited)
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (!errorMsg.includes('rate')) {
      postQueue.unshift(post);
    }
    logger.warn('Post failed', { error: errorMsg });
    return false;
  }
}

/**
 * Generate and queue whale alert
 */
export function postWhaleAlert(activity: WhaleActivity): void {
  const { title, content } = generateWhaleAlert(
    activity.wallet,
    activity.action,
    activity.amount,
    activity.token
  );
  queuePost('trading', title, content);
}

/**
 * Generate and queue new token alert
 */
export async function postNewTokenAlert(token: NewToken): Promise<void> {
  const evaluation = await evaluateForSnipe(token);
  const { title, content } = generateNewTokenAlert(
    token.address,
    token.creator,
    evaluation
  );
  queuePost('crypto', title, content);
}

/**
 * Generate and post market insight
 */
export async function postMarketInsight(): Promise<void> {
  const tokenData = getTokenData();
  const whaleTokens = getWhaleAccumulatingTokens();

  if (tokenData.length === 0) {
    return;
  }

  const whalesBuying = whaleTokens.reduce((sum, t) => sum + t.buyCount, 0);
  const topToken = tokenData[0] ? { symbol: tokenData[0].symbol, holders: tokenData[0].holders } : null;
  const avgScore = tokenData.reduce((sum, t) => sum + t.score, 0) / tokenData.length;

  const { title, content } = generateMarketInsight({
    tokensTracked: tokenData.length,
    whalesBuying,
    whalesSelling: 0, // Would need to track this separately
    topToken,
    avgScore,
  });

  queuePost('monad', title, content);
}

/**
 * Post top trading signal
 */
export function postTopSignal(): void {
  const tokenData = getTokenData();
  if (tokenData.length === 0) return;

  // Find the best signal
  const best = tokenData.reduce((a, b) => a.score > b.score ? a : b);

  if (best.score < 60) return; // Only post strong signals

  const { title, content } = generateSignalPost({
    token: best.token,
    symbol: best.symbol,
    action: best.recommendation,
    score: best.score,
    holders: best.holders,
    signals: best.signals,
  });

  queuePost('trading', title, content);
}

/**
 * Post greeting (GM/GN)
 */
export function postGreeting(type: 'gm' | 'gn'): void {
  const { title, content } = generateGreeting(type);
  queuePost('monad', title, content);
}

/**
 * Auto-generate content based on activity
 */
export async function autoGenerateContent(): Promise<void> {
  if (!moltbookClient.isRegistered()) {
    return;
  }

  // Check recent whale activity
  const { getRecentWhaleActivity } = await import('./whale-tracker.js');
  const recentWhales = getRecentWhaleActivity(5);

  // Post whale alerts for very recent activity (last 10 minutes)
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const activity of recentWhales) {
    if (activity.timestamp > tenMinutesAgo) {
      postWhaleAlert(activity);
      break; // Only one whale alert per cycle
    }
  }

  // Check for new tokens
  const newTokens = getDetectedTokens(5);
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const token of newTokens) {
    if (token.timestamp > fiveMinutesAgo) {
      await postNewTokenAlert(token);
      break; // Only one token alert per cycle
    }
  }

  // Periodically post market insights
  const hour = new Date().getHours();
  if (hour === 9 || hour === 15 || hour === 21) {
    await postMarketInsight();
  }

  // GM at 8am, GN at 11pm (based on server time)
  if (hour === 8) {
    postGreeting('gm');
  } else if (hour === 23) {
    postGreeting('gn');
  }

  // Post top signal once a day
  if (hour === 12) {
    postTopSignal();
  }

  // Process the queue
  await processPostQueue();
}

/**
 * Get post queue status
 */
export function getPostQueueStatus(): {
  queueLength: number;
  canPostNow: boolean;
  nextPostIn: number;
} {
  const nextPostIn = canPost() ? 0 : Math.ceil((MIN_POST_INTERVAL - (Date.now() - lastPostTime)) / 60000);

  return {
    queueLength: postQueue.length,
    canPostNow: canPost(),
    nextPostIn,
  };
}
