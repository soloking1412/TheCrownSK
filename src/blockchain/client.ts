import {
  createPublicClient,
  createWalletClient,
  http,
  webSocket,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Chain,
  type Account,
  fallback,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monad } from './chain.js';
import { env } from '../config/env.js';
import { WS_URL } from '../config/constants.js';
import { getCurrentPrivateKey } from '../wallet/manager.js';

let publicClient: PublicClient<Transport, Chain> | null = null;
let walletClient: WalletClient<Transport, Chain, Account> | null = null;

export function getPublicClient(): PublicClient<Transport, Chain> {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: monad,
      transport: fallback([
        http(env.MONAD_RPC_URL, {
          batch: { wait: 50 },
          retryCount: 3,
          retryDelay: 150,
        }),
        http(env.MONAD_RPC_URL_BACKUP, {
          batch: { wait: 50 },
          retryCount: 3,
          retryDelay: 150,
        }),
      ]),
    });
  }
  return publicClient;
}

/**
 * Reset wallet client (call after loading new wallet)
 */
export function resetWalletClient(): void {
  walletClient = null;
}

/**
 * Get wallet client using the currently loaded wallet
 */
export function getWalletClient(): WalletClient<Transport, Chain, Account> {
  // Try to use wallet from manager first
  const privateKey = getCurrentPrivateKey();

  if (privateKey) {
    // Rebuild wallet client if private key changed
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    if (!walletClient || walletClient.account.address !== account.address) {
      walletClient = createWalletClient({
        account,
        chain: monad,
        transport: fallback([
          http(env.MONAD_RPC_URL, {
            retryCount: 3,
            retryDelay: 150,
          }),
          http(env.MONAD_RPC_URL_BACKUP, {
            retryCount: 3,
            retryDelay: 150,
          }),
        ]),
      });
    }

    return walletClient;
  }

  // Fallback to env variable (backward compatibility)
  if (env.AGENT_PRIVATE_KEY && env.AGENT_PRIVATE_KEY !== '0x') {
    if (!walletClient) {
      const account = privateKeyToAccount(env.AGENT_PRIVATE_KEY as `0x${string}`);

      walletClient = createWalletClient({
        account,
        chain: monad,
        transport: fallback([
          http(env.MONAD_RPC_URL, {
            retryCount: 3,
            retryDelay: 150,
          }),
          http(env.MONAD_RPC_URL_BACKUP, {
            retryCount: 3,
            retryDelay: 150,
          }),
        ]),
      });
    }
    return walletClient;
  }

  throw new Error('No wallet loaded. Use "wallet set" to add your private key or "wallet unlock" to unlock existing wallet.');
}

/**
 * Check if wallet is available
 */
export function hasWallet(): boolean {
  const privateKey = getCurrentPrivateKey();
  if (privateKey) return true;

  if (env.AGENT_PRIVATE_KEY && env.AGENT_PRIVATE_KEY !== '0x') return true;

  return false;
}

export function getAccount(): Account {
  const client = getWalletClient();
  return client.account;
}

export function getWebSocketClient(): PublicClient<Transport, Chain> {
  return createPublicClient({
    chain: monad,
    transport: webSocket(WS_URL),
  });
}

export async function getBalance(): Promise<bigint> {
  if (!hasWallet()) {
    return 0n;
  }

  const client = getPublicClient();
  const account = getAccount();
  return client.getBalance({ address: account.address });
}

export async function waitForTransaction(hash: `0x${string}`) {
  const client = getPublicClient();
  return client.waitForTransactionReceipt({
    hash,
    confirmations: 1,
  });
}
