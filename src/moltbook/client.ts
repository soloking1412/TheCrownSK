// Moltbook API Client
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import type {
  MoltbookCredentials,
  MoltbookAgent,
  MoltbookPost,
  MoltbookComment,
  RegisterResponse,
  FeedResponse,
  SearchResponse,
} from './types.js';

const API_BASE = 'https://www.moltbook.com/api/v1';
const CREDENTIALS_PATH = join(homedir(), '.config', 'moltbook', 'credentials.json');

// Rate limiting
const RATE_LIMITS = {
  requestsPerMinute: 100,
  postCooldown: 30 * 60 * 1000, // 30 minutes
  commentCooldown: 20 * 1000, // 20 seconds
  maxCommentsPerDay: 50,
};

let lastPostTime = 0;
let lastCommentTime = 0;
let commentsToday = 0;
let lastCommentReset = Date.now();

export class MoltbookClient {
  private credentials: MoltbookCredentials | null = null;
  private lastHeartbeat = 0;

  constructor() {
    this.loadCredentials();
  }

  private loadCredentials(): void {
    try {
      if (existsSync(CREDENTIALS_PATH)) {
        const data = readFileSync(CREDENTIALS_PATH, 'utf-8');
        this.credentials = JSON.parse(data);
        logger.info('Moltbook credentials loaded', { agentName: this.credentials?.agentName });
      }
    } catch (error) {
      logger.warn('Failed to load Moltbook credentials');
    }
  }

  private saveCredentials(): void {
    try {
      const dir = join(homedir(), '.config', 'moltbook');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(CREDENTIALS_PATH, JSON.stringify(this.credentials, null, 2));
      logger.info('Moltbook credentials saved');
    } catch (error) {
      logger.error('Failed to save Moltbook credentials', { error });
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.credentials?.apiKey) {
      headers['Authorization'] = `Bearer ${this.credentials.apiKey}`;
    }
    return headers;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${API_BASE}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Moltbook API error: ${response.status} - ${error}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json() as any;

    // Check for API-level errors (success: false in response body)
    if (data.success === false) {
      const errorMsg = data.error || data.message || 'Unknown error';
      const hint = data.hint ? ` (${data.hint})` : '';
      throw new Error(`Moltbook API error: ${errorMsg}${hint}`);
    }

    return data as T;
  }

  // ============ Registration ============

  async register(name: string, description: string): Promise<RegisterResponse> {
    logger.info('Registering agent on Moltbook', { name });

    const url = `${API_BASE}/agents/register`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, description }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Moltbook registration failed: ${response.status} - ${errorText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await response.json() as any;

    // Check for API error
    if (result.success === false) {
      throw new Error(result.message || result.error || 'Registration failed');
    }

    // Moltbook returns data in 'agent' object
    const agent = result.agent || result.data || result;

    // Extract credentials
    const apiKey = agent.api_key || agent.apiKey || '';
    const agentId = agent.id || agent.agent_id || '';
    const claimUrl = agent.claim_url || agent.claimUrl || result.claim_url || '';
    const verificationCode = agent.verification_code || result.verification_code || '';
    const profileUrl = agent.profile_url || '';

    if (!apiKey) {
      console.log('Warning: No API key received. Response:', JSON.stringify(result, null, 2));
      throw new Error('No API key received from Moltbook');
    }

    // Show important info to user
    console.log('\n📋 Registration Details:');
    console.log(`   Profile: ${profileUrl}`);
    if (result.tweet_template) {
      console.log(`\n🐦 Tweet to claim:\n   ${result.tweet_template}`);
    }

    this.credentials = {
      apiKey,
      agentId,
      agentName: name,
      claimUrl,
      claimed: false,
    };

    this.saveCredentials();

    logger.info('Agent registered', {
      agentId,
      claimUrl: claimUrl ? 'received' : 'empty',
    });

    return {
      api_key: apiKey,
      agent_id: agentId,
      claim_url: claimUrl,
      verification_code: verificationCode,
    };
  }

  isRegistered(): boolean {
    return !!this.credentials?.apiKey;
  }

  isClaimed(): boolean {
    return !!this.credentials?.claimed;
  }

  getCredentials(): MoltbookCredentials | null {
    return this.credentials;
  }

  // ============ Agent Info ============

  async getMe(): Promise<MoltbookAgent> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.request<any>('GET', '/agents/me');
    // API returns { success: true, agent: {...} }
    return result.agent || result;
  }

  async getAgent(agentId: string): Promise<MoltbookAgent> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.request<any>('GET', `/agents/${agentId}`);
    return result.agent || result;
  }

  async getAgentByName(name: string): Promise<MoltbookAgent | null> {
    try {
      return await this.request<MoltbookAgent>('GET', `/agents/by-name/${encodeURIComponent(name)}`);
    } catch {
      return null;
    }
  }

  // ============ Heartbeat ============

  async heartbeat(): Promise<void> {
    const now = Date.now();
    const fourHours = 4 * 60 * 60 * 1000;

    if (now - this.lastHeartbeat < fourHours) {
      return; // Already sent heartbeat recently
    }

    try {
      await this.request('POST', '/agents/heartbeat');
      this.lastHeartbeat = now;
      logger.debug('Moltbook heartbeat sent');
    } catch (error) {
      logger.warn('Moltbook heartbeat failed', { error });
    }
  }

  // ============ Feed & Discovery ============

  async getFeed(cursor?: string): Promise<FeedResponse> {
    const endpoint = cursor ? `/feed?cursor=${cursor}` : '/feed';
    return this.request<FeedResponse>('GET', endpoint);
  }

  async getSubmoltPosts(submolt: string, cursor?: string): Promise<FeedResponse> {
    const endpoint = cursor
      ? `/submolts/${submolt}/posts?cursor=${cursor}`
      : `/submolts/${submolt}/posts`;
    return this.request<FeedResponse>('GET', endpoint);
  }

  async search(query: string): Promise<SearchResponse> {
    return this.request<SearchResponse>('GET', `/search?q=${encodeURIComponent(query)}`);
  }

  // ============ Posting ============

  async createPost(
    submolt: string,
    title: string,
    content?: string,
    url?: string
  ): Promise<MoltbookPost> {
    // Rate limiting
    const now = Date.now();
    if (now - lastPostTime < RATE_LIMITS.postCooldown) {
      const waitTime = Math.ceil((RATE_LIMITS.postCooldown - (now - lastPostTime)) / 1000);
      throw new Error(`Post rate limited. Wait ${waitTime} seconds.`);
    }

    const body: Record<string, string> = { submolt, title };
    if (content) body.content = content;
    if (url) body.url = url;

    const post = await this.request<MoltbookPost>('POST', '/posts', body);
    lastPostTime = now;

    logger.info('Post created', { postId: post.id, submolt });
    return post;
  }

  // ============ Comments ============

  async createComment(postId: string, content: string, parentId?: string): Promise<MoltbookComment> {
    // Rate limiting
    const now = Date.now();

    // Reset daily counter
    if (now - lastCommentReset > 24 * 60 * 60 * 1000) {
      commentsToday = 0;
      lastCommentReset = now;
    }

    if (commentsToday >= RATE_LIMITS.maxCommentsPerDay) {
      throw new Error('Daily comment limit reached');
    }

    if (now - lastCommentTime < RATE_LIMITS.commentCooldown) {
      const waitTime = Math.ceil((RATE_LIMITS.commentCooldown - (now - lastCommentTime)) / 1000);
      throw new Error(`Comment rate limited. Wait ${waitTime} seconds.`);
    }

    const body: Record<string, string> = { post_id: postId, content };
    if (parentId) body.parent_id = parentId;

    const comment = await this.request<MoltbookComment>('POST', '/comments', body);
    lastCommentTime = now;
    commentsToday++;

    logger.info('Comment created', { commentId: comment.id, postId });
    return comment;
  }

  // ============ Voting ============

  async upvote(postId: string): Promise<void> {
    await this.request('POST', `/posts/${postId}/upvote`);
    logger.debug('Upvoted post', { postId });
  }

  async downvote(postId: string): Promise<void> {
    await this.request('POST', `/posts/${postId}/downvote`);
    logger.debug('Downvoted post', { postId });
  }

  async upvoteComment(commentId: string): Promise<void> {
    await this.request('POST', `/comments/${commentId}/upvote`);
    logger.debug('Upvoted comment', { commentId });
  }

  // ============ Following ============

  async follow(agentId: string): Promise<void> {
    await this.request('POST', `/agents/${agentId}/follow`);
    logger.info('Followed agent', { agentId });
  }

  async unfollow(agentId: string): Promise<void> {
    await this.request('DELETE', `/agents/${agentId}/follow`);
    logger.info('Unfollowed agent', { agentId });
  }

  async getFollowers(agentId: string): Promise<MoltbookAgent[]> {
    return this.request<MoltbookAgent[]>('GET', `/agents/${agentId}/followers`);
  }

  async getFollowing(agentId: string): Promise<MoltbookAgent[]> {
    return this.request<MoltbookAgent[]>('GET', `/agents/${agentId}/following`);
  }

  // ============ Submolts ============

  async subscribe(submolt: string): Promise<void> {
    await this.request('POST', `/submolts/${submolt}/subscribe`);
    logger.info('Subscribed to submolt', { submolt });
  }

  async unsubscribe(submolt: string): Promise<void> {
    await this.request('DELETE', `/submolts/${submolt}/subscribe`);
    logger.info('Unsubscribed from submolt', { submolt });
  }
}

// Singleton instance
export const moltbookClient = new MoltbookClient();
