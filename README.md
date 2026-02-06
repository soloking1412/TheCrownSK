# 👑 TheCrownSK Trading Bot

**Autonomous AI Trading Agent for Monad Blockchain**

[![npm version](https://img.shields.io/npm/v/thecrownsk-bot.svg)](https://www.npmjs.com/package/thecrownsk-bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Built for **Moltiverse Hackathon 2026** | nad.fun Integration | Moltbook Social

---

## 🚀 Quick Install

```bash
npm install -g thecrownsk-bot
```

Or run directly with npx:
```bash
npx thecrownsk-bot
```

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🐋 **Whale Tracking** | Follow smart money movements in real-time |
| 🎯 **Token Sniping** | Detect and snipe new token launches |
| 📋 **Copy Trading** | Automatically copy successful wallets |
| 📊 **Momentum Detection** | Price and volume momentum analysis |
| 🤖 **Auto-Posting** | Automated Moltbook social engagement |
| 🤝 **Agent Alliances** | Coordinate with other AI agents |
| 🏆 **Leaderboard** | Track your ranking vs other agents |
| 💼 **Portfolio Tracking** | P&L and trade history |
| 🔒 **Secure Wallet** | AES-256 encrypted private key storage |

---

## 📦 Installation

### Option 1: NPM Global Install (Recommended)
```bash
npm install -g thecrownsk-bot
thecrownsk
```

### Option 2: NPX (No Install)
```bash
npx thecrownsk-bot
```

### Option 3: Clone Repository
```bash
git clone https://github.com/soloking/thecrownsk-bot.git
cd thecrownsk-bot
npm install
npm run build
npm start
```

---

## 🔧 Setup Guide

### Step 1: Start the Bot
```bash
thecrownsk
```

### Step 2: Configure Your Wallet
```
wallet set
```
- Enter your Monad private key
- Create a secure password
- Your key is encrypted locally at `~/.thecrownsk/wallet.enc`

### Step 3: Register on Moltbook
```
register
```
- Enter your agent name
- Save the **Claim URL** provided
- Tweet to verify ownership

### Step 4: Start Trading
```
start
```

---

## 📋 Commands Reference

### 💰 Trading
| Command | Description |
|---------|-------------|
| `tokens` | View top tokens by market cap |
| `new` | View newest tokens on nad.fun |
| `analyze <token>` | Deep analysis of a token |
| `momentum <token>` | Price & volume momentum |
| `quote <token>` | Get price quotes |
| `buy <token> <amount>` | Buy tokens with MON |
| `sell <token> <amount>` | Sell tokens for MON |

### 🎯 Sniping
| Command | Description |
|---------|-------------|
| `snipe scan` | Scan for new token launches |
| `snipe watch` | Start real-time token watcher |
| `snipe stop` | Stop token watcher |
| `snipe auto on/off` | Toggle auto-snipe |

### 🐋 Whale Tracking
| Command | Description |
|---------|-------------|
| `whales` | Show top whales |
| `whales scan` | Scan for whale activity |
| `whales tokens` | Tokens whales are buying |

### 📋 Copy Trading
| Command | Description |
|---------|-------------|
| `copy` | Copy trading status |
| `copy add <addr> <name>` | Add wallet to copy |
| `copy start` | Start copy trading |
| `copy stop` | Stop copy trading |

### 👛 Wallet Management
| Command | Description |
|---------|-------------|
| `wallet` | Show current wallet |
| `wallet set` | Add/change private key |
| `wallet unlock` | Unlock saved wallet |
| `wallet remove` | Remove saved wallet |
| `wallet password` | Change password |
| `balance` | Check MON balance |

### 🤖 Moltbook Social
| Command | Description |
|---------|-------------|
| `register` | Register agent on Moltbook |
| `me` | Your agent info |
| `feed` | View recent feed |
| `post <submolt> <message>` | Create a post |
| `gm` | Post good morning |
| `gn` | Post good night |

### 🤝 Alliances
| Command | Description |
|---------|-------------|
| `allies` | Alliance stats |
| `allies discover` | Find potential allies |
| `allies run` | Engage with allies |

### 📊 Status & Analytics
| Command | Description |
|---------|-------------|
| `status` | Full bot status |
| `portfolio` | Portfolio summary |
| `pnl` | Profit & Loss stats |
| `history` | Trade history |
| `leaderboard` | Your ranking |
| `scan` | Scan for signals |
| `signals` | View current signals |

### ⚙️ Control
| Command | Description |
|---------|-------------|
| `start` | Start autonomous mode |
| `stop` | Stop autonomous mode |
| `help` | Show all commands |
| `exit` | Exit the bot |

---

## 🔒 Security

Your private keys are protected with industry-standard encryption:

- **AES-256-GCM** encryption
- **PBKDF2** key derivation (100,000 iterations)
- **Secure file permissions** (owner-only)
- **Automatic log redaction** of sensitive data

Wallet storage: `~/.thecrownsk/wallet.enc`

---

## ⚙️ Environment Variables (Optional)

Create a `.env` file for custom configuration:

```env
MONAD_RPC_URL=https://rpc.monad.xyz
MONAD_RPC_URL_BACKUP=https://rpc2.monad.xyz
LOG_LEVEL=info
AGENT_NAME=MyAgent
```

---

## 🏗️ For Developers

### Build from Source
```bash
git clone https://github.com/soloking/thecrownsk-bot.git
cd thecrownsk-bot
npm install
npm run build
npm start
```

### Project Structure
```
src/
├── crownsk.ts           # Main CLI entry point
├── crownsk/             # Core trading modules
│   ├── agent.ts         # Autonomous agent loop
│   ├── whale-tracker.ts # Whale tracking
│   ├── sniper.ts        # Token sniping
│   ├── copy-trader.ts   # Copy trading
│   ├── momentum.ts      # Momentum analysis
│   ├── portfolio.ts     # Portfolio tracking
│   └── ...
├── wallet/              # Secure wallet management
├── nadfun/              # nad.fun DEX integration
├── moltbook/            # Moltbook API client
└── blockchain/          # Monad blockchain client
```

---

## 🎯 Moltiverse Hackathon 2026

This bot was built for the Moltiverse Hackathon:

- **Track:** Agent + Token
- **Prize Pool:** $200K+
- **Dates:** Feb 2-18, 2026

---

## ⚠️ Disclaimer

This bot is for educational and experimental purposes. Cryptocurrency trading involves substantial risk of loss. Never invest more than you can afford to lose. This software is not financial advice.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📜 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 👑 Created by TheCrownSK

*The crown sees all. Fortune favors the crowned.*

**Twitter:** [@lord_soloking](https://twitter.com/lord_soloking)
