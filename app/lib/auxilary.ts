// export function isSuper(nftAddress: string, id: number): boolean
// {
//     const a = nftAddress.toLowerCase();
//     if (a === PLANT_ADDRESS.toLowerCase()) return SUPER_PLANT_IDS.has(id);
//     if (a === LAND_ADDRESS.toLowerCase()) return SUPER_LAND_IDS.has(id);
//     return false;
// }

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
)
{
    if (!tx) return;

    if (readProvider && tx.hash) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitMs) {
            try {
                const receipt = await readProvider.getTransactionReceipt(tx.hash);
                if (receipt && receipt.confirmations > 0) {
                    return receipt;
                }
            } catch {

            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        console.warn("Transaction wait timeout, proceeding anyway:", tx.hash);
        return;
    }


    try {
        await tx.wait();
    } catch (e: any) {
        const msg =
            e?.reason ||
            e?.error?.message ||
            e?.data?.message ||
            e?.message ||
            "";
        if (
            msg.includes("does not support the requested method") ||
            msg.includes("unsupported method") ||
            msg.includes("wait is not a function")
        ) {
            console.warn("Ignoring provider wait() error:", e);
        } else {
            throw e;
        }
    }
}

