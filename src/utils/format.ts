import { formatEther as viemFormatEther, parseEther as viemParseEther } from 'viem';

export function formatMon(wei: bigint): string {
  return `${viemFormatEther(wei)} MON`;
}

export function parseMon(mon: string | number): bigint {
  return viemParseEther(mon.toString());
}

export function shortenAddress(address: string, chars = 4): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function shortenTxHash(hash: string, chars = 8): string {
  if (!hash || hash.length < 20) return hash;
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}

export function formatPercent(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number | bigint, decimals = 2): string {
  if (typeof value === 'bigint') {
    return Number(viemFormatEther(value)).toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function explorerTxUrl(txHash: string): string {
  return `https://monadvision.com/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  return `https://monadvision.com/address/${address}`;
}
