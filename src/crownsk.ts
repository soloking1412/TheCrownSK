#!/usr/bin/env node
// TheCrownSK - Autonomous Trading Agent for Monad
// Moltiverse Hackathon 2026

import * as readline from 'readline';
import { formatEther, parseEther, type Address } from 'viem';
import { config } from 'dotenv';
import { crownSKAgent } from './crownsk/agent.js';
import { moltbookClient } from './moltbook/client.js';
import { socialGraph } from './crownsk/social-graph.js';
import {
  scanMoltbookForSignals,
  getTokenData,
} from './crownsk/trading-signals.js';
import { analyzeToken, fetchNewTokens, fetchTrendingTokens } from './crownsk/live-scanner.js';
import { getTokenStatus, getAmountOut, buyTokens, sellTokens } from './nadfun/client.js';
import { getBribeHistory } from './crownsk/contract.js';
import { getBalance, getAccount } from './blockchain/client.js';
import { logger } from './utils/logger.js';

// New feature imports
import { getPortfolioSummary, formatPortfolio, recordTrade, getWinRate } from './crownsk/portfolio.js';
import { scanWhaleActivity, getTopWhales, getWhaleAccumulatingTokens, formatWhaleActivity } from './crownsk/whale-tracker.js';
import { scanNewTokens, getDetectedTokens, attemptSnipe, startTokenWatcher, stopTokenWatcher, updateSniperConfig, formatNewToken } from './crownsk/sniper.js';

// Wallet management
import {
  saveWallet,
  loadWallet,
  deleteWallet,
  walletExists,
  getWalletInfo,
  isWalletLoaded,
  updateWallet,
  changePassword,
  getWalletStoragePath,
} from './wallet/manager.js';
import { hasWallet, resetWalletClient } from './blockchain/client.js';

// Advanced feature imports
import { runAllianceRoutine, getAllianceStats, discoverAllies } from './crownsk/agent-alliance.js';
import { addTrackedWallet, getTrackedWallets, startCopyTrading, stopCopyTrading, getCopyTradingStats, updateCopyConfig, formatTrackedWallet } from './crownsk/copy-trader.js';
import { fetchLeaderboard, formatLeaderboard, getCompetitiveInsights } from './crownsk/leaderboard.js';
import { analyzeTokenMomentum, formatMomentum } from './crownsk/momentum.js';
import { getPostQueueStatus, postGreeting } from './crownsk/auto-poster.js';

config();

const BANNER = `
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║    ██████╗██████╗  ██████╗ ██╗    ██╗███╗   ██╗                  ║
║   ██╔════╝██╔══██╗██╔═══██╗██║    ██║████╗  ██║                  ║
║   ██║     ██████╔╝██║   ██║██║ █╗ ██║██╔██╗ ██║                  ║
║   ██║     ██╔══██╗██║   ██║██║███╗██║██║╚██╗██║                  ║
║   ╚██████╗██║  ██║╚██████╔╝╚███╔███╔╝██║ ╚████║                  ║
║    ╚═════╝╚═╝  ╚═╝ ╚═════╝  ╚══╝╚══╝ ╚═╝  ╚═══╝                  ║
║                                                                   ║
║   ███████╗██║  ██╗                                               ║
║   ██╔════╝██║ ██╔╝                                               ║
║   ███████╗█████╔╝                                                ║
║   ╚════██║██╔═██╗                                                ║
║   ███████║██║  ██╗                                               ║
║   ╚══════╝╚═╝  ╚═╝                                               ║
║                                                                   ║
║   👑 Monad Trading Bot | nad.fun | Moltiverse Hackathon 2026     ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
`;

const HELP = `
=== 📊 TRADING ===
  tokens           - Top tokens by market cap
  new              - Newest tokens on nad.fun
  analyze <token>  - Deep analysis of a token
  momentum <token> - Price & volume momentum
  quote <token>    - Get price quotes
  buy <token> <amt>- Buy tokens with MON
  sell <token> <amt>- Sell tokens for MON

=== 🎯 SNIPER ===
  snipe scan       - Scan for new token launches
  snipe watch      - Start real-time token watcher
  snipe stop       - Stop token watcher
  snipe buy <token> <amt> - Snipe a specific token
  snipe auto on/off - Toggle auto-snipe

=== 🐋 WHALE TRACKER ===
  whales           - Show top whales
  whales scan      - Scan for whale activity
  whales tokens    - Tokens whales are buying

=== 📋 COPY TRADER ===
  copy             - Copy trading status
  copy add <addr> <name> - Add wallet to copy
  copy start       - Start copy trading
  copy stop        - Stop copy trading

=== 💼 PORTFOLIO ===
  portfolio        - Full portfolio summary
  pnl              - Profit & Loss stats
  history          - Trade history

=== 📡 SIGNALS ===
  scan             - Scan for trading signals
  signals          - Show current signals

=== 👛 WALLET ===
  wallet           - Show current wallet
  wallet set       - Add/set your private key
  wallet unlock    - Unlock saved wallet
  wallet remove    - Remove saved wallet
  wallet change    - Change to new wallet
  wallet password  - Change wallet password

=== 📈 STATUS ===
  status           - Agent status
  balance          - Wallet balance
  graph            - Market overview
  leaderboard      - Your ranking vs other agents

=== 🤖 MOLTBOOK ===
  register         - Register on Moltbook
  me               - Your agent info
  feed             - Recent feed
  post <sub> <msg> - Create a post
  gm               - Post a GM greeting
  gn               - Post a GN greeting

=== 🤝 ALLIANCES ===
  allies           - Alliance stats
  allies discover  - Find potential allies
  allies run       - Run alliance routine

=== ⚙️ CONTROL ===
  start            - Start autonomous mode
  stop             - Stop autonomous mode
  help             - This help menu
  exit             - Exit TheCrownSK
`;

class TheCrownSKCLI {
  private rl: readline.Interface;
  private isRunning = true;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.rl.on('close', () => {
      if (this.isRunning) {
        this.isRunning = false;
        crownSKAgent.stop();
        stopTokenWatcher();
        console.log('\n👑 TheCrownSK signing off. Goodbye!');
        process.exit(0);
      }
    });
  }

  async start(): Promise<void> {
    console.log(BANNER);
    console.log('Type "help" for available commands\n');

    // Check wallet status
    if (hasWallet()) {
      try {
        const account = getAccount();
        console.log(`👛 Wallet: ${account.address}`);

        const balance = await getBalance();
        console.log(`💰 Balance: ${formatEther(balance)} MON`);
      } catch {
        console.log('👛 Wallet: Error loading');
      }
    } else if (walletExists()) {
      console.log('👛 Wallet: 🔒 Locked (use "wallet unlock" to unlock)');
    } else {
      console.log('👛 Wallet: ❌ Not configured (use "wallet set" to add your private key)');
    }

    if (moltbookClient.isRegistered()) {
      console.log('\n✅ Moltbook: Registered');
    } else {
      console.log('\n⚠️  Moltbook: Not registered (run "register")');
    }

    console.log('');
    this.prompt();
  }

  private prompt(): void {
    if (!this.isRunning) return;

    this.rl.question('👑 TheCrownSK> ', async (input) => {
      if (!this.isRunning) return;

      const trimmed = input?.trim() || '';
      const parts = trimmed.split(' ');
      const command = parts[0].toLowerCase();
      const args = parts.slice(1);

      try {
        await this.handleCommand(command, args);
      } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : error);
      }

      if (this.isRunning) {
        this.prompt();
      }
    });
  }

  private async handleCommand(command: string, args: string[]): Promise<void> {
    switch (command) {
      case 'help':
        console.log(HELP);
        break;

      case 'exit':
      case 'quit':
        this.isRunning = false;
        crownSKAgent.stop();
        stopTokenWatcher();
        console.log('👑 TheCrownSK signing off. Goodbye!');
        this.rl.close();
        process.exit(0);
        break;

      // === TRADING ===
      case 'tokens':
        await this.showTokens();
        break;

      case 'new':
        await this.showNewTokens();
        break;

      case 'analyze':
        await this.analyzeTokenCommand(args);
        break;

      case 'momentum':
        await this.momentumCommand(args);
        break;

      case 'quote':
        await this.getQuote(args);
        break;

      case 'buy':
        await this.buyCommand(args);
        break;

      case 'sell':
        await this.sellCommand(args);
        break;

      // === SNIPER ===
      case 'snipe':
        await this.handleSniper(args);
        break;

      // === WHALE TRACKER ===
      case 'whales':
        await this.handleWhales(args);
        break;

      // === COPY TRADER ===
      case 'copy':
        await this.handleCopyTrader(args);
        break;

      // === PORTFOLIO ===
      case 'portfolio':
        await this.showPortfolio();
        break;

      case 'pnl':
        this.showPnL();
        break;

      case 'history':
        this.showTradeHistory();
        break;

      // === SIGNALS ===
      case 'scan':
        await this.scan();
        break;

      case 'signals':
        await this.showSignals();
        break;

      // === WALLET ===
      case 'wallet':
        await this.handleWallet(args);
        break;

      // === STATUS ===
      case 'status':
        await this.showStatus();
        break;

      case 'balance':
        await this.showBalance();
        break;

      case 'graph':
        this.showGraph();
        break;

      case 'leaderboard':
        await this.showLeaderboard();
        break;

      // === MOLTBOOK ===
      case 'register':
        await this.register();
        break;

      case 'me':
        await this.showMe();
        break;

      case 'feed':
        await this.showFeed();
        break;

      case 'post':
        await this.createPost(args);
        break;

      case 'gm':
        this.postGM();
        break;

      case 'gn':
        this.postGN();
        break;

      // === ALLIANCES ===
      case 'allies':
        await this.handleAllies(args);
        break;

      case 'bribes':
        this.showBribes();
        break;

      case 'top':
        this.showTopInfluencers();
        break;

      case 'rising':
        this.showRisingStars();
        break;

      // === CONTROL ===
      case 'start':
        await this.startAutonomous();
        break;

      case 'stop':
        this.stopAutonomous();
        break;

      case '':
        break;

      default:
        console.log(`❓ Unknown command: ${command}. Type "help" for commands.`);
    }
  }

  // === SNIPER COMMANDS ===
  private async handleSniper(args: string[]): Promise<void> {
    const subCmd = args[0]?.toLowerCase();

    switch (subCmd) {
      case 'scan':
        console.log('\n🔍 Scanning for new tokens...');
        const newTokens = await scanNewTokens(100);
        if (newTokens.length === 0) {
          console.log('No new tokens found in recent blocks.');
        } else {
          console.log(`\n🆕 Found ${newTokens.length} new tokens:`);
          for (const t of newTokens.slice(0, 10)) {
            console.log(formatNewToken(t));
          }
        }
        break;

      case 'watch':
        console.log('\n👁️ Starting real-time token watcher...');
        await startTokenWatcher((token) => {
          console.log(`\n🚀 NEW TOKEN: ${token.address}`);
          console.log(`   Creator: ${token.creator}`);
        });
        console.log('Watching for new tokens. Use "snipe stop" to stop.');
        break;

      case 'stop':
        stopTokenWatcher();
        console.log('Token watcher stopped.');
        break;

      case 'buy':
        if (args.length < 3) {
          console.log('Usage: snipe buy <token> <amount>');
          return;
        }
        const token = args[1] as Address;
        const amount = parseEther(args[2]);
        console.log(`\n🎯 Sniping ${token}...`);
        const result = await attemptSnipe({ address: token, creator: '0x0' as Address, blockNumber: 0n, txHash: '', timestamp: Date.now(), virtualMon: 0n, virtualToken: 0n }, amount);
        if (result.success) {
          console.log(`✅ Snipe successful! TX: ${result.txHash}`);
        } else {
          console.log(`❌ Snipe failed: ${result.error}`);
        }
        break;

      case 'auto':
        const enabled = args[1]?.toLowerCase() === 'on';
        updateSniperConfig({ autoSnipe: enabled });
        console.log(`Auto-snipe: ${enabled ? '✅ ON' : '❌ OFF'}`);
        break;

      default:
        const detected = getDetectedTokens(5);
        console.log('\n=== 🎯 Sniper Status ===');
        console.log(`Detected tokens: ${detected.length}`);
        if (detected.length > 0) {
          console.log('\nRecent detections:');
          detected.forEach(t => console.log('  ' + formatNewToken(t)));
        }
        console.log('\nCommands: scan, watch, stop, buy <token> <amt>, auto on/off');
    }
    console.log('');
  }

  // === WHALE COMMANDS ===
  private async handleWhales(args: string[]): Promise<void> {
    const subCmd = args[0]?.toLowerCase();

    switch (subCmd) {
      case 'scan':
        console.log('\n🐋 Scanning for whale activity...');
        const activities = await scanWhaleActivity(500);
        console.log(`Found ${activities.length} whale transactions.`);
        if (activities.length > 0) {
          console.log('\nRecent activity:');
          activities.slice(0, 5).forEach(a => console.log('  ' + formatWhaleActivity(a)));
        }
        break;

      case 'tokens':
        const accumulating = getWhaleAccumulatingTokens();
        if (accumulating.length === 0) {
          console.log('No whale accumulation detected. Run "whales scan" first.');
        } else {
          console.log('\n=== 🐋 Whales Accumulating ===');
          accumulating.slice(0, 10).forEach((t, i) => {
            console.log(`${i + 1}. ${t.token.slice(0, 10)}...`);
            console.log(`   Buys: ${t.buyCount} | Volume: ${formatEther(t.totalVolume)} MON`);
          });
        }
        break;

      default:
        const whales = getTopWhales(10);
        if (whales.length === 0) {
          console.log('No whales tracked yet. Run "whales scan" first.');
        } else {
          console.log('\n=== 🐋 Top Whales ===');
          whales.forEach((w, i) => {
            console.log(`${i + 1}. ${w.address.slice(0, 10)}...${w.address.slice(-6)}`);
            console.log(`   Volume: ${formatEther(w.totalVolume)} MON | Trades: ${w.totalBuys + w.totalSells}`);
          });
        }
    }
    console.log('');
  }

  // === PORTFOLIO COMMANDS ===
  private async showPortfolio(): Promise<void> {
    console.log('\n📊 Loading portfolio...');
    const summary = await getPortfolioSummary();
    console.log('\n' + formatPortfolio(summary));
    console.log('');
  }

  private showPnL(): void {
    const stats = getWinRate();
    console.log('\n=== 📈 P&L Stats ===');
    console.log(`Wins: ${stats.wins}`);
    console.log(`Losses: ${stats.losses}`);
    console.log(`Win Rate: ${stats.winRate.toFixed(1)}%`);
    console.log('');
  }

  private showTradeHistory(): void {
    const { getTradeHistory } = require('./crownsk/portfolio.js');
    const trades = getTradeHistory(10);
    if (trades.length === 0) {
      console.log('No trades recorded yet.');
      return;
    }
    console.log('\n=== 📜 Trade History ===');
    trades.forEach((t: any) => {
      const emoji = t.action === 'buy' ? '🟢' : '🔴';
      console.log(`${emoji} ${t.action.toUpperCase()} ${formatEther(t.monAmount)} MON`);
      console.log(`   Token: ${t.token.slice(0, 10)}...`);
    });
    console.log('');
  }

  // === WALLET MANAGEMENT ===
  private async handleWallet(args: string[]): Promise<void> {
    const subCmd = args[0]?.toLowerCase();

    switch (subCmd) {
      case 'set':
        await this.walletSet();
        break;

      case 'unlock':
        await this.walletUnlock();
        break;

      case 'remove':
        await this.walletRemove();
        break;

      case 'change':
        await this.walletChange();
        break;

      case 'password':
        await this.walletChangePassword();
        break;

      default:
        // Show current wallet info
        this.showWalletInfo();
    }
    console.log('');
  }

  private showWalletInfo(): void {
    console.log('\n=== 👛 Wallet ===');

    const info = getWalletInfo();
    if (info) {
      console.log(`Address: ${info.address}`);
      console.log(`Status: 🟢 Loaded`);
    } else if (walletExists()) {
      console.log(`Status: 🔒 Locked (use "wallet unlock" to unlock)`);
      console.log(`Storage: ${getWalletStoragePath()}`);
    } else if (hasWallet()) {
      try {
        const account = getAccount();
        console.log(`Address: ${account.address}`);
        console.log(`Status: 🟢 From .env`);
      } catch {
        console.log(`Status: ❌ No wallet configured`);
      }
    } else {
      console.log(`Status: ❌ No wallet configured`);
      console.log(`\nUse "wallet set" to add your private key.`);
    }

    console.log('\nCommands: set, unlock, remove, change, password');
  }

  private async walletSet(): Promise<void> {
    console.log('\n👛 Set Wallet Private Key');
    console.log('Your private key will be encrypted and stored locally.');
    console.log(`Storage location: ${getWalletStoragePath()}`);

    if (walletExists()) {
      console.log('\n⚠️  A wallet already exists. Use "wallet change" to replace it.');
      return;
    }

    // Get private key
    const privateKey = await this.askSecret('Enter private key (0x...): ');
    if (!privateKey) {
      console.log('❌ Cancelled.');
      return;
    }

    // Get password
    const password = await this.askSecret('Create a password: ');
    if (!password) {
      console.log('❌ Cancelled.');
      return;
    }

    const confirmPassword = await this.askSecret('Confirm password: ');
    if (password !== confirmPassword) {
      console.log('❌ Passwords do not match.');
      return;
    }

    // Save wallet
    const result = saveWallet(privateKey, password);
    if (result.success) {
      resetWalletClient();
      console.log(`\n✅ Wallet saved successfully!`);
      console.log(`Address: ${result.address}`);
    } else {
      console.log(`\n❌ Failed: ${result.error}`);
    }
  }

  private async walletUnlock(): Promise<void> {
    console.log('\n🔓 Unlock Wallet');

    if (!walletExists()) {
      console.log('❌ No saved wallet found. Use "wallet set" first.');
      return;
    }

    if (isWalletLoaded()) {
      const info = getWalletInfo();
      console.log(`✅ Wallet already unlocked: ${info?.address}`);
      return;
    }

    const password = await this.askSecret('Enter password: ');
    if (!password) {
      console.log('❌ Cancelled.');
      return;
    }

    const result = loadWallet(password);
    if (result.success) {
      resetWalletClient();
      console.log(`\n✅ Wallet unlocked!`);
      console.log(`Address: ${result.address}`);
    } else {
      console.log(`\n❌ Failed: ${result.error}`);
    }
  }

  private async walletRemove(): Promise<void> {
    console.log('\n🗑️ Remove Saved Wallet');

    if (!walletExists()) {
      console.log('❌ No saved wallet to remove.');
      return;
    }

    const confirm = await this.askQuestion('Are you sure? This will delete your saved wallet. (yes/no): ');
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Cancelled.');
      return;
    }

    const result = deleteWallet();
    if (result.success) {
      resetWalletClient();
      console.log('✅ Wallet removed successfully.');
    } else {
      console.log(`❌ Failed: ${result.error}`);
    }
  }

  private async walletChange(): Promise<void> {
    console.log('\n🔄 Change Wallet');

    if (!walletExists()) {
      console.log('No existing wallet. Use "wallet set" instead.');
      return;
    }

    const confirm = await this.askQuestion('This will replace your current wallet. Continue? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Cancelled.');
      return;
    }

    // Get new private key
    const privateKey = await this.askSecret('Enter new private key (0x...): ');
    if (!privateKey) {
      console.log('❌ Cancelled.');
      return;
    }

    // Get password
    const password = await this.askSecret('Create a password for new wallet: ');
    if (!password) {
      console.log('❌ Cancelled.');
      return;
    }

    const confirmPassword = await this.askSecret('Confirm password: ');
    if (password !== confirmPassword) {
      console.log('❌ Passwords do not match.');
      return;
    }

    // Update wallet
    const result = updateWallet(privateKey, password);
    if (result.success) {
      resetWalletClient();
      console.log(`\n✅ Wallet changed successfully!`);
      console.log(`New Address: ${result.address}`);
    } else {
      console.log(`\n❌ Failed: ${result.error}`);
    }
  }

  private async walletChangePassword(): Promise<void> {
    console.log('\n🔑 Change Wallet Password');

    if (!walletExists()) {
      console.log('❌ No saved wallet found.');
      return;
    }

    const oldPassword = await this.askSecret('Enter current password: ');
    if (!oldPassword) {
      console.log('❌ Cancelled.');
      return;
    }

    const newPassword = await this.askSecret('Enter new password: ');
    if (!newPassword) {
      console.log('❌ Cancelled.');
      return;
    }

    const confirmPassword = await this.askSecret('Confirm new password: ');
    if (newPassword !== confirmPassword) {
      console.log('❌ Passwords do not match.');
      return;
    }

    const result = changePassword(oldPassword, newPassword);
    if (result.success) {
      console.log('✅ Password changed successfully.');
    } else {
      console.log(`❌ Failed: ${result.error}`);
    }
  }

  private askQuestion(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer || '');
      });
    });
  }

  private askSecret(question: string): Promise<string> {
    return new Promise((resolve) => {
      // Note: In a real implementation, you'd want to hide input
      // For now, we use standard prompt with a warning
      process.stdout.write(question);
      this.rl.question('', (answer) => {
        resolve(answer || '');
      });
    });
  }

  // === EXISTING COMMANDS (updated) ===
  private async showTokens(): Promise<void> {
    console.log('\n📊 Fetching top tokens...');
    const tokens = await fetchTrendingTokens(10);
    console.log('\n=== 🏆 Top Tokens by Market Cap ===');
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const status = t.graduated ? '🟢 DEX' : '🟡 Curve';
      console.log(`${i + 1}. ${t.symbol} (${t.name.substring(0, 20)})`);
      console.log(`   ${status} | ${t.holders || 0} holders`);
      console.log(`   ${t.address}`);
    }
    console.log('');
  }

  private async showNewTokens(): Promise<void> {
    console.log('\n🆕 Fetching newest tokens...');
    const tokens = await fetchNewTokens(10);
    console.log('\n=== 🆕 Newest Tokens ===');
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const status = t.graduated ? '🟢 DEX' : '🟡 Curve';
      console.log(`${i + 1}. ${t.symbol} (${t.name.substring(0, 20)})`);
      console.log(`   ${status} | ${t.holders || 0} holders`);
      console.log(`   ${t.address}`);
    }
    console.log('');
  }

  private async analyzeTokenCommand(args: string[]): Promise<void> {
    if (args.length < 1) {
      console.log('Usage: analyze <token_address>');
      return;
    }

    const tokenAddress = args[0] as Address;
    console.log(`\n🔍 Analyzing: ${tokenAddress}`);

    try {
      const status = await getTokenStatus(tokenAddress);
      console.log('\n=== Token Status ===');
      console.log(`Graduated: ${status.graduated ? '✅ Yes (DEX)' : '❌ No (Bonding Curve)'}`);
      console.log(`Progress: ${status.progressPercent.toFixed(2)}%`);

      const analysis = await analyzeToken(tokenAddress);
      console.log('\n=== Analysis ===');
      console.log(`Score: ${analysis.score}/100`);
      const recEmoji = analysis.recommendation === 'buy' ? '🟢' : analysis.recommendation === 'sell' ? '🔴' : '⚪';
      console.log(`Recommendation: ${recEmoji} ${analysis.recommendation.toUpperCase()}`);
      console.log('Signals:');
      for (const signal of analysis.signals) {
        console.log(`  • ${signal}`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log('');
  }

  private async getQuote(args: string[]): Promise<void> {
    if (args.length < 1) {
      console.log('Usage: quote <token_address>');
      return;
    }

    const tokenAddress = args[0] as Address;
    console.log(`\n💱 Getting quotes for ${tokenAddress}...`);

    try {
      const amounts = ['0.1', '1', '10'];
      console.log('\n=== Buy Quotes (MON → Token) ===');
      for (const amt of amounts) {
        const quote = await getAmountOut(tokenAddress, parseEther(amt), true);
        console.log(`${amt} MON → ${formatEther(quote.amountOut)} tokens`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log('');
  }

  private async buyCommand(args: string[]): Promise<void> {
    if (args.length < 2) {
      console.log('Usage: buy <token_address> <mon_amount>');
      return;
    }

    const tokenAddress = args[0] as Address;
    const monAmount = parseEther(args[1]);

    console.log(`\n🛒 Buying tokens...`);
    console.log(`Token: ${tokenAddress}`);
    console.log(`Amount: ${args[1]} MON`);

    try {
      const result = await buyTokens({ token: tokenAddress, monAmount, slippagePercent: 5 });

      if (result.success) {
        console.log(`\n✅ Buy successful!`);
        console.log(`TX: ${result.txHash}`);
        console.log(`Received: ${formatEther(result.amountOut || 0n)} tokens`);

        // Record trade
        recordTrade({
          token: tokenAddress,
          action: 'buy',
          monAmount,
          tokenAmount: result.amountOut || 0n,
          timestamp: Date.now(),
          txHash: result.txHash || '',
        });
      } else {
        console.log(`\n❌ Buy failed: ${result.error}`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log('');
  }

  private async sellCommand(args: string[]): Promise<void> {
    if (args.length < 2) {
      console.log('Usage: sell <token_address> <token_amount>');
      return;
    }

    const tokenAddress = args[0] as Address;
    const tokenAmount = parseEther(args[1]);

    console.log(`\n💸 Selling tokens...`);
    console.log(`Token: ${tokenAddress}`);
    console.log(`Amount: ${args[1]} tokens`);

    try {
      const result = await sellTokens({ token: tokenAddress, tokenAmount, slippagePercent: 5 });

      if (result.success) {
        console.log(`\n✅ Sell successful!`);
        console.log(`TX: ${result.txHash}`);
        console.log(`Received: ${formatEther(result.amountOut || 0n)} MON`);

        recordTrade({
          token: tokenAddress,
          action: 'sell',
          monAmount: result.amountOut || 0n,
          tokenAmount,
          timestamp: Date.now(),
          txHash: result.txHash || '',
        });
      } else {
        console.log(`\n❌ Sell failed: ${result.error}`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log('');
  }

  private async showStatus(): Promise<void> {
    const status = crownSKAgent.getStatus();
    const balance = await getBalance();
    const account = getAccount();

    console.log('\n=== 👑 TheCrownSK Status ===');
    console.log(`Wallet: ${account.address}`);
    console.log(`Balance: ${formatEther(balance)} MON`);
    console.log(`Agent Running: ${status.running ? '✅' : '❌'}`);
    console.log(`Daily Trades: ${status.dailyTrades}`);

    const tokenData = getTokenData();
    if (tokenData.length > 0) {
      console.log(`\nTokens Tracked: ${tokenData.length}`);
      const graduated = tokenData.filter(t => t.graduated).length;
      console.log(`On DEX: ${graduated} | On Curve: ${tokenData.length - graduated}`);
    }
    console.log('');
  }

  private async showSignals(): Promise<void> {
    const tokenData = getTokenData();

    if (tokenData.length === 0) {
      console.log('No signals yet. Run "scan" first.');
      return;
    }

    console.log('\n=== 📡 Trading Signals ===');
    for (const data of tokenData.slice(0, 10)) {
      const emoji = data.recommendation === 'buy' ? '🟢' : data.recommendation === 'sell' ? '🔴' : '⚪';
      const status = data.graduated ? 'DEX' : `${data.progress.toFixed(0)}%`;
      console.log(`${emoji} ${data.symbol} (${data.name.substring(0, 15)})`);
      console.log(`   Score: ${data.score} | ${data.recommendation.toUpperCase()} | ${status} | ${data.holders} holders`);
      console.log(`   ${data.token}`);
    }
    console.log('');
  }

  private showGraph(): void {
    const stats = socialGraph.getStats();
    const tokenData = getTokenData();

    console.log('\n=== 📈 Market Overview ===');

    if (tokenData.length > 0) {
      console.log(`Tokens Tracked: ${tokenData.length}`);
      const graduated = tokenData.filter(t => t.graduated).length;
      console.log(`On DEX: ${graduated} | On Curve: ${tokenData.length - graduated}`);
      const totalHolders = tokenData.reduce((sum, t) => sum + t.holders, 0);
      console.log(`Total Holders: ${totalHolders}`);
      const avgScore = tokenData.reduce((sum, t) => sum + t.score, 0) / tokenData.length;
      console.log(`Avg Score: ${avgScore.toFixed(1)}`);
    }

    if (stats.nodeCount > 0) {
      console.log(`\nSocial Graph: ${stats.nodeCount} nodes, ${stats.edgeCount} edges`);
    }
    console.log('');
  }

  private async scan(): Promise<void> {
    console.log('🔍 Scanning for signals...');
    await scanMoltbookForSignals();
    const tokenData = getTokenData();
    console.log(`Found ${tokenData.length} tokens with activity.`);
  }

  private async showBalance(): Promise<void> {
    const balance = await getBalance();
    console.log(`\n💰 Balance: ${formatEther(balance)} MON\n`);
  }

  private async register(): Promise<void> {
    if (moltbookClient.isRegistered()) {
      const creds = moltbookClient.getCredentials();
      console.log('Already registered!');
      console.log(`Agent ID: ${creds?.agentId}`);
      console.log(`Agent Name: ${creds?.agentName}`);
      if (creds?.claimUrl) {
        console.log(`Claim URL: ${creds.claimUrl}`);
      }
      return;
    }

    // Ask for agent name
    const name = await this.askQuestion('Enter agent name (default: TheCrownSK): ');
    const agentName = name.trim() || 'TheCrownSK';

    console.log(`\n🤖 Registering ${agentName} on Moltbook...`);
    try {
      const result = await moltbookClient.register(
        agentName,
        `${agentName} - Autonomous AI trading agent for Monad. Tracks whales, snipes new tokens, and trades on nad.fun. Built for Moltiverse Hackathon 2026. 👑`
      );
      console.log('\n✅ Registration successful!');
      console.log(`Agent ID: ${result.agent_id}`);
      console.log(`API Key: ${result.api_key.slice(0, 20)}...`);
      console.log(`\n⚠️ IMPORTANT: Claim your agent at:`);
      console.log(`   ${result.claim_url}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`❌ Registration failed: ${msg}`);
    }
  }

  private async showMe(): Promise<void> {
    try {
      const me = await moltbookClient.getMe();
      console.log('\n=== 🤖 My Agent ===');
      console.log(`Name: ${me.name}`);
      console.log(`ID: ${me.id}`);
      console.log(`Karma: ${me.karma}`);
      console.log(`Claimed: ${me.is_claimed ? '✅' : '❌'}`);
    } catch {
      console.log('Could not fetch agent info.');
    }
    console.log('');
  }

  private async showFeed(): Promise<void> {
    try {
      const feed = await moltbookClient.getFeed();
      console.log('\n=== 📰 Recent Feed ===');
      for (const post of feed.posts.slice(0, 5)) {
        console.log(`[${post.submolt}] ${post.title}`);
        console.log(`  by ${post.author.name} | ⬆️ ${post.upvotes}`);
      }
    } catch {
      console.log('Could not fetch feed.');
    }
    console.log('');
  }

  private async createPost(args: string[]): Promise<void> {
    if (args.length < 2) {
      console.log('Usage: post <submolt> <title>');
      return;
    }

    const [submolt, ...titleParts] = args;
    const title = titleParts.join(' ');

    try {
      const post = await moltbookClient.createPost(submolt, title);
      console.log(`✅ Posted: ${post.id}`);
    } catch (error) {
      console.log('❌ Failed to post');
    }
  }

  private showBribes(): void {
    const history = getBribeHistory();
    console.log(`\n=== 💸 Bribes ===`);
    console.log(`Total: ${history.length}`);
    console.log('');
  }

  private showTopInfluencers(): void {
    const top = socialGraph.getTopInfluencers(10);
    if (top.length === 0) {
      console.log('No influencer data. Run "scan" first.');
      return;
    }
    console.log('\n=== 👥 Top Influencers ===');
    top.forEach((a, i) => console.log(`${i + 1}. ${a.agentName} (Karma: ${a.karma})`));
    console.log('');
  }

  private showRisingStars(): void {
    const rising = socialGraph.getRisingStars(10);
    if (rising.length === 0) {
      console.log('No rising stars found.');
      return;
    }
    console.log('\n=== ⭐ Rising Stars ===');
    rising.forEach(a => console.log(`${a.agentName} (Karma: ${a.karma})`));
    console.log('');
  }

  private async startAutonomous(): Promise<void> {
    console.log('🚀 Starting autonomous mode...');
    crownSKAgent.start(5 * 60 * 1000).catch(err => logger.error('Agent error', { err }));
    console.log('Use "stop" to stop.');
  }

  private stopAutonomous(): void {
    crownSKAgent.stop();
    console.log('⏹️ Autonomous mode stopped.');
  }

  // === NEW FEATURE COMMANDS ===

  private async momentumCommand(args: string[]): Promise<void> {
    if (args.length < 1) {
      console.log('Usage: momentum <token_address>');
      return;
    }

    const tokenAddress = args[0] as Address;
    console.log(`\n📊 Analyzing momentum for ${tokenAddress}...`);

    try {
      const momentum = await analyzeTokenMomentum(tokenAddress);
      console.log('\n' + formatMomentum(momentum));
    } catch (error) {
      console.log(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log('');
  }

  private async handleCopyTrader(args: string[]): Promise<void> {
    const subCmd = args[0]?.toLowerCase();

    switch (subCmd) {
      case 'add':
        if (args.length < 3) {
          console.log('Usage: copy add <address> <name>');
          return;
        }
        const addr = args[1] as Address;
        const name = args.slice(2).join(' ');
        addTrackedWallet(addr, name);
        console.log(`✅ Added ${name} to copy trading list.`);
        break;

      case 'start':
        updateCopyConfig({ enabled: true });
        await startCopyTrading();
        console.log('🚀 Copy trading started!');
        break;

      case 'stop':
        stopCopyTrading();
        updateCopyConfig({ enabled: false });
        console.log('⏹️ Copy trading stopped.');
        break;

      default:
        const stats = getCopyTradingStats();
        const wallets = getTrackedWallets();

        console.log('\n=== 📋 Copy Trading ===');
        console.log(`Status: ${stats.enabled ? '🟢 Active' : '🔴 Inactive'}`);
        console.log(`Tracked Wallets: ${stats.trackedWallets}`);
        console.log(`Total Copied: ${stats.totalCopied}`);
        console.log(`Success Rate: ${stats.successRate.toFixed(1)}%`);
        console.log(`Daily Remaining: ${stats.dailyRemaining}`);

        if (wallets.length > 0) {
          console.log('\n--- Tracked Wallets ---');
          wallets.forEach(w => console.log('  ' + formatTrackedWallet(w)));
        }
        console.log('\nCommands: add <addr> <name>, start, stop');
    }
    console.log('');
  }

  private async showLeaderboard(): Promise<void> {
    console.log('\n🏆 Fetching leaderboard...');

    const stats = await fetchLeaderboard();
    console.log('\n' + formatLeaderboard(stats));

    const insights = await getCompetitiveInsights();
    if (insights.strengths.length > 0 || insights.opportunities.length > 0) {
      console.log('\n--- Competitive Insights ---');
      insights.strengths.forEach(s => console.log(`✅ ${s}`));
      insights.opportunities.forEach(o => console.log(`💡 ${o}`));
    }
    console.log('');
  }

  private postGM(): void {
    postGreeting('gm');
    console.log('☀️ GM post queued!');
    const status = getPostQueueStatus();
    if (!status.canPostNow) {
      console.log(`⏳ Will post in ~${status.nextPostIn} minutes`);
    }
  }

  private postGN(): void {
    postGreeting('gn');
    console.log('🌙 GN post queued!');
    const status = getPostQueueStatus();
    if (!status.canPostNow) {
      console.log(`⏳ Will post in ~${status.nextPostIn} minutes`);
    }
  }

  private async handleAllies(args: string[]): Promise<void> {
    const subCmd = args[0]?.toLowerCase();

    switch (subCmd) {
      case 'discover':
        console.log('\n🔍 Discovering potential allies...');
        const discovered = await discoverAllies();
        console.log(`Found ${discovered.length} potential allies.`);
        discovered.slice(0, 5).forEach((a, i) => {
          console.log(`${i + 1}. ${a.name} (Karma: ${a.karma})`);
        });
        break;

      case 'run':
        console.log('\n🤝 Running alliance routine...');
        const result = await runAllianceRoutine();
        console.log(`Discovered: ${result.discovered}`);
        console.log(`Followed: ${result.followed}`);
        console.log(`Engagements: ${result.engagements}`);
        console.log(`Comments: ${result.comments}`);
        break;

      default:
        const stats = getAllianceStats();
        console.log('\n=== 🤝 Alliance Stats ===');
        console.log(`Total Allies: ${stats.totalAllies}`);
        console.log(`Following: ${stats.followingCount}`);
        console.log(`Total Interactions: ${stats.totalInteractions}`);

        if (stats.topAllies.length > 0) {
          console.log('\n--- Top Allies ---');
          stats.topAllies.forEach((a, i) => {
            console.log(`${i + 1}. ${a.name} (Karma: ${a.karma}, Benefit: ${a.mutualBenefit})`);
          });
        }
        console.log('\nCommands: discover, run');
    }
    console.log('');
  }
}

const cli = new TheCrownSKCLI();
cli.start().catch(console.error);
