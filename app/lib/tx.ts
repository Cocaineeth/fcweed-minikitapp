// lib/tx.ts
// This is a hybrid transaction handler that can use either:
// 1. Wagmi hooks (preferred for Farcaster miniapps)
// 2. Direct ethers.js (fallback for browser wallets)

import { ethers } from "ethers";

export type EnsureWalletCtx = {
  signer: ethers.Signer;
  provider: ethers.providers.Provider;
  userAddress: string;
  isMini: boolean;
};

export type EnsureWalletFn = () => Promise<EnsureWalletCtx | null>;

export type WagmiSendFn = (to: string, data: string, gasLimit?: string) => Promise<{ hash: string; wait: () => Promise<any> } | null>;

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
  
  // Optional Wagmi integration
  wagmiSendTx?: WagmiSendFn;
  wagmiConnected?: boolean;
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
    wagmiSendTx,
    wagmiConnected,
  } = deps;

  // Helper to wait for a transaction receipt using readProvider
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

  // Legacy method for direct provider calls (used when Wagmi is not available)
  async function sendWalletCallsLegacy(
    from: string,
    to: string,
    data: string,
    gasLimit: string = "0x1E8480"
  ): Promise<ethers.providers.TransactionResponse>
  {
    console.log("[TX] sendWalletCallsLegacy called (fallback mode)");
    
    if (!miniAppEthProvider) {
      throw new Error("Mini app provider not available");
    }

    const req = miniAppEthProvider.request?.bind(miniAppEthProvider) 
      ?? miniAppEthProvider.send?.bind(miniAppEthProvider);
    
    if (!req) {
      throw new Error("Provider missing request method");
    }

    const chainIdHex = "0x" + CHAIN_ID.toString(16);
    let txHash: string | null = null;

    // Try eth_sendTransaction
    try {
      console.log("[TX] Trying eth_sendTransaction...");
      
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
      }
    } catch (err: any) {
      console.warn("[TX] eth_sendTransaction failed:", err?.message || err?.code);
      
      if (err?.code === 4001 || err?.message?.includes("rejected")) {
        throw new Error("Transaction rejected");
      }
    }

    // Try wallet_sendCalls if eth_sendTransaction failed
    if (!txHash) {
      try {
        console.log("[TX] Trying wallet_sendCalls...");
        
        const result = await req({
          method: "wallet_sendCalls",
          params: [{
            version: "1.0",
            chainId: chainIdHex,
            from,
            calls: [{ to, data, value: "0x0" }],
          }],
        });
        
        console.log("[TX] wallet_sendCalls result:", result);
        
        if (typeof result === "string" && result.startsWith("0x") && result.length >= 66) {
          txHash = result;
        } else if (result?.txHashes?.[0]) {
          txHash = result.txHashes[0];
        } else if (result?.hash) {
          txHash = result.hash;
        }
      } catch (err: any) {
        console.warn("[TX] wallet_sendCalls failed:", err?.message || err?.code);
        
        if (err?.code === 4001 || err?.message?.includes("rejected")) {
          throw new Error("Transaction rejected");
        }
      }
    }

    if (!txHash || !txHash.startsWith("0x") || txHash.length < 66) {
      throw new Error("Transaction failed. Please try the Warpcast mobile app.");
    }

    return {
      hash: txHash,
      wait: async () => waitForReceipt(txHash!, 30),
    } as any;
  }

  // Main sendWalletCalls function - uses Wagmi if available
  async function sendWalletCalls(
    from: string,
    to: string,
    data: string,
    gasLimit: string = "0x1E8480"
  ): Promise<ethers.providers.TransactionResponse>
  {
    console.log("[TX] sendWalletCalls called");
    console.log("[TX] Wagmi available:", !!wagmiSendTx, "Connected:", wagmiConnected);

    // Try Wagmi first if available and connected
    if (wagmiSendTx && wagmiConnected) {
      try {
        console.log("[TX] Using Wagmi for transaction...");
        const result = await wagmiSendTx(to, data, gasLimit);
        
        if (result) {
          console.log("[TX] Wagmi transaction successful:", result.hash);
          return result as any;
        }
      } catch (wagmiErr: any) {
        console.error("[TX] Wagmi transaction failed:", wagmiErr?.message);
        
        // If user rejected, don't fallback
        if (wagmiErr?.message?.includes("rejected") || wagmiErr?.message?.includes("denied")) {
          throw wagmiErr;
        }
        
        // Otherwise, fall through to legacy method
        console.log("[TX] Falling back to legacy method...");
      }
    }

    // Fallback to legacy method
    return sendWalletCallsLegacy(from, to, data, gasLimit);
  }

  async function sendContractTx(
    to: string,
    data: string,
    gasLimit: string = "0x1E8480"
  ): Promise<ethers.providers.TransactionResponse | null>
  {
    // Try Wagmi first if available
    if (wagmiSendTx && wagmiConnected) {
      try {
        console.log("[TX] Using Wagmi sendContractTx...");
        const result = await wagmiSendTx(to, data, gasLimit);
        if (result) {
          return result as any;
        }
      } catch (wagmiErr: any) {
        console.error("[TX] Wagmi sendContractTx failed:", wagmiErr?.message);
        
        if (wagmiErr?.message?.includes("rejected") || wagmiErr?.message?.includes("denied")) {
          setMintStatus("Transaction rejected");
          throw wagmiErr;
        }
        
        // Fall through to legacy
        console.log("[TX] Falling back to legacy sendContractTx...");
      }
    }

    // Legacy path
    const ctx = await ensureWallet();
    if (!ctx) return null;

    try {
      if (ctx.isMini && miniAppEthProvider) {
        return await sendWalletCallsLegacy(ctx.userAddress, to, data, gasLimit);
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
    let addr: string;
    
    // Get address - try Wagmi first
    if (wagmiConnected) {
      // We'll get address from the wallet context
      const ctx = await ensureWallet();
      if (!ctx) return false;
      addr = ctx.userAddress;
    } else {
      const ctx = await ensureWallet();
      if (!ctx) return false;
      addr = ctx.userAddress;
    }

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
      
      // Use sendContractTx which will use Wagmi if available
      const approveTx = await sendContractTx(USDC_ADDRESS, approveData);
      
      if (!approveTx) {
        setMintStatus("Approval failed");
        return false;
      }

      setMintStatus("Confirming approval...");
      
      if (approveTx.hash) {
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
    } catch (err: any) {
      setMintStatus(err?.message?.slice(0, 60) || "Approval failed");
      return false;
    }
  }

  return { sendWalletCalls, sendContractTx, ensureUsdcAllowance };
}
