// lib/tx.ts
import { ethers } from "ethers";

export type EnsureWalletCtx = {
  signer: ethers.Signer;
  provider: ethers.providers.Provider;
  userAddress: string;
  isMini: boolean;
  ethProvider?: any; // Fresh provider from ensureWallet
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
    CHAIN_ID,
    USDC_ADDRESS,
    USDC_DECIMALS,
    USDC_ABI,
    usdcInterface,
    waitForTx,
    setMintStatus,
  } = deps;

  // Internal function that takes ethProvider as parameter (avoids stale closure)
  async function sendWalletCallsInternal(
    ethProvider: any,
    from: string,
    to: string,
    data: string,
    gasLimit: string = "0x1E8480"
  ): Promise<ethers.providers.TransactionResponse>
  {
    console.log("[TX] sendWalletCallsInternal called");
    
    if (!ethProvider) throw new Error("Mini app provider not available");

    const chainIdHex = ethers.utils.hexValue(CHAIN_ID);
    let result: any;
    let txHash: string | null = null;

    // Detect if we're on mobile
    const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    // Get request function
    const req = ethProvider.request?.bind(ethProvider) ?? ethProvider.send?.bind(ethProvider);
    if (!req) throw new Error("Mini app provider missing request/send method");

    // On desktop Farcaster, the provider auto-rejects eth_sendTransaction
    // Try communicating directly with the parent frame
    if (!isMobile) {
      console.log("[TX] Desktop Farcaster - trying frame communication...");
      
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        
        // Check if we're in an iframe (Farcaster miniapp context)
        const inIframe = window !== window.parent;
        console.log("[TX] In iframe:", inIframe);
        
        // Get provider and account first
        const farcasterProvider = await sdk.wallet.getEthereumProvider();
        let accounts = await farcasterProvider.request({ method: "eth_accounts" });
        if (!accounts?.[0]) {
          accounts = await farcasterProvider.request({ method: "eth_requestAccounts" });
        }
        const account = accounts?.[0];
        console.log("[TX] Account:", account);
        
        if (!account) {
          throw new Error("No account available");
        }
        
        // Try to use sdk.actions if there's any transaction-related action
        console.log("[TX] SDK actions:", Object.keys(sdk.actions || {}));
        
        // Check for sendToken action (might work for contract calls too)
        if ((sdk.actions as any).sendTransaction) {
          console.log("[TX] Found sdk.actions.sendTransaction, trying...");
          const actionResult = await (sdk.actions as any).sendTransaction({
            chainId: `eip155:${CHAIN_ID}`,
            to: to,
            data: data,
            value: "0",
          });
          console.log("[TX] sendTransaction action result:", actionResult);
          if (actionResult?.transactionHash || actionResult?.hash) {
            txHash = actionResult.transactionHash || actionResult.hash;
          }
        }
        
        // If we have a hash from action, return it
        if (txHash && txHash.length >= 64) {
          console.log("[TX] Got hash from action:", txHash);
          const fakeTx: any = {
            hash: txHash,
            wait: async () => {
              for (let j = 0; j < 45; j++) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
                try {
                  const receipt = await readProvider.getTransactionReceipt(txHash!);
                  if (receipt && receipt.confirmations > 0) return receipt;
                } catch { }
              }
              return null;
            },
          };
          return fakeTx as ethers.providers.TransactionResponse;
        }
        
        // Last resort: try eth_sendTransaction anyway
        // Some versions of Farcaster might show a popup
        console.log("[TX] Trying eth_sendTransaction (last resort)...");
        result = await farcasterProvider.request({
          method: "eth_sendTransaction",
          params: [{
            from: account,
            to: to,
            data: data,
          }],
        });
        
        console.log("[TX] eth_sendTransaction result:", result);
        
        if (typeof result === "string" && result.startsWith("0x") && result.length >= 66) {
          txHash = result;
          const fakeTx: any = {
            hash: txHash,
            wait: async () => {
              for (let j = 0; j < 45; j++) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
                try {
                  const receipt = await readProvider.getTransactionReceipt(txHash!);
                  if (receipt && receipt.confirmations > 0) return receipt;
                } catch { }
              }
              return null;
            },
          };
          return fakeTx as ethers.providers.TransactionResponse;
        }
        
        throw new Error("Transaction failed - no hash returned");
        
      } catch (err: any) {
        console.error("[TX] Desktop transaction failed:", {
          message: err?.message,
          code: err?.code,
        });
        
        // If it's the auto-reject, provide a helpful message
        if (err?.code === 4001) {
          const customError = new Error(
            "Desktop Farcaster doesn't support transaction signing yet. Please use the Farcaster mobile app or Warpcast mobile to complete transactions."
          );
          (customError as any).code = 4001;
          throw customError;
        }
        
        throw err;
      }
    }

    // Mobile path or desktop fallback: use eth_sendTransaction
    console.log("[TX] Trying eth_sendTransaction...");
    try {
      result = await req({
        method: "eth_sendTransaction",
        params: [{ from, to, data, value: "0x0", gas: gasLimit, gasLimit: gasLimit }],
      });
      
      if (typeof result === "string" && result.startsWith("0x")) txHash = result;
      else txHash = result?.hash || result?.txHash || null;
      console.log("[TX] eth_sendTransaction result:", txHash);
    } catch (err: any) {
      console.error("[TX] eth_sendTransaction error:", err?.message);
      
      // On mobile, also try wallet_sendCalls as final fallback
      if (isMobile) {
        console.log("[TX] Mobile fallback - trying wallet_sendCalls...");
        try {
          result = await req({
            method: "wallet_sendCalls",
            params: [{
              version: "1.0",
              from: from,
              chainId: chainIdHex,
              calls: [{ to, data, value: "0x0" }],
            }],
          });

          txHash = result?.txHashes?.[0] || result?.txHash || result?.hash || result?.id ||
            (typeof result === "string" && result.startsWith("0x") ? result : null);
          console.log("[TX] wallet_sendCalls result:", txHash);
        } catch (fallbackErr: any) {
          console.error("[TX] wallet_sendCalls failed:", fallbackErr?.message);
          throw fallbackErr;
        }
      } else {
        throw err;
      }
    }


    if (!txHash || typeof txHash !== "string" || !txHash.startsWith("0x") || txHash.length < 66)
    {
      return {
        hash: "0x" + "0".repeat(64),
        wait: async () => null,
      } as any;
    }

    const fakeTx: any = {
      hash: txHash,
      wait: async () =>
      {
        for (let i = 0; i < 45; i++)
        {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          try
          {
            const receipt = await readProvider.getTransactionReceipt(txHash);
            if (receipt && receipt.confirmations > 0) return receipt;
          }
          catch { }
        }
        return null;
      },
    };

    return fakeTx as ethers.providers.TransactionResponse;
  }

  // Legacy function for backward compatibility (uses deps.miniAppEthProvider)
  async function sendWalletCalls(
    from: string,
    to: string,
    data: string,
    gasLimit: string = "0x1E8480"
  ): Promise<ethers.providers.TransactionResponse>
  {
    return sendWalletCallsInternal(deps.miniAppEthProvider, from, to, data, gasLimit);
  }

  async function sendContractTx(
    to: string,
    data: string,
    gasLimit: string = "0x1E8480"
  ): Promise<ethers.providers.TransactionResponse | null>
  {
    const ctx = await ensureWallet();
    if (!ctx) return null;

    // Use fresh ethProvider from ctx, fallback to deps for backward compat
    const ethProvider = ctx.ethProvider || deps.miniAppEthProvider;

    try
    {
      if (ctx.isMini && ethProvider)
      {
        return await sendWalletCallsInternal(ethProvider, ctx.userAddress, to, data, gasLimit);
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
    const ethProvider = ctx.ethProvider || deps.miniAppEthProvider;

    setMintStatus("Checking USDC contract on Base…");
    const code = await readProvider.getCode(USDC_ADDRESS);
    if (code === "0x")
    {
      setMintStatus("USDC token not found on this network. Please make sure you are on Base mainnet.");
      return false;
    }

    const usdcRead = new ethers.Contract(USDC_ADDRESS, USDC_ABI, readProvider);
    const usdcWrite = new ethers.Contract(USDC_ADDRESS, USDC_ABI, s);

    try
    {
      const bal = await usdcRead.balanceOf(addr);
      if (bal.lt(required))
      {
        setMintStatus(`You need at least ${ethers.utils.formatUnits(required, USDC_DECIMALS)} USDC on Base to mint.`);
        return false;
      }
    }
    catch { /* ignore balance read */ }

    let current = ethers.constants.Zero;
    try { current = await usdcRead.allowance(addr, spender); }
    catch { current = ethers.constants.Zero; }

    if (current.gte(required)) return true;

    setMintStatus("Requesting USDC approve transaction in your wallet…");

    try
    {
      if (isMini && ethProvider)
      {
        const data = usdcInterface.encodeFunctionData("approve", [spender, required]);
        await sendWalletCallsInternal(ethProvider, addr, USDC_ADDRESS, data);

        setMintStatus("Waiting for USDC approve confirmation…");
        for (let i = 0; i < 20; i++)
        {
          await new Promise((res) => setTimeout(res, 1500));
          try
          {
            const updated = await usdcRead.allowance(addr, spender);
            if (updated.gte(required)) break;
            if (i === 19)
            {
              setMintStatus("Approve transaction may not have confirmed yet. Please check your wallet/explorer.");
              return false;
            }
          }
          catch
          {
            if (i === 19)
            {
              setMintStatus("Could not confirm USDC approval, please try again.");
              return false;
            }
          }
        }

        setMintStatus("USDC approve confirmed. Sending mint transaction…");
      }
      else
      {
        const tx = await usdcWrite.approve(spender, required);
        await waitForTx(tx);
        setMintStatus("USDC approve confirmed. Sending mint transaction…");
      }

      return true;
    }
    catch (err: any)
    {
      const msg =
        err?.reason ||
        err?.error?.message ||
        err?.data?.message ||
        err?.message ||
        "USDC approve failed";
      setMintStatus(msg);
      return false;
    }
  }

  return { sendWalletCalls, sendContractTx, ensureUsdcAllowance };
}
