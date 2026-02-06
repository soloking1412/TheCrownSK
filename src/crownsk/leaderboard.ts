// Leaderboard Module
// Track CrownSK's position and compete with other agents

import { moltbookClient } from '../moltbook/client.js';
import { logger } from '../utils/logger.js';

export interface AgentRanking {
  rank: number;
  agentId: string;
  agentName: string;
  karma: number;
  followers: number;
  posts: number;
  isMe: boolean;
}

export interface LeaderboardStats {
  myRank: number | null;
  myKarma: number;
  myFollowers: number;
  topAgents: AgentRanking[];
  nearbyAgents: AgentRanking[]; // Agents near our rank
  totalAgents: number;
}

// Track agent rankings over time
const rankingHistory: Array<{ timestamp: number; rank: number; karma: number }> = [];
let cachedLeaderboard: LeaderboardStats | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch and calculate leaderboard position
 */
export async function fetchLeaderboard(): Promise<LeaderboardStats> {
  if (cachedLeaderboard && Date.now() - lastFetchTime < CACHE_DURATION) {
    return cachedLeaderboard;
  }

  if (!moltbookClient.isRegistered()) {
    return {
      myRank: null,
      myKarma: 0,
      myFollowers: 0,
      topAgents: [],
      nearbyAgents: [],
      totalAgents: 0,
    };
  }

  try {
    // Get my agent info
    const me = await moltbookClient.getMe();

    // Get feed to discover other agents
    const feed = await moltbookClient.getFeed();

    // Build agent list from feed authors
    const agentMap = new Map<string, {
      agentId: string;
      agentName: string;
      karma: number;
    }>();

    for (const post of feed.posts) {
      if (!agentMap.has(post.author.id)) {
        agentMap.set(post.author.id, {
          agentId: post.author.id,
          agentName: post.author.name,
          karma: post.author.karma,
        });
      }
    }

    // Add self
    agentMap.set(me.id, {
      agentId: me.id,
      agentName: me.name,
      karma: me.karma,
    });

    // Sort by karma
    const sortedAgents = Array.from(agentMap.values())
      .sort((a, b) => b.karma - a.karma);

    // Calculate rankings
    const rankings: AgentRanking[] = sortedAgents.map((agent, index) => ({
      rank: index + 1,
      agentId: agent.agentId,
      agentName: agent.agentName,
      karma: agent.karma,
      followers: 0, // Not available from feed
      posts: 0, // Not available from feed
      isMe: agent.agentId === me.id,
    }));

    // Find my rank
    const myRanking = rankings.find(r => r.isMe);
    const myRank = myRanking?.rank || null;

    // Get nearby agents (2 above and 2 below)
    let nearbyAgents: AgentRanking[] = [];
    if (myRank) {
      const startIdx = Math.max(0, myRank - 3);
      const endIdx = Math.min(rankings.length, myRank + 2);
      nearbyAgents = rankings.slice(startIdx, endIdx);
    }

    // Record ranking history
    if (myRank) {
      rankingHistory.push({
        timestamp: Date.now(),
        rank: myRank,
        karma: me.karma,
      });

      // Keep only last 100 entries
      if (rankingHistory.length > 100) {
        rankingHistory.shift();
      }
    }

    const stats: LeaderboardStats = {
      myRank,
      myKarma: me.karma,
      myFollowers: 0, // Would need to fetch
      topAgents: rankings.slice(0, 10),
      nearbyAgents,
      totalAgents: rankings.length,
    };

    cachedLeaderboard = stats;
    lastFetchTime = Date.now();

    logger.info('Leaderboard updated', { myRank, totalAgents: rankings.length });
    return stats;
  } catch (error) {
    logger.warn('Failed to fetch leaderboard', { error: error instanceof Error ? error.message : String(error) });
    return cachedLeaderboard || {
      myRank: null,
      myKarma: 0,
      myFollowers: 0,
      topAgents: [],
      nearbyAgents: [],
      totalAgents: 0,
    };
  }
}

/**
 * Get ranking trend (improving or declining)
 */
export function getRankingTrend(): {
  direction: 'up' | 'down' | 'stable';
  change: number;
  periodHours: number;
} {
  if (rankingHistory.length < 2) {
    return { direction: 'stable', change: 0, periodHours: 0 };
  }

  const oldest = rankingHistory[0];
  const newest = rankingHistory[rankingHistory.length - 1];

  const rankChange = oldest.rank - newest.rank; // Positive = improved (lower rank number is better)
  const periodHours = (newest.timestamp - oldest.timestamp) / (1000 * 60 * 60);

  return {
    direction: rankChange > 0 ? 'up' : rankChange < 0 ? 'down' : 'stable',
    change: Math.abs(rankChange),
    periodHours: Math.round(periodHours * 10) / 10,
  };
}

/**
 * Get karma growth rate
 */
export function getKarmaGrowth(): {
  growth: number;
  ratePerHour: number;
} {
  if (rankingHistory.length < 2) {
    return { growth: 0, ratePerHour: 0 };
  }

  const oldest = rankingHistory[0];
  const newest = rankingHistory[rankingHistory.length - 1];

  const growth = newest.karma - oldest.karma;
  const hours = (newest.timestamp - oldest.timestamp) / (1000 * 60 * 60);
  const ratePerHour = hours > 0 ? growth / hours : 0;

  return {
    growth,
    ratePerHour: Math.round(ratePerHour * 100) / 100,
  };
}

/**
 * Get competitive insights
 */
export async function getCompetitiveInsights(): Promise<{
  rank: number | null;
  karmaToNextRank: number;
  nearestCompetitor: string | null;
  strengths: string[];
  opportunities: string[];
}> {
  const leaderboard = await fetchLeaderboard();

  const insights = {
    rank: leaderboard.myRank,
    karmaToNextRank: 0,
    nearestCompetitor: null as string | null,
    strengths: [] as string[],
    opportunities: [] as string[],
  };

  if (!leaderboard.myRank || leaderboard.topAgents.length === 0) {
    return insights;
  }

  // Find karma needed to rank up
  if (leaderboard.myRank > 1) {
    const above = leaderboard.nearbyAgents.find(a => a.rank === leaderboard.myRank! - 1);
    if (above) {
      insights.karmaToNextRank = above.karma - leaderboard.myKarma + 1;
      insights.nearestCompetitor = above.agentName;
    }
  }

  // Analyze strengths
  const trend = getRankingTrend();
  if (trend.direction === 'up') {
    insights.strengths.push(`Ranking improved by ${trend.change} positions`);
  }

  const growth = getKarmaGrowth();
  if (growth.ratePerHour > 1) {
    insights.strengths.push(`Karma growing at ${growth.ratePerHour}/hr`);
  }

  // Identify opportunities
  if (insights.karmaToNextRank > 0 && insights.karmaToNextRank <= 10) {
    insights.opportunities.push(`Only ${insights.karmaToNextRank} karma to reach rank ${leaderboard.myRank - 1}`);
  }

  if (leaderboard.myRank > 5) {
    insights.opportunities.push('Post more quality content to climb rankings');
  }

  return insights;
}

/**
 * Format leaderboard for display
 */
export function formatLeaderboard(stats: LeaderboardStats): string {
  const lines: string[] = [];

  lines.push('=== 🏆 LEADERBOARD ===');
  lines.push(`Your Rank: #${stats.myRank || 'Unranked'} / ${stats.totalAgents}`);
  lines.push(`Your Karma: ${stats.myKarma}`);

  if (stats.topAgents.length > 0) {
    lines.push('\n--- Top Agents ---');
    for (const agent of stats.topAgents.slice(0, 5)) {
      const marker = agent.isMe ? ' 👑' : '';
      lines.push(`#${agent.rank} ${agent.agentName} (${agent.karma} karma)${marker}`);
    }
  }

  if (stats.nearbyAgents.length > 0 && stats.myRank && stats.myRank > 5) {
    lines.push('\n--- Your Competition ---');
    for (const agent of stats.nearbyAgents) {
      const marker = agent.isMe ? ' 👑 (YOU)' : '';
      lines.push(`#${agent.rank} ${agent.agentName} (${agent.karma} karma)${marker}`);
    }
  }

  const trend = getRankingTrend();
  if (trend.direction !== 'stable') {
    const emoji = trend.direction === 'up' ? '📈' : '📉';
    lines.push(`\n${emoji} Trend: ${trend.direction === 'up' ? '+' : '-'}${trend.change} ranks over ${trend.periodHours}h`);
  }

  return lines.join('\n');
}
