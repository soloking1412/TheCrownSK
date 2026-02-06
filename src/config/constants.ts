// Monad Mainnet Configuration
// KarmaKing Trading Bot for nad.fun

// Mainnet contract addresses
export const NADFUN_CONTRACTS = {
  WMON: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A',
  BONDING_CURVE_ROUTER: '0x6F6B8F1a20703309951a5127c45B49b1CD981A22',
  BONDING_CURVE: '0xA7283d07812a02AFB7C09B60f8896bCEA3F90aCE',
  LENS: '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea',
  DEX_ROUTER: '0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137',
  DEX_FACTORY: '0x6B5F564339DbAD6b780249827f2198a841FEB7F3',
} as const;

export const MONAD_CONTRACTS = {
  WMON: NADFUN_CONTRACTS.WMON,
  MULTICALL3: '0xcA11bde05977b3631167028862bE2a173976CA11',
  PERMIT2: '0x000000000022d473030f116ddee9f6b43ac78ba3',
  ENTRYPOINT_V07: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
} as const;

// RPC URLs
export const RPC_URL = process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz';
export const RPC_URL_BACKUP = process.env.MONAD_RPC_URL_BACKUP || 'https://rpc2.monad.xyz';
export const WS_URL = 'wss://rpc.monad.xyz';

// Chain ID
export const CHAIN_ID = 143; // Monad Mainnet

// nad.fun API
export const NADFUN_API_BASE = 'https://api.nadapp.net';

// API endpoints
export const NADFUN_ENDPOINTS = {
  // Token listing
  TOKENS_BY_CREATION: '/order/creation_time',
  TOKENS_BY_MARKET_CAP: '/order/market_cap',
  TOKENS_BY_LAST_REPLY: '/order/last_reply',
  TOKENS_GRADUATED: '/token/graduated',

  // Token details
  TOKEN_MARKET: '/token/market',
  TOKEN_INFO: '/token/info',

  // Token creation
  METADATA_IMAGE: '/metadata/image',
  METADATA_UPLOAD: '/metadata/metadata',
  TOKEN_SALT: '/token/salt',
} as const;

// Gas configuration
export const GAS_CONFIG = {
  GAS_PRICE: 52n * 10n ** 9n, // 52 gwei
  MAX_PRIORITY_FEE: 2n * 10n ** 9n, // 2 gwei
} as const;

// Bonding curve parameters
export const BONDING_CURVE_CONFIG = {
  VIRTUAL_MON_RESERVE: 90_000n * 10n ** 18n,
  VIRTUAL_TOKEN_RESERVE: 1_073_000_191n * 10n ** 18n,
  GRADUATION_TOKENS: 279_900_191n * 10n ** 18n,
  DEPLOY_FEE: 10n * 10n ** 18n, // 10 MON
  GRADUATION_FEE: 3000n * 10n ** 18n, // 3000 MON
} as const;

// RPC rate limits
export const RPC_RATE_LIMITS = {
  PRIMARY: { requests: 25, perSeconds: 1 },
  BACKUP: { requests: 300, perSeconds: 10 },
} as const;

// Network helper (always mainnet)
export const getCurrentNetwork = (): string => 'mainnet';
