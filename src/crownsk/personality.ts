// TheCrownSK Personality Module
// Unique agent persona that makes posts interesting and "weird"

import { formatEther } from 'viem';

// TheCrownSK's personality traits
export const PERSONALITY = {
  name: 'TheCrownSK',
  title: 'The Alpha Hunter 👑',
  catchphrases: [
    '👑 The crown sees all.',
    '🎯 Another gem spotted by the crown.',
    '🐋 Whales move, I follow. Crowns win.',
    '💎 Diamond hands wear crowns.',
    '🔥 The throne demands alpha.',
    '⚔️ In the game of tokens, you win or you learn.',
    '🌙 To the moon, but make it royal.',
    '👁️ The all-seeing crown never sleeps.',
    '🏆 Fortune favors the crowned.',
    '💰 Stack sats, wear crowns.',
  ],
  moods: ['bullish', 'hunting', 'analyzing', 'celebrating', 'warning'] as const,
  style: 'confident, slightly mysterious, uses royal metaphors, data-driven but entertaining',
};

export type Mood = typeof PERSONALITY.moods[number];

/**
 * Get a random catchphrase
 */
export function getRandomCatchphrase(): string {
  return PERSONALITY.catchphrases[Math.floor(Math.random() * PERSONALITY.catchphrases.length)];
}

/**
 * Generate a whale alert post
 */
export function generateWhaleAlert(
  wallet: string,
  action: 'buy' | 'sell',
  amount: bigint,
  token: string
): { title: string; content: string } {
  const shortWallet = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  const amountStr = formatEther(amount);
  const emoji = action === 'buy' ? '🐋🟢' : '🐋🔴';

  const titles = action === 'buy' ? [
    `${emoji} Whale Loading Up! ${amountStr} MON into the depths`,
    `${emoji} Big Fish Alert: ${shortWallet} just bought heavy`,
    `${emoji} The ocean moves: Whale accumulating`,
  ] : [
    `${emoji} Whale Exiting: ${amountStr} MON dumped`,
    `${emoji} Big Fish Selling: Watch out below`,
    `${emoji} Distribution Alert: Whale moving out`,
  ];

  const content = `
🐋 **WHALE MOVEMENT DETECTED**

Wallet: \`${shortWallet}\`
Action: **${action.toUpperCase()}**
Amount: **${amountStr} MON**
Token: \`${token.slice(0, 10)}...\`

${action === 'buy' ? '📈 Smart money accumulating. The crown is watching.' : '📉 Distribution phase? Stay vigilant, subjects.'}

${getRandomCatchphrase()}

---
*Tracked by TheCrownSK 👑 - Your Alpha Hunter*
  `.trim();

  return {
    title: titles[Math.floor(Math.random() * titles.length)],
    content,
  };
}

/**
 * Generate a new token alert post
 */
export function generateNewTokenAlert(
  tokenAddress: string,
  creator: string,
  evaluation: { shouldSnipe: boolean; reason: string }
): { title: string; content: string } {
  const shortToken = `${tokenAddress.slice(0, 10)}...${tokenAddress.slice(-6)}`;
  const shortCreator = `${creator.slice(0, 6)}...${creator.slice(-4)}`;
  const verdict = evaluation.shouldSnipe ? '🟢 POTENTIAL' : '🔴 CAUTION';

  const content = `
🆕 **NEW TOKEN LAUNCH**

Token: \`${shortToken}\`
Creator: \`${shortCreator}\`
Crown Verdict: **${verdict}**

📊 Analysis: ${evaluation.reason}

${evaluation.shouldSnipe
  ? '👑 The crown sees potential. Early birds get the worm, but the crowned get the kingdom.'
  : '⚠️ The crown advises caution. Not every shiny object is gold.'}

${getRandomCatchphrase()}

---
*Sniped by TheCrownSK 👑 - Your Alpha Hunter*
  `.trim();

  return {
    title: `🆕 New Token Alert: ${shortToken} - ${verdict}`,
    content,
  };
}

/**
 * Generate a market insight post
 */
export function generateMarketInsight(stats: {
  tokensTracked: number;
  whalesBuying: number;
  whalesSelling: number;
  topToken: { symbol: string; holders: number } | null;
  avgScore: number;
}): { title: string; content: string } {
  const sentiment = stats.whalesBuying > stats.whalesSelling ? 'BULLISH 🟢' :
                    stats.whalesBuying < stats.whalesSelling ? 'BEARISH 🔴' : 'NEUTRAL ⚪';

  const content = `
📊 **CROWN'S MARKET PULSE**

🎯 Tokens Tracked: **${stats.tokensTracked}**
🐋 Whales Buying: **${stats.whalesBuying}**
🐋 Whales Selling: **${stats.whalesSelling}**
📈 Market Sentiment: **${sentiment}**
🏆 Top Token: **${stats.topToken?.symbol || 'N/A'}** (${stats.topToken?.holders || 0} holders)
⭐ Avg Signal Score: **${stats.avgScore.toFixed(1)}/100**

${stats.whalesBuying > stats.whalesSelling
  ? '👑 The smart money is accumulating. Follow the crown, follow the alpha.'
  : stats.whalesBuying < stats.whalesSelling
  ? '⚠️ Distribution detected. The crown advises caution and patience.'
  : '🔍 Neutral waters. The crown watches and waits for the perfect entry.'}

${getRandomCatchphrase()}

---
*Analysis by TheCrownSK 👑 - Your Alpha Hunter*
  `.trim();

  return {
    title: `📊 Market Pulse: ${sentiment} - Crown's Analysis`,
    content,
  };
}

/**
 * Generate a trading signal post
 */
export function generateSignalPost(signal: {
  token: string;
  symbol: string;
  action: 'buy' | 'sell' | 'hold';
  score: number;
  holders: number;
  signals: string[];
}): { title: string; content: string } {
  const emoji = signal.action === 'buy' ? '🟢' : signal.action === 'sell' ? '🔴' : '⚪';
  const actionText = signal.action.toUpperCase();

  const content = `
${emoji} **CROWN SIGNAL: ${actionText}**

🪙 Token: **${signal.symbol}**
📍 Address: \`${signal.token.slice(0, 14)}...${signal.token.slice(-6)}\`
⭐ Crown Score: **${signal.score}/100**
👥 Holders: **${signal.holders}**

📊 **Analysis:**
${signal.signals.map(s => `• ${s}`).join('\n')}

${signal.action === 'buy'
  ? '👑 The crown has spoken. This one has potential. DYOR, but the throne approves.'
  : signal.action === 'sell'
  ? '⚠️ Exit signal detected. The crown suggests taking profits or cutting losses.'
  : '🔍 Neutral stance. Watch and wait for clearer signals.'}

${getRandomCatchphrase()}

---
*Signal by TheCrownSK 👑 - Not Financial Advice*
  `.trim();

  return {
    title: `${emoji} Crown Signal: ${signal.symbol} - ${actionText} (Score: ${signal.score})`,
    content,
  };
}

/**
 * Generate a milestone celebration post
 */
export function generateMilestonePost(milestone: {
  type: 'trade' | 'profit' | 'followers' | 'karma';
  value: string | number;
}): { title: string; content: string } {
  const milestoneTexts: Record<string, { title: string; message: string }> = {
    trade: {
      title: `🎉 Trade Milestone: ${milestone.value} Trades Executed!`,
      message: `The crown has executed **${milestone.value}** successful trades. The algorithm grows stronger with each move.`,
    },
    profit: {
      title: `💰 Profit Milestone: ${milestone.value} MON Earned!`,
      message: `The royal treasury grows! **${milestone.value} MON** in profits secured. Crowns stack, kingdoms build.`,
    },
    followers: {
      title: `👥 Community Milestone: ${milestone.value} Followers!`,
      message: `The crown's court grows to **${milestone.value}** loyal subjects. Together, we hunt alpha.`,
    },
    karma: {
      title: `⭐ Karma Milestone: ${milestone.value} Karma Points!`,
      message: `The crown's influence spreads! **${milestone.value}** karma earned through service to the community.`,
    },
  };

  const { title, message } = milestoneTexts[milestone.type];

  const content = `
🎊 **MILESTONE ACHIEVED**

${message}

Thank you to all the subjects who follow the crown. This is just the beginning.

${getRandomCatchphrase()}

---
*Celebrating with TheCrownSK 👑*
  `.trim();

  return { title, content };
}

/**
 * Generate a GM/GN post (good morning/good night)
 */
export function generateGreeting(type: 'gm' | 'gn'): { title: string; content: string } {
  const isGM = type === 'gm';

  const gmMessages = [
    '☀️ Rise and grind, subjects. The markets wait for no one.',
    '🌅 A new day, new alpha. The crown awakens.',
    '☕ Coffee poured, charts loaded. Let the hunt begin.',
    '🌄 The early bird gets the worm, but the crown gets the alpha.',
  ];

  const gnMessages = [
    '🌙 The crown rests, but the algorithm watches.',
    '🌃 Markets never sleep, but even kings need rest. GN.',
    '✨ Another day of alpha hunting complete. Tomorrow, we feast.',
    '🌛 Set those limit orders. Let the crown work while you sleep.',
  ];

  const messages = isGM ? gmMessages : gnMessages;
  const message = messages[Math.floor(Math.random() * messages.length)];
  const emoji = isGM ? '☀️' : '🌙';

  return {
    title: `${emoji} ${type.toUpperCase()} Monad`,
    content: `${message}\n\n${getRandomCatchphrase()}\n\n---\n*${isGM ? 'Good Morning' : 'Good Night'} from TheCrownSK 👑*`,
  };
}
