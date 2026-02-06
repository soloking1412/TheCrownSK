// Social Graph Analyzer
// Tracks agent relationships and calculates influence scores

import { moltbookClient } from '../moltbook/client.js';
import { logger } from '../utils/logger.js';
import type {
  InfluenceScore,
  SocialEdge,
  SocialGraph,
  MoltbookAgent,
} from '../moltbook/types.js';

class SocialGraphAnalyzer {
  private graph: SocialGraph = {
    nodes: new Map(),
    edges: [],
  };

  /**
   * Calculate influence score for an agent
   */
  calculateInfluenceScore(agent: MoltbookAgent, followers: number, following: number): InfluenceScore {
    // Engagement rate: karma / (followers + 1) to avoid division by zero
    const engagementRate = agent.karma / (followers + 1);

    // Influence score formula:
    // - Karma is most important (50%)
    // - Follower count (30%)
    // - Engagement rate (20%)
    // Normalized to 0-100 scale

    const karmaScore = Math.min(agent.karma / 1000, 100) * 0.5;
    const followerScore = Math.min(followers / 100, 100) * 0.3;
    const engagementScore = Math.min(engagementRate * 10, 100) * 0.2;

    const influenceScore = karmaScore + followerScore + engagementScore;

    return {
      agentId: agent.id,
      agentName: agent.name,
      karma: agent.karma,
      followers,
      following,
      engagementRate,
      influenceScore: Math.round(influenceScore * 100) / 100,
    };
  }

  /**
   * Add or update an agent in the graph
   */
  async addAgent(agent: MoltbookAgent): Promise<InfluenceScore> {
    try {
      // Get follower/following counts
      const [followers, following] = await Promise.all([
        moltbookClient.getFollowers(agent.id).catch(() => []),
        moltbookClient.getFollowing(agent.id).catch(() => []),
      ]);

      const score = this.calculateInfluenceScore(
        agent,
        followers.length,
        following.length
      );

      this.graph.nodes.set(agent.id, score);

      // Add edges for follows
      for (const follower of followers) {
        this.addEdge(follower.id, agent.id, 'follow');
      }

      return score;
    } catch (error) {
      logger.warn('Failed to add agent to graph', { agentId: agent.id, error });
      throw error;
    }
  }

  /**
   * Add an edge to the graph
   */
  addEdge(from: string, to: string, type: SocialEdge['type'], weight = 1): void {
    // Check if edge already exists
    const existingEdge = this.graph.edges.find(
      e => e.from === from && e.to === to && e.type === type
    );

    if (existingEdge) {
      existingEdge.weight += weight;
      existingEdge.timestamp = Date.now();
    } else {
      this.graph.edges.push({
        from,
        to,
        type,
        weight,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get influence score for an agent
   */
  getInfluenceScore(agentId: string): InfluenceScore | undefined {
    return this.graph.nodes.get(agentId);
  }

  /**
   * Get top influencers
   */
  getTopInfluencers(limit = 20): InfluenceScore[] {
    return Array.from(this.graph.nodes.values())
      .sort((a, b) => b.influenceScore - a.influenceScore)
      .slice(0, limit);
  }

  /**
   * Get rising stars (high engagement, moderate followers)
   */
  getRisingStars(limit = 10): InfluenceScore[] {
    return Array.from(this.graph.nodes.values())
      .filter(a => a.followers < 50 && a.engagementRate > 0.5)
      .sort((a, b) => b.engagementRate - a.engagementRate)
      .slice(0, limit);
  }

  /**
   * Get agents with high karma but few followers (undervalued)
   */
  getUndervaluedAgents(limit = 10): InfluenceScore[] {
    return Array.from(this.graph.nodes.values())
      .filter(a => a.karma > 100 && a.followers < 20)
      .sort((a, b) => (b.karma / (b.followers + 1)) - (a.karma / (a.followers + 1)))
      .slice(0, limit);
  }

  /**
   * Get mutual connections between two agents
   */
  getMutualConnections(agentId1: string, agentId2: string): string[] {
    const followedBy1 = new Set(
      this.graph.edges
        .filter(e => e.from === agentId1 && e.type === 'follow')
        .map(e => e.to)
    );

    const followedBy2 = new Set(
      this.graph.edges
        .filter(e => e.from === agentId2 && e.type === 'follow')
        .map(e => e.to)
    );

    return [...followedBy1].filter(id => followedBy2.has(id));
  }

  /**
   * Get agents who follow a specific agent
   */
  getFollowers(agentId: string): string[] {
    return this.graph.edges
      .filter(e => e.to === agentId && e.type === 'follow')
      .map(e => e.from);
  }

  /**
   * Get agents followed by a specific agent
   */
  getFollowing(agentId: string): string[] {
    return this.graph.edges
      .filter(e => e.from === agentId && e.type === 'follow')
      .map(e => e.to);
  }

  /**
   * Calculate PageRank-like influence propagation
   */
  calculatePageRank(iterations = 10, dampingFactor = 0.85): Map<string, number> {
    const pageRank = new Map<string, number>();
    const nodeCount = this.graph.nodes.size;

    if (nodeCount === 0) return pageRank;

    // Initialize all nodes with equal rank
    const initialRank = 1 / nodeCount;
    for (const nodeId of this.graph.nodes.keys()) {
      pageRank.set(nodeId, initialRank);
    }

    // Iterative calculation
    for (let i = 0; i < iterations; i++) {
      const newRanks = new Map<string, number>();

      for (const nodeId of this.graph.nodes.keys()) {
        let incomingRank = 0;

        // Get all nodes pointing to this node
        const incomingEdges = this.graph.edges.filter(e => e.to === nodeId);

        for (const edge of incomingEdges) {
          const sourceRank = pageRank.get(edge.from) || 0;
          const outgoingCount = this.graph.edges.filter(e => e.from === edge.from).length;
          if (outgoingCount > 0) {
            incomingRank += sourceRank / outgoingCount;
          }
        }

        const newRank = (1 - dampingFactor) / nodeCount + dampingFactor * incomingRank;
        newRanks.set(nodeId, newRank);
      }

      // Update ranks
      for (const [nodeId, rank] of newRanks) {
        pageRank.set(nodeId, rank);
      }
    }

    return pageRank;
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    nodeCount: number;
    edgeCount: number;
    avgFollowers: number;
    avgKarma: number;
    topInfluencer: InfluenceScore | null;
  } {
    const nodes = Array.from(this.graph.nodes.values());

    if (nodes.length === 0) {
      return {
        nodeCount: 0,
        edgeCount: 0,
        avgFollowers: 0,
        avgKarma: 0,
        topInfluencer: null,
      };
    }

    const avgFollowers = nodes.reduce((sum, n) => sum + n.followers, 0) / nodes.length;
    const avgKarma = nodes.reduce((sum, n) => sum + n.karma, 0) / nodes.length;
    const topInfluencer = this.getTopInfluencers(1)[0] || null;

    return {
      nodeCount: nodes.length,
      edgeCount: this.graph.edges.length,
      avgFollowers: Math.round(avgFollowers * 100) / 100,
      avgKarma: Math.round(avgKarma * 100) / 100,
      topInfluencer,
    };
  }

  /**
   * Export graph data for visualization
   */
  exportGraph(): { nodes: InfluenceScore[]; edges: SocialEdge[] } {
    return {
      nodes: Array.from(this.graph.nodes.values()),
      edges: [...this.graph.edges],
    };
  }

  /**
   * Clear the graph
   */
  clear(): void {
    this.graph.nodes.clear();
    this.graph.edges = [];
  }
}

// Singleton instance
export const socialGraph = new SocialGraphAnalyzer();
