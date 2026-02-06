// Live Data Scanner for KarmaKing
// Fetches real token data from nad.fun API and blockchain

import { type Address, parseAbiItem } from 'viem';
import { getPublicClient } from '../blockchain/client.js';
import { getTokenStatus, getAmountOut } from '../nadfun/client.js';
import { NADFUN_CONTRACTS, NADFUN_API_BASE, NADFUN_ENDPOINTS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

const API_BASE = NADFUN_API_BASE;

export interface LiveToken {
  address: Address;
  name: string;
  symbol: string;
  creator: Address;
  createdAt: number;
  graduated: boolean;
  progress: number;
  marketCap?: string;
  volume24h?: string;
  priceChange24h?: number;
  holders?: number;
  imageUri?: string;
  description?: string;
}

export interface TokenActivity {
  token: Address;
  type: 'buy' | 'sell' | 'create';
  amount: bigint;
  user: Address;
  timestamp: number;
  txHash: string;
}

// nad.fun API response types
interface NadFunTokenInfo {
  token_id: string;
  name: string;
  symbol: string;
  image_uri: string;
  description: string;
  is_graduated: boolean;
  created_at: number;
  creator: {
    account_id: string;
    nickname: string;
  };
}

interface NadFunMarketInfo {
  market_type: 'CURVE' | 'DEX';
  token_id: string;
  reserve_native: string;
  reserve_token: string;
  token_price: string;
  price_usd: string;
  total_supply: string;
  volume: string;
  holder_count: number;
}

interface NadFunTokenResponse {
  token_info: NadFunTokenInfo;
  market_info: NadFunMarketInfo;
  percent: number;
}

interface NadFunOrderResponse {
  tokens: NadFunTokenResponse[];
  total_count: number;
}

/**
 * Convert nad.fun API response to LiveToken
 */
function convertToLiveToken(data: NadFunTokenResponse): LiveToken {
  return {
    address: data.token_info.token_id as Address,
    name: data.token_info.name,
    symbol: data.token_info.symbol,
    creator: data.token_info.creator.account_id as Address,
    createdAt: data.token_info.created_at * 1000,
    graduated: data.token_info.is_graduated || data.market_info.market_type === 'DEX',
    progress: data.percent || 0,
    marketCap: data.market_info.price_usd,
    volume24h: data.market_info.volume,
    holders: data.market_info.holder_count,
    imageUri: data.token_info.image_uri,
    description: data.token_info.description,
  };
}

/**
 * Fetch tokens by creation time (newest first)
 */
export async function fetchNewTokens(limit = 20): Promise<LiveToken[]> {
  try {
    const response = await fetch(`${API_BASE}${NADFUN_ENDPOINTS.TOKENS_BY_CREATION}?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    const data = await response.json() as NadFunOrderResponse;
    const tokens = data.tokens?.map(convertToLiveToken) || [];
    logger.info('Fetched new tokens from API', { count: tokens.length, total: data.total_count });
    return tokens;
  } catch (error) {
    logger.warn('Failed to fetch new tokens from API', {
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

/**
 * Fetch tokens by market cap (top tokens)
 */
export async function fetchTrendingTokens(limit = 20): Promise<LiveToken[]> {
  try {
    const response = await fetch(`${API_BASE}${NADFUN_ENDPOINTS.TOKENS_BY_MARKET_CAP}?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    const data = await response.json() as NadFunOrderResponse;
    const tokens = data.tokens?.map(convertToLiveToken) || [];
    logger.info('Fetched trending tokens by market cap', { count: tokens.length });
    return tokens;
  } catch (error) {
    logger.warn('Failed to fetch trending tokens from API', {
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

/**
 * Fetch tokens by market cap
 */
export async function fetchTopTokens(limit = 20): Promise<LiveToken[]> {
  try {
    const response = await fetch(`${API_BASE}${NADFUN_ENDPOINTS.TOKENS_BY_MARKET_CAP}?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    const data = await response.json() as NadFunOrderResponse;
    const tokens = data.tokens?.map(convertToLiveToken) || [];
    logger.info('Fetched top tokens by market cap', { count: tokens.length });
    return tokens;
  } catch (error) {
    logger.warn('Failed to fetch top tokens from API', {
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

/**
 * Get single token market info from API
 */
export async function getTokenMarketInfo(tokenAddress: Address): Promise<{
  marketType: 'CURVE' | 'DEX';
  reserveNative: bigint;
  reserveToken: bigint;
  price: string;
  priceUsd: string;
  holders: number;
} | null> {
  try {
    const response = await fetch(`${API_BASE}${NADFUN_ENDPOINTS.TOKEN_MARKET}/${tokenAddress}`);
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`API error: ${response.status}`);
    }
    const data = await response.json() as { market_info: NadFunMarketInfo };
    return {
      marketType: data.market_info.market_type,
      reserveNative: BigInt(data.market_info.reserve_native),
      reserveToken: BigInt(data.market_info.reserve_token),
      price: data.market_info.token_price,
      priceUsd: data.market_info.price_usd,
      holders: data.market_info.holder_count,
    };
  } catch (error) {
    logger.warn('Failed to fetch token market info', {
      token: tokenAddress,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Get token info directly from blockchain
 */
export async function getTokenInfoOnChain(tokenAddress: Address): Promise<LiveToken | null> {
  try {
    const status = await getTokenStatus(tokenAddress);

    return {
      address: tokenAddress,
      name: '',
      symbol: '',
      creator: '0x0000000000000000000000000000000000000000' as Address,
      createdAt: Date.now(),
      graduated: status.graduated,
      progress: status.progressPercent,
    };
  } catch (error) {
    logger.warn('Failed to get token info on-chain', {
      token: tokenAddress,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Fetch recent token activity (placeholder - would need websocket or indexer)
 */
export async function fetchTokenActivity(_tokenAddress?: Address, _limit = 50): Promise<TokenActivity[]> {
  // The nad.fun API doesn't expose activity endpoint publicly
  // This would need websocket or event indexing
  logger.debug('Token activity fetch not available via API');
  return [];
}

/**
 * Analyze token for trading signal
 */
export async function analyzeToken(tokenAddress: Address): Promise<{
  token: Address;
  score: number;
  signals: string[];
  recommendation: 'buy' | 'sell' | 'hold';
  marketInfo?: Awaited<ReturnType<typeof getTokenMarketInfo>>;
}> {
  const signals: string[] = [];
  let score = 50; // Neutral start

  // Try to get market info from API first
  const marketInfo = await getTokenMarketInfo(tokenAddress);

  if (marketInfo) {
    if (marketInfo.marketType === 'DEX') {
      signals.push('Token graduated to DEX');
      score += 10;
    }

    if (marketInfo.holders > 100) {
      signals.push(`High holder count: ${marketInfo.holders}`);
      score += 15;
    } else if (marketInfo.holders > 20) {
      signals.push(`Good holder count: ${marketInfo.holders}`);
      score += 5;
    } else if (marketInfo.holders < 5) {
      signals.push(`Low holder count: ${marketInfo.holders}`);
      score -= 10;
    }
  }

  try {
    const status = await getTokenStatus(tokenAddress);

    // Check graduation status
    if (status.graduated) {
      if (!signals.includes('Token graduated to DEX')) {
        signals.push('Token graduated to DEX');
        score += 10;
      }
    } else {
      // Check bonding curve progress
      const progress = status.progressPercent;
      if (progress > 80) {
        signals.push(`High bonding curve progress: ${progress.toFixed(1)}%`);
        score += 15;
      } else if (progress > 50) {
        signals.push(`Moderate progress: ${progress.toFixed(1)}%`);
        score += 5;
      } else if (progress < 20) {
        signals.push(`Early stage: ${progress.toFixed(1)}%`);
        score -= 5;
      }
    }

    // Check if we can get quote (token is tradeable)
    try {
      const quote = await getAmountOut(tokenAddress, 10n ** 17n, true); // 0.1 MON
      if (quote.amountOut > 0n) {
        signals.push('Token is actively tradeable');
        score += 5;
      }
    } catch {
      signals.push('Quote unavailable');
      score -= 10;
    }

  } catch (error) {
    signals.push('Failed to analyze token on-chain');
    score -= 20;
  }

  // Determine recommendation
  let recommendation: 'buy' | 'sell' | 'hold' = 'hold';
  if (score >= 70) {
    recommendation = 'buy';
  } else if (score <= 30) {
    recommendation = 'sell';
  }

  return {
    token: tokenAddress,
    score,
    signals,
    recommendation,
    marketInfo,
  };
}

/**
 * Fetch tokens from on-chain events (fallback when API unavailable)
 */
export async function fetchTokensFromChain(limit = 10): Promise<LiveToken[]> {
  const publicClient = getPublicClient();
  const tokens: LiveToken[] = [];

  try {
    // Get recent TokenCreated events from BondingCurve
    // RPC limits to 100 blocks per request
    const currentBlock = await publicClient.getBlockNumber();
    const batchSize = 99n; // Stay under 100 block limit
    const batches = 10; // Scan last 10 batches = 990 blocks

    for (let i = 0; i < batches && tokens.length < limit; i++) {
      const toBlock = currentBlock - (BigInt(i) * batchSize);
      const fromBlock = toBlock - batchSize;

      if (fromBlock < 0n) break;

      try {
        const logs = await publicClient.getLogs({
          address: NADFUN_CONTRACTS.BONDING_CURVE as Address,
          event: parseAbiItem('event Create(address indexed token, address indexed creator, uint256 virtualMon, uint256 virtualToken)'),
          fromBlock,
          toBlock,
        });

        // Process logs into tokens
        for (const log of logs) {
          if (tokens.length >= limit) break;

          const tokenAddress = log.args.token as Address;
          const creator = log.args.creator as Address;

          try {
            const status = await getTokenStatus(tokenAddress);
            tokens.push({
              address: tokenAddress,
              name: '',
              symbol: '',
              creator,
              createdAt: Date.now(),
              graduated: status.graduated,
              progress: status.progressPercent,
            });
          } catch {
            // Token may not exist anymore
          }
        }
      } catch (batchError) {
        // Log and continue to next batch
        logger.debug('Batch scan failed', { batch: i });
      }
    }

    logger.info('Fetched tokens from chain', { count: tokens.length });
  } catch (error) {
    logger.warn('Failed to fetch tokens from chain', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return tokens;
}

/**
 * Scan for live trading opportunities
 */
export async function scanLiveOpportunities(): Promise<Array<{
  token: LiveToken;
  analysis: Awaited<ReturnType<typeof analyzeToken>>;
}>> {
  const opportunities: Array<{
    token: LiveToken;
    analysis: Awaited<ReturnType<typeof analyzeToken>>;
  }> = [];

  // Try to get tokens from API first (by volume = trending)
  let tokens = await fetchTrendingTokens(10);

  // If API fails, try new tokens
  if (tokens.length === 0) {
    tokens = await fetchNewTokens(10);
  }

  // If still no tokens, fetch from on-chain events
  if (tokens.length === 0) {
    logger.info('No API data, scanning blockchain for tokens...');
    tokens = await fetchTokensFromChain(10);
  }

  // Analyze each token
  for (const token of tokens) {
    try {
      const analysis = await analyzeToken(token.address);
      opportunities.push({ token, analysis });
    } catch (error) {
      logger.warn('Failed to analyze token', {
        token: token.address,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Sort by score
  opportunities.sort((a, b) => b.analysis.score - a.analysis.score);

  logger.info('Live scan complete', {
    scanned: tokens.length,
    opportunities: opportunities.filter(o => o.analysis.recommendation === 'buy').length,
  });

  return opportunities;
}

/**
 * Get wallet token holdings
 */
export async function getWalletTokens(_walletAddress: Address): Promise<Array<{
  token: Address;
  balance: bigint;
  value?: bigint;
}>> {
  // This would require indexing or API support
  // For now return empty - would need to integrate with a token indexer
  logger.debug('Token holdings query not yet implemented');
  return [];
}
