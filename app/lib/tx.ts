// lib/tx.ts
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

  // Helper to wait for a transaction receipt with early exit
  async function waitForReceipt(txHash: string, maxAttempts: number = 30): Promise<any> {
    console.log("[TX] Waiting for receipt:", txHash);
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const receipt = await readProvider.getTransactionReceipt(txHash);
        if (receipt) {
          console.log("[TX] Got receipt at attempt", i + 1, "confirmations:", receipt.confirmations);
          if (receipt.confirmations > 0) {
            return receipt;
          }
        }
      } catch (e) {
        console.warn("[TX] Receipt check error:", e);
      }
      
      // Wait 2 seconds between checks
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.warn("[TX] Receipt wait timeout after", maxAttempts, "attempts");
    return null;
  }

  async function sendWalletCalls(
    from: string,
    to: string,
    data: string,
    gasLimit: string = "0x1E8480"
  ): Promise<ethers.providers.TransactionResponse>
  {
    if (!miniAppEthProvider) throw new Error("Mini app provider not available");

    const req =
      miniAppEthProvider.request?.bind(miniAppEthProvider) ??
      miniAppEthProvider.send?.bind(miniAppEthProvider);

    if (!req) throw new Error("Mini app provider missing request/send method");

    const chainIdHex = ethers.utils.hexValue(CHAIN_ID);

    let result: any;
    let txHash: string | null = null;

    console.log("[TX] Sending transaction...");
    console.log("[TX] From:", from);
    console.log("[TX] To:", to);

    // Try eth_sendTransaction first with minimal params
    try {
      console.log("[TX] Attempting eth_sendTransaction...");
      result = await req({
        method: "eth_sendTransaction",
        params: [{
          from,
          to,
          data,
          value: "0x0",
        }],
      });

      console.log("[TX] eth_sendTransaction result:", result);

      // Extract txHash from various possible response formats
      if (typeof result === "string" && result.startsWith("0x") && result.length >= 66) {
        txHash = result;
      } else if (result?.hash && result.hash.startsWith("0x")) {
        txHash = result.hash;
      } else if (result?.txHash && result.txHash.startsWith("0x")) {
        txHash = result.txHash;
      }

      if (txHash) {
        console.log("[TX] Got txHash from eth_sendTransaction:", txHash);
      }
    } catch (err1: any) {
      console.warn("[TX] eth_sendTransaction failed:", err1?.message || err1?.code || err1);
      
      // If user rejected, throw immediately
      if (err1?.code === 4001 || err1?.message?.includes("rejected") || err1?.message?.includes("denied")) {
        throw new Error("Transaction rejected by user");
      }

      // Try wallet_sendCalls as fallback
      try {
        console.log("[TX] Attempting wallet_sendCalls...");
        result = await req({
          method: "wallet_sendCalls",
          params: [{
            from,
            chainId: chainIdHex,
            calls: [{
              to,
              data,
              value: "0x0",
            }],
          }],
        });

        console.log("[TX] wallet_sendCalls result:", result);

        // wallet_sendCalls might return txHash in different formats
        if (typeof result === "string" && result.startsWith("0x") && result.length >= 66) {
          txHash = result;
        } else if (result?.txHashes?.[0]) {
          txHash = result.txHashes[0];
        } else if (result?.txHash) {
          txHash = result.txHash;
        } else if (result?.hash) {
          txHash = result.hash;
        } else if (result?.id && typeof result.id === "string" && result.id.startsWith("0x")) {
          // Some implementations return an ID that is the txHash
          txHash = result.id;
        }

        if (txHash) {
          console.log("[TX] Got txHash from wallet_sendCalls:", txHash);
        }
      } catch (err2: any) {
        console.error("[TX] wallet_sendCalls also failed:", err2?.message || err2?.code || err2);
        
        if (err2?.code === 4001 || err2?.message?.includes("rejected") || err2?.message?.includes("denied")) {
          throw new Error("Transaction rejected by user");
        }
        
        throw new Error("Transaction failed: " + (err2?.message || "Unknown error"));
      }
    }

    // If we still don't have a txHash, throw an error
    if (!txHash || !txHash.startsWith("0x") || txHash.length < 66) {
      console.error("[TX] No valid txHash obtained. Result was:", result);
      throw new Error("Transaction submitted but no transaction hash received. Please check your wallet.");
    }

    console.log("[TX] Transaction submitted successfully:", txHash);

    // Return a transaction-like object with a working wait() function
    const fakeTx: any = {
      hash: txHash,
      wait: async () => {
        return await waitForReceipt(txHash!, 30);
      },
    };

    return fakeTx as ethers.providers.TransactionResponse;
  }

  async function sendContractTx(
    to: string,
    data: string,
    gasLimit: string = "0x1E8480"
  ): Promise<ethers.providers.TransactionResponse | null>
  {
    const ctx = await ensureWallet();
    if (!ctx) return null;

    try
    {
      if (ctx.isMini && miniAppEthProvider)
      {
        return await sendWalletCalls(ctx.userAddress, to, data, gasLimit);
      }

      const tx = await ctx.signer.sendTransaction({
        to,
        data,
        value: 0,
        gasLimit: ethers.BigNumber.from(gasLimit),
      });

      return tx;
    }
    catch (err: any)
    {
      const errMsg = err?.message || err?.reason || String(err);
      console.error("[TX] sendContractTx error:", errMsg);
      
      if (errMsg.includes("rejected") || errMsg.includes("denied") || err?.code === 4001)
        setMintStatus("Transaction rejected. Please approve in your wallet.");
      else if (errMsg.includes("insufficient"))
        setMintStatus("Insufficient funds for transaction.");
      else
        setMintStatus("Transaction failed: " + errMsg.slice(0, 100));

      throw err;
    }
  }

  async function ensureUsdcAllowance(spender: string, required: ethers.BigNumber): Promise<boolean>
  {
    const ctx = await ensureWallet();
    if (!ctx) return false;

    const { signer: s, userAddress: addr, isMini } = ctx;

    setMintStatus("Checking USDC allowance...");
    const code = await readProvider.getCode(USDC_ADDRESS);
    if (code === "0x")
    {
      setMintStatus("USDC token not found on this network.");
      return false;
    }

    const usdcRead = new ethers.Contract(USDC_ADDRESS, USDC_ABI, readProvider);
    const usdcWrite = new ethers.Contract(USDC_ADDRESS, USDC_ABI, s);

    try
    {
      const bal = await usdcRead.balanceOf(addr);
      if (bal.lt(required))
      {
        setMintStatus(`Insufficient USDC balance. Need ${ethers.utils.formatUnits(required, USDC_DECIMALS)} USDC.`);
        return false;
      }
    }
    catch { /* ignore balance read */ }

    let current = ethers.constants.Zero;
    try { current = await usdcRead.allowance(addr, spender); }
    catch { current = ethers.constants.Zero; }

    if (current.gte(required)) {
      console.log("[TX] USDC allowance sufficient");
      return true;
    }

    setMintStatus("Requesting USDC approval...");

    try
    {
      if (isMini && miniAppEthProvider)
      {
        const approveData = usdcInterface.encodeFunctionData("approve", [spender, required]);
        const approveTx = await sendWalletCalls(addr, USDC_ADDRESS, approveData);

        setMintStatus("Waiting for approval confirmation...");
        
        // Wait for the approval transaction
        if (approveTx.hash && approveTx.hash !== "0x" + "0".repeat(64)) {
          await waitForReceipt(approveTx.hash, 20);
        }

        // Verify allowance was set
        setMintStatus("Verifying approval...");
        for (let i = 0; i < 10; i++) {
          await new Promise(res => setTimeout(res, 1500));
          try {
            const updated = await usdcRead.allowance(addr, spender);
            if (updated.gte(required)) {
              console.log("[TX] USDC approval confirmed");
              setMintStatus("Approval confirmed!");
              return true;
            }
          } catch { }
        }
        
        setMintStatus("Approval may not have confirmed. Please try again.");
        return false;
      }
      else
      {
        const tx = await usdcWrite.approve(spender, required);
        setMintStatus("Waiting for approval confirmation...");
        await tx.wait();
        setMintStatus("Approval confirmed!");
        return true;
      }
    }
    catch (err: any)
    {
      const msg = err?.reason || err?.message || "USDC approve failed";
      setMintStatus(msg);
      return false;
    }
  }

  return { sendWalletCalls, sendContractTx, ensureUsdcAllowance };
}
