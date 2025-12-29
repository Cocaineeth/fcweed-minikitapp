// lib/auxilary.ts
import { ethers } from "ethers";

export function detectMiniAppEnvironment(): { isMiniApp: boolean; isMobile: boolean; isBaseApp: boolean } {
  if (typeof window === "undefined") {
    return { isMiniApp: false, isMobile: false, isBaseApp: false };
  }

  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
  
  const inIframe = window !== window.parent;
  const urlHasFrame = window.location.href.includes('miniApp') || 
                      window.location.href.includes('fc-') ||
                      window.location.search.includes('miniApp');
  const hasFarcasterContext = !!(window as any).__FARCASTER__;
  const asWarpcastUA = ua.includes('warpcast');
  const urlHasFrameParam = new URLSearchParams(window.location.search).has('frame');
  
  // Base App detection - multiple signals
  const isBaseAppUA = ua.includes('base/') || ua.includes('coinbase');
  const hasBaseWindow = !!(window as any).__BASE__ || 
                        !!(window as any).ethereum?.isBase ||
                        !!(window as any).ethereum?.isCoinbaseWallet ||
                        !!(window as any).coinbaseWalletExtension;
  const urlHasBase = window.location.href.includes('base.org') || 
                     window.location.href.includes('onchainkit') ||
                     window.location.search.includes('baseApp') ||
                     window.location.search.includes('source=base');
  // Check referrer for Base App
  const referrerIsBase = typeof document !== 'undefined' && 
                         (document.referrer.includes('base.org') || document.referrer.includes('coinbase'));
  
  const isBaseApp = isBaseAppUA || hasBaseWindow || urlHasBase || referrerIsBase || inIframe;
  
  const isMiniApp = inIframe || urlHasFrame || hasFarcasterContext || asWarpcastUA || urlHasFrameParam || isBaseApp;

  // Debug log for troubleshooting
  if (typeof console !== 'undefined') {
    console.log('[MiniApp Detection]', { 
      isMiniApp, isMobile, isBaseApp, inIframe, 
      ua: ua.substring(0, 100),
      hasEthereum: !!(window as any).ethereum,
      ethereumIsBase: !!(window as any).ethereum?.isBase,
      ethereumIsCoinbase: !!(window as any).ethereum?.isCoinbaseWallet
    });
  }

  return { isMiniApp, isMobile, isBaseApp };
}

export async function waitForTx(
  tx: ethers.providers.TransactionResponse | { hash: string } | null,
  provider?: ethers.providers.Provider
): Promise<ethers.providers.TransactionReceipt | null> {
  if (!tx || !tx.hash) {
    console.warn("[waitForTx] No transaction or hash provided");
    return null;
  }

  const txHash = tx.hash;
  
  if (txHash === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    console.warn("[waitForTx] Skipping placeholder hash");
    return null;
  }

  console.log("[waitForTx] Waiting for:", txHash);

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
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
    } catch (err) {}
    await new Promise(resolve => setTimeout(resolve, baseDelay));
  }

  try {
    const finalReceipt = await provider.getTransactionReceipt(txHash);
    if (finalReceipt && finalReceipt.confirmations > 0) {
      console.log("[waitForTx] Got receipt on final check");
      return finalReceipt;
    }
  } catch (err) {}

  console.warn("[waitForTx] Timeout waiting for:", txHash);
  return null;
}
