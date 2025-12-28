import { sdk } from "@farcaster/miniapp-sdk";
import { ethers } from "ethers";

export function detectMiniAppEnvironment(): { isMiniApp: boolean; isMobile: boolean } {
    if (typeof window === "undefined") return { isMiniApp: false, isMobile: false };

    const userAgent = navigator.userAgent || "";
    const isMobile = /iPhone|iPad|iPod|Android/i.test(userAgent);

    const inIframe = window.parent !== window;
    const hasFarcasterContext = !!(window as any).farcaster || !!(window as any).__FARCASTER__;
    const hasWarpcastUA = userAgent.toLowerCase().includes("warpcast");
    const urlHasFrame = window.location.href.includes("fc-frame") ||
                        window.location.href.includes("farcaster") ||
                        document.referrer.includes("warpcast") ||
                        document.referrer.includes("farcaster");

    let sdkAvailable = false;
    try {
        sdkAvailable = !!(sdk && sdk.wallet);
    } catch {
        sdkAvailable = false;
    }

    const isMiniApp = inIframe || hasFarcasterContext || hasWarpcastUA || urlHasFrame || (isMobile && sdkAvailable);

    console.log("[Detect] Environment check:", {
        isMobile,
        inIframe,
        hasFarcasterContext,
        hasWarpcastUA,
        urlHasFrame,
        sdkAvailable,
        isMiniApp
    });

    return { isMiniApp, isMobile };
}

export async function waitForTx(
    tx: ethers.providers.TransactionResponse | undefined | null,
    readProvider?: ethers.providers.Provider,
    maxWaitMs = 60000
): Promise<ethers.providers.TransactionReceipt | null | undefined>
{
    if (!tx) {
        console.log("[waitForTx] No transaction provided");
        return undefined;
    }

    // Check if tx.hash is a placeholder (all zeros)
    if (tx.hash === "0x" + "0".repeat(64)) {
        console.log("[waitForTx] Placeholder hash, skipping wait");
        return undefined;
    }

    console.log("[waitForTx] Waiting for tx:", tx.hash);

    // If we have a readProvider, use it to poll for the receipt
    if (readProvider && tx.hash) {
        const startTime = Date.now();
        let attempts = 0;
        
        while (Date.now() - startTime < maxWaitMs) {
            attempts++;
            try {
                const receipt = await readProvider.getTransactionReceipt(tx.hash);
                if (receipt) {
                    console.log("[waitForTx] Got receipt after", attempts, "attempts, confirmations:", receipt.confirmations);
                    if (receipt.confirmations > 0) {
                        return receipt;
                    }
                    // If receipt exists but 0 confirmations, it's pending - wait a bit more
                    if (receipt.blockNumber) {
                        // Transaction is mined but maybe not confirmed yet, shorter wait
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    }
                }
            } catch (e) {
                // Ignore errors, just retry
                console.warn("[waitForTx] Receipt check error:", e);
            }
            
            // Wait 2 seconds between checks
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        console.warn("[waitForTx] Timeout after", attempts, "attempts, proceeding anyway");
        
        // One final check before giving up
        try {
            const finalReceipt = await readProvider.getTransactionReceipt(tx.hash);
            if (finalReceipt && finalReceipt.confirmations > 0) {
                return finalReceipt;
            }
        } catch { }
        
        return undefined;
    }

    // Fallback: try using tx.wait() if available
    try {
        if (typeof tx.wait === "function") {
            console.log("[waitForTx] Using tx.wait()");
            const receipt = await tx.wait();
            console.log("[waitForTx] tx.wait() completed");
            return receipt;
        }
    } catch (e: any) {
        const msg = e?.reason || e?.error?.message || e?.data?.message || e?.message || "";
        
        // Ignore known non-errors
        if (
            msg.includes("does not support the requested method") ||
            msg.includes("unsupported method") ||
            msg.includes("wait is not a function")
        ) {
            console.warn("[waitForTx] Ignoring provider wait() error:", msg);
            return undefined;
        }
        
        console.error("[waitForTx] tx.wait() error:", e);
        throw e;
    }
    
    return undefined;
}
