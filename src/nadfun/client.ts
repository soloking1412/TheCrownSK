import {
  formatEther,
  formatGwei,
  keccak256,
  toBytes,
  type Address,
} from 'viem';
import { getPublicClient, getWalletClient, getAccount, waitForTransaction } from '../blockchain/client.js';
import { NADFUN_CONTRACTS } from '../config/constants.js';
import { LENS_ABI, BONDING_CURVE_ABI, BONDING_CURVE_ROUTER_ABI, DEX_ROUTER_ABI, ERC20_ABI } from './abis.js';
import type {
  CreateTokenParams,
  BuyParams,
  SellParams,
  TokenStatus,
  TradeResult,
  TokenCreateResult,
  CurveInfo,
} from './types.js';
import { logger } from '../utils/logger.js';

// Fetch current create fee from the BondingCurve contract (dynamic)
export async function getCreateFee(): Promise<bigint> {
  const publicClient = getPublicClient();
  const DEFAULT_FEE = 10n * 10n ** 18n; // 10 MON in wei

  try {
    const result = await publicClient.readContract({
      address: NADFUN_CONTRACTS.BONDING_CURVE as Address,
      abi: BONDING_CURVE_ABI,
      functionName: 'feeConfig',
    });

    // Result could be array or object depending on ABI interpretation
    let deployFeeAmount: bigint;
    if (Array.isArray(result)) {
      deployFeeAmount = result[0] as bigint;
    } else if (typeof result === 'object' && result !== null) {
      const res = result as { deployFeeAmount?: bigint };
      deployFeeAmount = res.deployFeeAmount ?? DEFAULT_FEE;
    } else {
      deployFeeAmount = DEFAULT_FEE;
    }

    // Validate the fee is reasonable (between 0.1 MON and 100 MON)
    const minFee = 10n ** 17n; // 0.1 MON
    const maxFee = 100n * 10n ** 18n; // 100 MON

    if (deployFeeAmount < minFee || deployFeeAmount > maxFee) {
      logger.warn(`Unexpected deploy fee: ${formatEther(deployFeeAmount)} MON, using default`);
      return DEFAULT_FEE;
    }

    logger.info(`Fetched deploy fee: ${formatEther(deployFeeAmount)} MON`);
    return deployFeeAmount;
  } catch (error) {
    logger.warn(`Failed to fetch deploy fee, using default 10 MON: ${error}`);
    return DEFAULT_FEE;
  }
}

// Fetch current gas price from the network
export async function getDynamicGasPrice(): Promise<bigint> {
  const publicClient = getPublicClient();
  const gasPrice = await publicClient.getGasPrice();
  // Add 20% buffer for network fluctuations
  return (gasPrice * 120n) / 100n;
}

export async function getTokenStatus(tokenAddress: Address): Promise<TokenStatus> {
  const publicClient = getPublicClient();

  const [isGraduated, progress] = await Promise.all([
    publicClient.readContract({
      address: NADFUN_CONTRACTS.LENS as Address,
      abi: LENS_ABI,
      functionName: 'isGraduated',
      args: [tokenAddress],
    }),
    publicClient.readContract({
      address: NADFUN_CONTRACTS.LENS as Address,
      abi: LENS_ABI,
      functionName: 'getProgress',
      args: [tokenAddress],
    }),
  ]);

  let curveInfo: CurveInfo | undefined;
  if (!isGraduated) {
    try {
      const curve = await publicClient.readContract({
        address: NADFUN_CONTRACTS.LENS as Address,
        abi: LENS_ABI,
        functionName: 'getCurve',
        args: [tokenAddress],
      });
      curveInfo = curve as CurveInfo;
    } catch {
      // getCurve may not be available for all tokens or on all networks
      logger.debug('getCurve not available for token', { token: tokenAddress });
    }
  }

  return {
    address: tokenAddress,
    graduated: isGraduated as boolean,
    progressPercent: Number(progress as bigint) / 100,
    curveInfo,
  };
}

export async function getAmountOut(
  tokenAddress: Address,
  amountIn: bigint,
  isBuy: boolean
): Promise<{ router: Address; amountOut: bigint }> {
  const publicClient = getPublicClient();

  const result = await publicClient.readContract({
    address: NADFUN_CONTRACTS.LENS as Address,
    abi: LENS_ABI,
    functionName: 'getAmountOut',
    args: [tokenAddress, amountIn, isBuy],
  });

  const [router, amountOut] = result as [Address, bigint];
  return { router, amountOut };
}

export async function getInitialBuyAmountOut(monAmount: bigint): Promise<bigint> {
  const publicClient = getPublicClient();

  const result = await publicClient.readContract({
    address: NADFUN_CONTRACTS.LENS as Address,
    abi: LENS_ABI,
    functionName: 'getInitialBuyAmountOut',
    args: [monAmount],
  });

  return result as bigint;
}

export async function createToken(params: CreateTokenParams): Promise<TokenCreateResult> {
  const { name, symbol, tokenURI, salt: providedSalt, initialBuyMon = 0n } = params;

  try {
    const walletClient = getWalletClient();

    // Fetch dynamic values from network
    const [createFee, gasPrice, expectedTokens] = await Promise.all([
      getCreateFee(),
      getDynamicGasPrice(),
      initialBuyMon > 0n ? getInitialBuyAmountOut(initialBuyMon) : Promise.resolve(0n),
    ]);

    // Use provided salt from API or generate random one
    const salt = providedSalt || keccak256(
      toBytes(`${name}-${symbol}-${Date.now()}-${Math.random()}`)
    );

    const totalValue = createFee + initialBuyMon;

    logger.info(`Creating token: ${name} (${symbol})`, {
      tokenURI,
      salt,
      initialBuyMon: formatEther(initialBuyMon),
      deployFee: formatEther(createFee),
      gasPrice: formatGwei(gasPrice),
    });

    const hash = await walletClient.writeContract({
      address: NADFUN_CONTRACTS.BONDING_CURVE_ROUTER as Address,
      abi: BONDING_CURVE_ROUTER_ABI,
      functionName: 'create',
      args: [
        {
          name,
          symbol,
          tokenURI,
          amountOut: expectedTokens,
          salt,
          actionId: 1, // uint8: 1 = graduate to Capricorn V3 DEX
        },
      ],
      value: totalValue,
      gas: 30_000_000n, // 30M gas - token+pool creation requires high gas (testnet RPC limit)
      gasPrice,
    });

    logger.info(`Token creation tx submitted: ${hash}`);

    const receipt = await waitForTransaction(hash);

    const createEvent = receipt.logs.find((log) => {
      try {
        return log.topics[0] === keccak256(toBytes('CurveCreate(address,address,string,string,string)'));
      } catch {
        return false;
      }
    });

    let tokenAddress: Address | undefined;
    if (createEvent && createEvent.topics[1]) {
      tokenAddress = `0x${createEvent.topics[1].slice(26)}` as Address;
    }

    logger.info(`Token created: ${tokenAddress}`, { txHash: hash });

    return {
      success: true,
      tokenAddress,
      txHash: hash,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Token creation failed: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function buyTokens(params: BuyParams): Promise<TradeResult> {
  const { token, monAmount, slippagePercent = 1 } = params;

  try {
    const [{ router, amountOut }, gasPrice] = await Promise.all([
      getAmountOut(token, monAmount, true),
      getDynamicGasPrice(),
    ]);
    const minAmountOut = (amountOut * BigInt(100 - slippagePercent)) / 100n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    const account = getAccount();
    const walletClient = getWalletClient();

    const isBondingCurve = router.toLowerCase() === NADFUN_CONTRACTS.BONDING_CURVE_ROUTER.toLowerCase();
    const routerAddress = isBondingCurve
      ? NADFUN_CONTRACTS.BONDING_CURVE_ROUTER
      : NADFUN_CONTRACTS.DEX_ROUTER;

    logger.info(`Buying tokens on ${isBondingCurve ? 'bonding curve' : 'DEX'}`, {
      token,
      monAmount: formatEther(monAmount),
      expectedOut: formatEther(amountOut),
      minOut: formatEther(minAmountOut),
      gasPrice: formatGwei(gasPrice),
    });

    const hash = await walletClient.writeContract({
      address: routerAddress as Address,
      abi: isBondingCurve ? BONDING_CURVE_ROUTER_ABI : DEX_ROUTER_ABI,
      functionName: 'buy',
      args: [
        {
          amountOutMin: minAmountOut,
          token,
          to: account.address,
          deadline,
        },
      ],
      value: monAmount,
      gas: 300_000n,
      gasPrice,
    });

    logger.info(`Buy tx submitted: ${hash}`);
    const receipt = await waitForTransaction(hash);

    return {
      success: receipt.status === 'success',
      txHash: hash,
      amountOut,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Buy failed: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function sellTokens(params: SellParams): Promise<TradeResult> {
  const { token, tokenAmount, slippagePercent = 1 } = params;

  try {
    const [{ router, amountOut }, gasPrice] = await Promise.all([
      getAmountOut(token, tokenAmount, false),
      getDynamicGasPrice(),
    ]);
    const minAmountOut = (amountOut * BigInt(100 - slippagePercent)) / 100n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    const account = getAccount();
    const walletClient = getWalletClient();
    const publicClient = getPublicClient();

    const isBondingCurve = router.toLowerCase() === NADFUN_CONTRACTS.BONDING_CURVE_ROUTER.toLowerCase();
    const routerAddress = isBondingCurve
      ? NADFUN_CONTRACTS.BONDING_CURVE_ROUTER
      : NADFUN_CONTRACTS.DEX_ROUTER;

    const allowance = await publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [account.address, routerAddress as Address],
    });

    if ((allowance as bigint) < tokenAmount) {
      logger.info(`Approving token spend for ${routerAddress}`);
      const approveHash = await walletClient.writeContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [routerAddress as Address, tokenAmount],
        gas: 100_000n,
        gasPrice,
      });
      await waitForTransaction(approveHash);
    }

    logger.info(`Selling tokens on ${isBondingCurve ? 'bonding curve' : 'DEX'}`, {
      token,
      tokenAmount: formatEther(tokenAmount),
      expectedMon: formatEther(amountOut),
      minMon: formatEther(minAmountOut),
      gasPrice: formatGwei(gasPrice),
    });

    const hash = await walletClient.writeContract({
      address: routerAddress as Address,
      abi: isBondingCurve ? BONDING_CURVE_ROUTER_ABI : DEX_ROUTER_ABI,
      functionName: 'sell',
      args: [
        {
          amountIn: tokenAmount,
          amountOutMin: minAmountOut,
          token,
          to: account.address,
          deadline,
        },
      ],
      gas: 300_000n,
      gasPrice,
    });

    logger.info(`Sell tx submitted: ${hash}`);
    const receipt = await waitForTransaction(hash);

    return {
      success: receipt.status === 'success',
      txHash: hash,
      amountOut,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Sell failed: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function getTokenBalance(
  tokenAddress: Address,
  walletAddress?: Address
): Promise<bigint> {
  const publicClient = getPublicClient();
  const address = walletAddress ?? getAccount().address;

  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
  });

  return balance as bigint;
}

export async function getTokenInfo(tokenAddress: Address) {
  const publicClient = getPublicClient();

  const [name, symbol, decimals, totalSupply] = await Promise.all([
    publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'name',
    }),
    publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'symbol',
    }),
    publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'decimals',
    }),
    publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'totalSupply',
    }),
  ]);

  return {
    name: name as string,
    symbol: symbol as string,
    decimals: decimals as number,
    totalSupply: totalSupply as bigint,
  };
}
