// CrownSK Trading Bot
// Main entry point for nad.fun trading on Monad mainnet

export * from './crownsk/index.js';
export * from './nadfun/client.js';
export * from './blockchain/client.js';
export { logger } from './utils/logger.js';

// Run CrownSK CLI as default
import('./crownsk.js').catch(console.error);
