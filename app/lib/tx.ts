// lib/tx.ts
// Improved transaction handling for Farcaster miniapps
// No Wagmi dependency - works with existing setup

import { ethers } from "ethers";

export type EnsureWalletCtx = {
  signer: ethers.Signer;
  provider: ethers.providers.Provider;
  userAddress: string;
  isMini: boolean;
};

export type EnsureWalletFn = () => Promise<EnsureWalletCtx | null>;

export type TxDeps = {
  ensureWallet: EnsureWalletFn;
  readProvider: ethers.providers.Provider;

  miniAppEthProvider: any | null;
  usingMiniApp: boolean;

  CHAIN_ID: number;

  USDC_ADDRESS: string;
  USDC_DECIMALS: number;
  USDC_ABI: any[];
  usdcInterface: ethers.utils.Interface;

  waitForTx: (tx: ethers.providers.TransactionResponse) => Promise<any>;

  setMintStatus: (msg: string) => void;
};

export function makeTxActions(deps: TxDeps)
{
  const {
    ensureWallet,
    readProvider,
    miniAppEthProvider,
    usingMiniApp,
    CHAIN_ID,
    USDC_ADDRESS,
    USDC_DECIMALS,
    USDC_ABI,
    usdcInterface,
    waitForTx,
    setMintStatus,
  } = deps;

  // Helper to wait for receipt
  async function waitForReceipt(txHash: string, maxAttempts: number = 30): Promise<any> {
    console.log("[TX] Waiting for receipt:", txHash);
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const receipt = await readProvider.getTransactionReceipt(txHash);
        if (receipt && receipt.confirmations > 0) {
          console.log("[TX] Got receipt at attempt", i + 1);
          return receipt;
        }
      } catch (e) {
        // Ignore, retry
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.warn("[TX] Receipt wait timeout");
    return null;
  }

  async function sendWalletCalls(
    from: string,
    to: string,
    data: string,
    gasLimit: string = "0x1E8480"
  ): Promise<ethers.providers.TransactionResponse>
  {
    if (!miniAppEthProvider) {
      throw new Error("Mini app provider not available");
    }

    const req = miniAppEthProvider.request?.bind(miniAppEthProvider) 
      ?? miniAppEthProvider.send?.bind(miniAppEthProvider);
    
    if (!req) {
      throw new Error("Provider missing request method");
    }

    const chainIdHex = "0x" + CHAIN_ID.toString(16); // 0x2105 for Base
    let txHash: string | null = null;

    console.log("[TX] Sending transaction...");
    console.log("[TX] From:", from);
    console.log("[TX] To:", to);
    console.log("[TX] ChainId:", chainIdHex);

    // Method 1: Try eth_sendTransaction with full params
    try {
      console.log("[TX] Method 1: eth_sendTransaction...");
      
      const result = await req({
        method: "eth_sendTransaction",
        params: [{
          from,
          to,
          data,
          value: "0x0",
          chainId: chainIdHex,
        }],
      });
      
      console.log("[TX] eth_sendTransaction result:", result);
      
      if (typeof result === "string" && result.startsWith("0x") && result.length >= 66) {
        txHash = result;
      } else if (result?.hash) {
        txHash = result.hash;
      } else if (result?.txHash) {
        txHash = result.txHash;
      }
      
      if (txHash) {
        console.log("[TX] Success with eth_sendTransaction:", txHash);
      }
    } catch (err1: any) {
      console.warn("[TX] eth_sendTransaction failed:", err1?.message || err1?.code);
      
      if (err1?.code === 4001 || err1?.message?.includes("rejected") || err1?.message?.includes("denied")) {
        throw new Error("Transaction rejected");
      }
    }

    // Method 2: Try wallet_sendCalls (EIP-5792) if eth_sendTransaction failed
    if (!txHash) {
      try {
        console.log("[TX] Method 2: wallet_sendCalls...");
        
        const result = await req({
          method: "wallet_sendCalls",
          params: [{
            version: "1.0",
            chainId: chainIdHex,
            from,
            calls: [{ 
              to, 
              data, 
              value: "0x0" 
            }],
          }],
        });
        
        console.log("[TX] wallet_sendCalls result:", result);
        
        // Handle various response formats
        if (typeof result === "string" && result.startsWith("0x") && result.length >= 66) {
          txHash = result;
        } else if (result?.txHashes?.[0]) {
          txHash = result.txHashes[0];
        } else if (result?.hash) {
          txHash = result.hash;
        } else if (result?.id) {
          // Batch ID - try to get status
          console.log("[TX] Got batch ID, checking status...");
          try {
            await new Promise(r => setTimeout(r, 2000));
            const status = await req({
              method: "wallet_getCallsStatus", 
              params: [result.id]
            });
            console.log("[TX] Batch status:", status);
            if (status?.receipts?.[0]?.transactionHash) {
              txHash = status.receipts[0].transactionHash;
            }
          } catch (e) {
            console.warn("[TX] Could not get batch status");
          }
        }
        
        if (txHash) {
          console.log("[TX] Success with wallet_sendCalls:", txHash);
        }
      } catch (err2: any) {
        console.warn("[TX] wallet_sendCalls failed:", err2?.message || err2?.code);
        
        if (err2?.code === 4001 || err2?.message?.includes("rejected") || err2?.message?.includes("denied")) {
          throw new Error("Transaction rejected");
        }
      }
    }

    // Method 3: Try minimal eth_sendTransaction without chainId
    if (!txHash) {
      try {
        console.log("[TX] Method 3: eth_sendTransaction (minimal)...");
        
        const result = await req({
          method: "eth_sendTransaction",
          params: [{
            from,
            to,
            data,
          }],
        });
        
        console.log("[TX] Minimal eth_sendTransaction result:", result);
        
        if (typeof result === "string" && result.startsWith("0x") && result.length >= 66) {
          txHash = result;
          console.log("[TX] Success with minimal params:", txHash);
        }
      } catch (err3: any) {
        console.warn("[TX] Minimal eth_sendTransaction failed:", err3?.message || err3?.code);
        
        if (err3?.code === 4001 || err3?.message?.includes("rejected") || err3?.message?.includes("denied")) {
          throw new Error("Transaction rejected");
        }
      }
    }

    // If we still don't have a txHash, throw
    if (!txHash || !txHash.startsWith("0x") || txHash.length < 66) {
      console.error("[TX] All methods failed");
      throw new Error("Transaction failed. Please try the Warpcast mobile app.");
    }

    console.log("[TX] Transaction submitted:", txHash);

    return {
      hash: txHash,
      wait: async () => waitForReceipt(txHash!, 30),
    } as any;
  }

  async function sendContractTx(
    to: string,
    data: string,
    gasLimit: string = "0x1E8480"
  ): Promise<ethers.providers.TransactionResponse | null>
  {
    const ctx = await ensureWallet();
    if (!ctx) return null;

    try {
      if (ctx.isMini && miniAppEthProvider) {
        return await sendWalletCalls(ctx.userAddress, to, data, gasLimit);
      }

      // Browser wallet - use signer directly
      const tx = await ctx.signer.sendTransaction({
        to,
        data,
        value: 0,
        gasLimit: ethers.BigNumber.from(gasLimit),
      });

      return tx;
    } catch (err: any) {
      const errMsg = err?.message || err?.reason || String(err);
      console.error("[TX] sendContractTx error:", errMsg);
      
      if (errMsg.includes("rejected") || errMsg.includes("denied") || err?.code === 4001) {
        setMintStatus("Transaction rejected");
      } else if (errMsg.includes("insufficient")) {
        setMintStatus("Insufficient funds");
      } else {
        setMintStatus(errMsg.slice(0, 80));
      }

      throw err;
    }
  }

  async function ensureUsdcAllowance(spender: string, required: ethers.BigNumber): Promise<boolean>
  {
    const ctx = await ensureWallet();
    if (!ctx) return false;

    const { userAddress: addr, isMini } = ctx;

    const usdcRead = new ethers.Contract(USDC_ADDRESS, USDC_ABI, readProvider);

    let current = ethers.constants.Zero;
    try { 
      current = await usdcRead.allowance(addr, spender); 
    } catch { }

    if (current.gte(required)) {
      console.log("[TX] USDC allowance sufficient");
      return true;
    }

    setMintStatus("Requesting USDC approval...");

    try {
      const approveData = usdcInterface.encodeFunctionData("approve", [spender, required]);
      
      if (isMini && miniAppEthProvider) {
        const approveTx = await sendWalletCalls(addr, USDC_ADDRESS, approveData);
        
        if (approveTx.hash) {
          setMintStatus("Confirming approval...");
          await waitForReceipt(approveTx.hash, 20);
        }

        // Verify
        for (let i = 0; i < 10; i++) {
          await new Promise(res => setTimeout(res, 1500));
          try {
            const updated = await usdcRead.allowance(addr, spender);
            if (updated.gte(required)) {
              setMintStatus("Approval confirmed!");
              return true;
            }
          } catch { }
        }
        
        setMintStatus("Approval may not have confirmed");
        return false;
      } else {
        const usdcWrite = new ethers.Contract(USDC_ADDRESS, USDC_ABI, ctx.signer);
        const tx = await usdcWrite.approve(spender, required);
        setMintStatus("Confirming approval...");
        await tx.wait();
        setMintStatus("Approval confirmed!");
        return true;
      }
    } catch (err: any) {
      setMintStatus(err?.message?.slice(0, 60) || "Approval failed");
      return false;
    }
  }

  return { sendWalletCalls, sendContractTx, ensureUsdcAllowance };
}
