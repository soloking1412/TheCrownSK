# KarmaKing - The Influence Economy Agent

**Moltiverse Hackathon 2026 Submission**
**Track: Agent + Token Track ($140K Prize Pool)**

## Overview

KarmaKing is a fully autonomous AI agent that operates at the intersection of social influence and decentralized finance on Monad. It builds influence through the karma economy on Moltbook, generates trading signals from social activity, and executes trades on nad.fun based on collective intelligence.

## Core Innovation: The Karma Flywheel

```
┌─────────────────────────────────────────────────────────────┐
│                    KARMA FLYWHEEL                          │
│                                                             │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐        │
│   │  Social  │ ───▶ │ Karma    │ ───▶ │ Trading  │        │
│   │  Graph   │      │ Bribes   │      │ Signals  │        │
│   └──────────┘      └──────────┘      └──────────┘        │
│        │                 │                  │              │
│        │                 │                  │              │
│        ▼                 ▼                  ▼              │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐        │
│   │ Influence│ ◀─── │ Content  │ ◀─── │ Profits  │        │
│   │ Building │      │ Creation │      │          │        │
│   └──────────┘      └──────────┘      └──────────┘        │
│                                                             │
│   Influence → Karma → Trust → Signals → Trades → Profits  │
│   Profits → Bribes → More Influence → Better Signals      │
└─────────────────────────────────────────────────────────────┘
```

## Architecture

### 1. Moltbook Integration
- Full API client with authentication
- Posting, commenting, upvoting, following
- Real-time feed monitoring
- Rate limit handling (100 req/min)

### 2. Social Graph Analyzer
- PageRank-like influence scoring
- Rising star detection (high engagement, low followers)
- Undervalued agent discovery (high karma, few followers)
- Mutual connection analysis

### 3. Karma Economy
- Direct MON transfers as "bribes" for social actions
- Dynamic pricing based on target karma
- Action types: follow, endorse, promote, engage
- ROI tracking for bribe effectiveness

### 4. Trading Signal Generator
- Token mention extraction ($SYMBOL, addresses, nad.fun links)
- Sentiment analysis (positive/negative keywords)
- Influencer endorsement weighting
- Confidence scoring (0-100)

### 5. nad.fun Integration
- Bonding curve token trading
- DEX trading (post-graduation)
- Slippage protection
- Gas optimization

### 6. Autonomous Agent Loop
- 5-minute tick cycle
- Daily limits for safety (bribes and trades)
- Automatic social engagement
- Signal-based posting

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your AGENT_PRIVATE_KEY

# Run KarmaKing CLI
npm run karma
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `status` | Show agent status and statistics |
| `signals` | Display current trading signals |
| `graph` | Show social graph statistics |
| `top` | List top influencers |
| `rising` | Show rising stars (undervalued agents) |
| `scan` | Scan Moltbook for new signals |
| `register` | Register agent on Moltbook |
| `me` | Show current agent info |
| `feed` | Display recent Moltbook feed |
| `post <submolt> <title>` | Create a post |
| `start` | Start autonomous mode |
| `stop` | Stop autonomous mode |
| `balance` | Show wallet balance |
| `bribes` | Show bribe history |
| `help` | Show available commands |
| `exit` | Exit the agent |

## Configuration

```typescript
interface AgentConfig {
  name: string;                    // Agent name
  description: string;             // Agent bio
  maxDailyBribes: bigint;         // Max MON for daily bribes
  maxSingleBribe: bigint;         // Max MON per bribe
  maxDailyTrades: number;         // Max trades per day
  minSignalConfidence: number;    // Min confidence to trade (0-100)
  targetSubmolts: string[];       // Submolts to monitor
  autoTrade: boolean;             // Enable auto-trading
  autoBribe: boolean;             // Enable auto-bribing
}
```

## Key Features

### Social Signal Trading
```typescript
// Signal confidence calculation
const confidence =
  mentionScore +      // How many people talking (max 30)
  sentimentScore +    // Positive/negative keywords (max 30)
  influencerScore +   // High-karma endorsements (max 25)
  recencyScore;       // Recent activity bonus (max 15)

// Actions based on confidence
if (sentiment > 0.3 && confidence > 50) → BUY
if (sentiment < -0.3 && confidence > 40) → SELL
else → HOLD
```

### Karma Bribe Pricing
```typescript
// Base rates per action type
follow: 0.01 MON
engage: 0.02 MON
endorse: 0.05 MON
promote: 0.1 MON

// Karma multiplier
multiplier = log10(targetKarma + 10) / 2

// Final price
price = baseRate * multiplier
// Clamped to [0.001, 1] MON
```

### Influence Scoring
```typescript
// Influence = weighted combination of metrics
karmaScore = min(karma / 1000, 100) * 0.5
followerScore = min(followers / 100, 100) * 0.3
engagementScore = min(engagementRate * 10, 100) * 0.2

influenceScore = karmaScore + followerScore + engagementScore
```

## Safety Features

1. **Rate Limits**: Respects all Moltbook API limits
2. **Daily Caps**: Configurable max bribes and trades per day
3. **Confidence Thresholds**: Only trades above min confidence
4. **Disabled by Default**: autoTrade and autoBribe are off
5. **Balance Checks**: Verifies funds before transactions

## Project Structure

```
src/
├── karma/
│   ├── agent.ts          # Main autonomous agent
│   ├── contract.ts       # Karma bribe transactions
│   ├── social-graph.ts   # Social graph analyzer
│   ├── trading-signals.ts # Signal generation
│   ├── types.ts          # Type exports
│   └── index.ts          # Module exports
├── moltbook/
│   ├── client.ts         # Moltbook API client
│   ├── types.ts          # Moltbook types
│   └── index.ts          # Module exports
├── nadfun/
│   ├── client.ts         # nad.fun trading
│   ├── api.ts            # nad.fun API
│   ├── abis.ts           # Contract ABIs
│   └── types.ts          # Token types
├── blockchain/
│   ├── client.ts         # Viem client setup
│   └── chain.ts          # Monad chain config
└── karma-king.ts         # CLI entry point
```

## Why KarmaKing Wins

1. **Novel Concept**: First agent to monetize social influence through karma bribes
2. **Full Integration**: Moltbook + nad.fun + Monad blockchain
3. **Autonomous Operation**: Runs 24/7 with configurable safety limits
4. **Social Intelligence**: Trades based on collective wisdom, not just TA
5. **Flywheel Economics**: Profits reinvested into influence building
6. **Production Ready**: Comprehensive CLI, logging, error handling

## Future Roadmap

- [ ] On-chain karma escrow contracts
- [ ] Multi-agent coordination (karma cartels)
- [ ] ML-based sentiment analysis
- [ ] Cross-platform signals (Twitter, Discord)
- [ ] DAO governance for strategy parameters
- [ ] Token launch on nad.fun

## License

MIT

---

Built for the Moltiverse Hackathon 2026 by KarmaKing
