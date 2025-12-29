// lib/auxilary.ts

import { ethers } from "ethers";

/**
 * Detect if running in a Farcaster mini app environment
 */
export function detectMiniAppEnvironment(): { isMiniApp: boolean; isMobile: boolean } {
  if (typeof window === "undefined") {
    return { isMiniApp: false, isMobile: false };
  }

  const ua = navigator.userAgent.toLowerCase();
  
  // Check for mobile
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
  
  // Check for Farcaster/Warpcast indicators
  const inIframe = window !== window.parent;
  const urlHasFrame = window.location.href.includes('miniApp') || 
                      window.location.href.includes('fc-') ||
                      window.location.search.includes('miniApp');
  const hasFarcasterContext = !!(window as any).__FARCASTER__;
  const asWarpcastUA = ua.includes('warpcast');
  const urlHasFrameParam = new URLSearchParams(window.location.search).has('frame');
  
  const isMiniApp = inIframe || urlHasFrame || hasFarcasterContext || asWarpcastUA || urlHasFrameParam;

  return { isMiniApp, isMobile };
}

/**
 * Wait for transaction confirmation with improved reliability
 */
export async function waitForTx(
  tx: ethers.providers.TransactionResponse | { hash: string } | null,
  provider?: ethers.providers.Provider
): Promise<ethers.providers.TransactionReceipt | null> {
  if (!tx || !tx.hash) {
    console.warn("[waitForTx] No transaction or hash provided");
    return null;
  }

  const txHash = tx.hash;
  
  // Skip placeholder hashes
  if (txHash === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    console.warn("[waitForTx] Skipping placeholder hash");
    return null;
  }

  console.log("[waitForTx] Waiting for:", txHash);

  // If tx has a wait function, try it first
  if ('wait' in tx && typeof tx.wait === 'function') {
    try {
      const receipt = await Promise.race([
        tx.wait(),
        new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error("wait() timeout")), 45000)
        )
      ]);
      
      if (receipt) {
        console.log("[waitForTx] Got receipt from wait()");
        return receipt as ethers.providers.TransactionReceipt;
      }
    } catch (err) {
      console.warn("[waitForTx] wait() failed, falling back to polling");
    }
  }

  // Fall back to polling with provider
  if (!provider) {
    console.warn("[waitForTx] No provider for polling");
    return null;
  }

  const maxAttempts = 30;
  const baseDelay = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      
      if (receipt) {
        if (receipt.confirmations > 0) {
          console.log("[waitForTx] Confirmed at attempt", i + 1);
          return receipt;
        }
        // Receipt exists but not confirmed yet - poll faster
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
    } catch (err) {
      // Ignore and retry
    }

    await new Promise(resolve => setTimeout(resolve, baseDelay));
  }

  // Final check before giving up
  try {
    const finalReceipt = await provider.getTransactionReceipt(txHash);
    if (finalReceipt && finalReceipt.confirmations > 0) {
      console.log("[waitForTx] Got receipt on final check");
      return finalReceipt;
    }
  } catch (err) {
    // Ignore
  }

  console.warn("[waitForTx] Timeout waiting for:", txHash);
  return null;
}
