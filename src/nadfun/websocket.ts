import { createPublicClient, webSocket, type Address } from 'viem';
import { monad } from '../blockchain/chain.js';
import { NADFUN_CONTRACTS, WS_URL } from '../config/constants.js';
import { BONDING_CURVE_ROUTER_ABI } from './abis.js';
import { logger } from '../utils/logger.js';
import type { TokenEvent } from './types.js';

type EventHandler = (event: TokenEvent) => void;

export class NadFunWebSocket {
  private unwatch: (() => void) | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private isConnected = false;

  constructor() {
    this.handlers.set('create', new Set());
    this.handlers.set('buy', new Set());
    this.handlers.set('sell', new Set());
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      const wsClient = createPublicClient({
        chain: monad,
        transport: webSocket(WS_URL),
      });

      // Watch for bonding curve events
      this.unwatch = wsClient.watchContractEvent({
        address: NADFUN_CONTRACTS.BONDING_CURVE as Address,
        abi: BONDING_CURVE_ROUTER_ABI,
        onLogs: (logs) => {
          for (const log of logs) {
            this.handleLog(log);
          }
        },
        onError: (error) => {
          logger.error(`Contract event error: ${error.message}`);
        },
      });

      this.isConnected = true;
    } catch {
      // Silent fail - WebSocket is optional
      this.isConnected = false;
    }
  }

  private handleLog(log: unknown): void {
    try {
      const logData = log as { eventName?: string; args?: Record<string, unknown> };

      if (!logData.eventName) return;

      let eventType: TokenEvent['type'] | null = null;

      if (logData.eventName === 'CurveCreate') {
        eventType = 'create';
      } else if (logData.eventName === 'CurveBuy') {
        eventType = 'buy';
      } else if (logData.eventName === 'CurveSell') {
        eventType = 'sell';
      }

      if (eventType && logData.args) {
        const event: TokenEvent = {
          type: eventType,
          token: (logData.args.token as string) || '0x',
          timestamp: Date.now(),
          data: logData.args,
        };

        this.emit(eventType, event);
      }
    } catch (error) {
      logger.error(`Failed to handle log: ${error}`);
    }
  }

  private emit(type: string, event: TokenEvent): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          logger.error(`Event handler error: ${error}`);
        }
      }
    }
  }

  on(type: TokenEvent['type'], handler: EventHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.add(handler);
    }
  }

  off(type: TokenEvent['type'], handler: EventHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  disconnect(): void {
    if (this.unwatch) {
      this.unwatch();
      this.unwatch = null;
    }
    this.isConnected = false;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }
}

export const nadFunWs = new NadFunWebSocket();
