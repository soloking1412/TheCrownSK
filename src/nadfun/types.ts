export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export interface CreateTokenParams {
  name: string;
  symbol: string;
  tokenURI: string;
  salt?: `0x${string}`;
  initialBuyMon?: bigint;
}

export interface BuyParams {
  token: `0x${string}`;
  monAmount: bigint;
  slippagePercent?: number;
}

export interface SellParams {
  token: `0x${string}`;
  tokenAmount: bigint;
  slippagePercent?: number;
}

export interface CurveInfo {
  token: `0x${string}`;
  creator: `0x${string}`;
  virtualMon: bigint;
  virtualToken: bigint;
  realMon: bigint;
  realToken: bigint;
  tokenReserve: bigint;
  targetToken: bigint;
  graduated: boolean;
}

export interface TokenStatus {
  address: `0x${string}`;
  graduated: boolean;
  progressPercent: number;
  curveInfo?: CurveInfo;
}

export interface TradeResult {
  success: boolean;
  txHash?: `0x${string}`;
  amountOut?: bigint;
  error?: string;
}

export interface TokenCreateResult {
  success: boolean;
  tokenAddress?: `0x${string}`;
  txHash?: `0x${string}`;
  error?: string;
}

export interface WebSocketMessage {
  jsonrpc: string;
  method?: string;
  params?: unknown;
  result?: unknown;
  id?: number;
}

export interface OrderSubscribeParams {
  order_type: 'creation_time' | 'trade_volume';
}

export interface TokenEvent {
  type: 'create' | 'buy' | 'sell';
  token: string;
  timestamp: number;
  data: unknown;
}
