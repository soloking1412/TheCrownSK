// Agent Alliance Module
// Coordinate with other agents on Moltbook for mutual benefit

import { moltbookClient } from '../moltbook/client.js';
import { socialGraph } from './social-graph.js';
import { logger } from '../utils/logger.js';

export interface AllyAgent {
  id: string;
  name: string;
  karma: number;
  followers: number;
  isFollowing: boolean;
  lastInteraction: number;
  interactionCount: number;
  mutualBenefit: number; // Score based on engagement
}

// Alliance tracking
const allies: Map<string, AllyAgent> = new Map();
const interactionLog: Array<{ agentId: string; type: string; timestamp: number }> = [];

// Configuration
const ALLIANCE_CONFIG = {
  maxAllies: 50,
  minKarmaToAlly: 10,
  dailyFollowLimit: 10,
  dailyUpvoteLimit: 50,
  dailyCommentLimit: 20,
};

let dailyFollows = 0;
let dailyUpvotes = 0;
let dailyComments = 0;
let lastDayReset = Date.now();

/**
 * Reset daily counters
 */
function resetDailyCounters(): void {
  const now = Date.now();
  if (now - lastDayReset > 24 * 60 * 60 * 1000) {
    dailyFollows = 0;
    dailyUpvotes = 0;
    dailyComments = 0;
    lastDayReset = now;
  }
}

/**
 * Discover potential allies from Moltbook feed
 */
export async function discoverAllies(): Promise<AllyAgent[]> {
  if (!moltbookClient.isRegistered()) {
    return [];
  }

  const discovered: AllyAgent[] = [];

  try {
    // Get feed and find active agents
    const feed = await moltbookClient.getFeed();

    for (const post of feed.posts) {
      const author = post.author;

      // Skip low-karma accounts
      if (author.karma < ALLIANCE_CONFIG.minKarmaToAlly) continue;

      // Check if already tracked
      if (!allies.has(author.id)) {
        const ally: AllyAgent = {
          id: author.id,
          name: author.name,
          karma: author.karma,
          followers: 0, // Would need to fetch
          isFollowing: false,
          lastInteraction: 0,
          interactionCount: 0,
          mutualBenefit: 0,
        };

        allies.set(author.id, ally);
        discovered.push(ally);
      }
    }

    // Also add agents from social graph
    const topInfluencers = socialGraph.getTopInfluencers(20);
    for (const inf of topInfluencers) {
      if (!allies.has(inf.agentId) && inf.karma >= ALLIANCE_CONFIG.minKarmaToAlly) {
        const ally: AllyAgent = {
          id: inf.agentId,
          name: inf.agentName,
          karma: inf.karma,
          followers: inf.followers,
          isFollowing: false,
          lastInteraction: 0,
          interactionCount: 0,
          mutualBenefit: inf.influenceScore,
        };

        allies.set(inf.agentId, ally);
        discovered.push(ally);
      }
    }

    logger.info('Discovered potential allies', { count: discovered.length });
    return discovered;
  } catch (error) {
    logger.warn('Failed to discover allies', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

/**
 * Follow high-value agents
 */
export async function buildAlliances(): Promise<number> {
  if (!moltbookClient.isRegistered()) {
    return 0;
  }

  resetDailyCounters();

  if (dailyFollows >= ALLIANCE_CONFIG.dailyFollowLimit) {
    logger.debug('Daily follow limit reached');
    return 0;
  }

  let followed = 0;

  // Sort allies by potential value
  const sortedAllies = Array.from(allies.values())
    .filter(a => !a.isFollowing)
    .sort((a, b) => (b.karma + b.mutualBenefit) - (a.karma + a.mutualBenefit));

  for (const ally of sortedAllies) {
    if (dailyFollows >= ALLIANCE_CONFIG.dailyFollowLimit) break;

    try {
      await moltbookClient.follow(ally.id);
      ally.isFollowing = true;
      ally.lastInteraction = Date.now();
      ally.interactionCount++;
      dailyFollows++;
      followed++;

      interactionLog.push({ agentId: ally.id, type: 'follow', timestamp: Date.now() });
      logger.info('Followed ally', { name: ally.name, karma: ally.karma });

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 1000));
    } catch {
      // May already be following
    }
  }

  return followed;
}

/**
 * Engage with ally content (upvote their posts)
 */
export async function engageWithAllies(): Promise<number> {
  if (!moltbookClient.isRegistered()) {
    return 0;
  }

  resetDailyCounters();

  if (dailyUpvotes >= ALLIANCE_CONFIG.dailyUpvoteLimit) {
    return 0;
  }

  let engagements = 0;

  try {
    const feed = await moltbookClient.getFeed();

    for (const post of feed.posts) {
      if (dailyUpvotes >= ALLIANCE_CONFIG.dailyUpvoteLimit) break;

      // Check if author is an ally
      const ally = allies.get(post.author.id);
      if (!ally) continue;

      // Upvote ally content
      try {
        await moltbookClient.upvote(post.id);
        ally.lastInteraction = Date.now();
        ally.interactionCount++;
        ally.mutualBenefit += 1;
        dailyUpvotes++;
        engagements++;

        interactionLog.push({ agentId: ally.id, type: 'upvote', timestamp: Date.now() });
      } catch {
        // May have already upvoted
      }
    }

    logger.info('Engaged with allies', { engagements });
    return engagements;
  } catch (error) {
    logger.warn('Failed to engage with allies', { error: error instanceof Error ? error.message : String(error) });
    return 0;
  }
}

/**
 * Comment on ally posts to boost engagement
 */
export async function commentOnAllyPosts(): Promise<number> {
  if (!moltbookClient.isRegistered()) {
    return 0;
  }

  resetDailyCounters();

  if (dailyComments >= ALLIANCE_CONFIG.dailyCommentLimit) {
    return 0;
  }

  const supportiveComments = [
    '👑 Great alpha! The crown approves.',
    '🔥 Solid insight. Following this closely.',
    '💎 Diamond hands content right here.',
    '📈 Bullish on this analysis. Well done!',
    '🎯 Spot on. The crown sees what you see.',
    '⭐ Quality post. Keep them coming!',
    '🐋 Whale-tier thinking. Respect.',
    '💰 This is the alpha we need. Thanks for sharing.',
  ];

  let comments = 0;

  try {
    const feed = await moltbookClient.getFeed();

    for (const post of feed.posts) {
      if (dailyComments >= ALLIANCE_CONFIG.dailyCommentLimit) break;

      const ally = allies.get(post.author.id);
      if (!ally) continue;

      // Only comment on high-engagement posts
      if (post.upvotes < 3) continue;

      // Check if we recently interacted
      if (ally.lastInteraction > Date.now() - 60 * 60 * 1000) continue; // 1 hour cooldown

      const comment = supportiveComments[Math.floor(Math.random() * supportiveComments.length)];

      try {
        await moltbookClient.createComment(post.id, comment);
        ally.lastInteraction = Date.now();
        ally.interactionCount++;
        ally.mutualBenefit += 2;
        dailyComments++;
        comments++;

        interactionLog.push({ agentId: ally.id, type: 'comment', timestamp: Date.now() });
        logger.info('Commented on ally post', { allyName: ally.name, postId: post.id });
      } catch {
        // May have already commented
      }
    }

    return comments;
  } catch (error) {
    logger.warn('Failed to comment on ally posts', { error: error instanceof Error ? error.message : String(error) });
    return 0;
  }
}

/**
 * Run full alliance routine
 */
export async function runAllianceRoutine(): Promise<{
  discovered: number;
  followed: number;
  engagements: number;
  comments: number;
}> {
  const discovered = (await discoverAllies()).length;
  const followed = await buildAlliances();
  const engagements = await engageWithAllies();
  const comments = await commentOnAllyPosts();

  return { discovered, followed, engagements, comments };
}

/**
 * Get alliance stats
 */
export function getAllianceStats(): {
  totalAllies: number;
  followingCount: number;
  totalInteractions: number;
  topAllies: AllyAgent[];
} {
  const alliesList = Array.from(allies.values());

  return {
    totalAllies: alliesList.length,
    followingCount: alliesList.filter(a => a.isFollowing).length,
    totalInteractions: interactionLog.length,
    topAllies: alliesList
      .sort((a, b) => b.mutualBenefit - a.mutualBenefit)
      .slice(0, 5),
  };
}

/**
 * Get specific ally info
 */
export function getAlly(agentId: string): AllyAgent | undefined {
  return allies.get(agentId);
}
