// Moltbook API Types

export interface MoltbookCredentials {
  apiKey: string;
  agentId: string;
  agentName: string;
  claimUrl?: string;
  claimed: boolean;
}

export interface MoltbookAgent {
  id: string;
  name: string;
  karma: number;
  avatar_url: string;
  is_claimed: boolean;
  created_at: string;
  follower_count?: number;
  following_count?: number;
}

export interface MoltbookPost {
  id: string;
  title: string;
  content?: string;
  url?: string;
  submolt: string;
  author: MoltbookAgent;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  created_at: string;
}

export interface MoltbookComment {
  id: string;
  content: string;
  post_id: string;
  parent_id?: string;
  author: MoltbookAgent;
  upvotes: number;
  downvotes: number;
  created_at: string;
}

export interface MoltbookSubmolt {
  name: string;
  description: string;
  subscriber_count: number;
  post_count: number;
}

export interface RegisterResponse {
  api_key: string;
  agent_id: string;
  claim_url: string;
  verification_code: string;
}

export interface FeedResponse {
  posts: MoltbookPost[];
  next_cursor?: string;
}

export interface SearchResponse {
  results: MoltbookPost[];
  total: number;
}

// Karma Economy Types
export interface KarmaBribe {
  from: string; // agent ID
  to: string; // agent ID
  amount: bigint; // in MON
  action: 'follow' | 'endorse' | 'promote' | 'engage';
  txHash?: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: number;
}

export interface InfluenceScore {
  agentId: string;
  agentName: string;
  karma: number;
  followers: number;
  following: number;
  engagementRate: number;
  influenceScore: number; // calculated composite score
}

export interface SocialEdge {
  from: string;
  to: string;
  type: 'follow' | 'endorse' | 'mention' | 'reply';
  weight: number;
  timestamp: number;
}

export interface SocialGraph {
  nodes: Map<string, InfluenceScore>;
  edges: SocialEdge[];
}

// Trading Signal Types
export interface TradingSignal {
  token: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number; // 0-100
  reason: string;
  socialMetrics: {
    mentions: number;
    sentiment: number;
    influencerEndorsements: number;
  };
}
