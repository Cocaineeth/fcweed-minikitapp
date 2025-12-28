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

    // On desktop Farcaster, the provider behavior is different
    if (!isMobile) {
      console.log("[TX] Desktop detected, inspecting provider capabilities...");
      
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        await sdk.actions.ready();
        
        const freshProvider = await sdk.wallet.getEthereumProvider();
        if (!freshProvider) {
          throw new Error("Could not get fresh provider");
        }
        
        // Log everything about the provider to understand what it supports
        console.log("[TX] Fresh provider type:", typeof freshProvider);
        console.log("[TX] Fresh provider keys:", Object.keys(freshProvider));
        console.log("[TX] Has request:", typeof freshProvider.request);
        console.log("[TX] Has send:", typeof freshProvider.send);
        console.log("[TX] Has sendAsync:", typeof freshProvider.sendAsync);
        
        // Check if provider has any special methods
        if (freshProvider.isWarpcast) console.log("[TX] Provider isWarpcast:", freshProvider.isWarpcast);
        if (freshProvider.isFarcaster) console.log("[TX] Provider isFarcaster:", freshProvider.isFarcaster);
        if (freshProvider.isFrame) console.log("[TX] Provider isFrame:", freshProvider.isFrame);
        
        // Re-request accounts
        console.log("[TX] Requesting accounts...");
        const accounts = await freshProvider.request({ method: "eth_requestAccounts" });
        console.log("[TX] Accounts:", accounts);
        
        if (!accounts?.[0]) {
          throw new Error("No accounts");
        }
        
        const account = accounts[0];
        
        // Try to get supported methods
        try {
          const capabilities = await freshProvider.request({
            method: "wallet_getCapabilities",
            params: [account],
          });
          console.log("[TX] Wallet capabilities:", capabilities);
        } catch (e: any) {
          console.log("[TX] wallet_getCapabilities not supported:", e?.message);
        }
        
        // APPROACH 1: Try personal_sign first to "warm up" the connection
        // Some wallets need an initial signature request before transactions work
        // Skip this for now - go straight to transaction
        
        // APPROACH 2: Use eth_sendTransaction but with the EXACT fresh provider
        // The key might be that we need to use the provider SYNCHRONOUSLY after getting it
        console.log("[TX] Attempting eth_sendTransaction with fresh provider...");
        
        const txParams = {
          from: account,
          to: to,
          data: data,
          value: "0x0",
          gas: gasLimit,
        };
        console.log("[TX] Transaction params:", JSON.stringify(txParams));
        
        result = await freshProvider.request({
          method: "eth_sendTransaction",
          params: [txParams],
        });
        
        console.log("[TX] eth_sendTransaction result:", result);
        
        if (typeof result === "string" && result.startsWith("0x") && result.length >= 66) {
          txHash = result;
          console.log("[TX] SUCCESS! Got txHash:", txHash);
          
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
        
      } catch (err: any) {
        console.error("[TX] Desktop transaction failed:", {
          message: err?.message,
          code: err?.code,
          name: err?.name,
          stack: err?.stack?.split('\n').slice(0, 3).join('\n')
        });
        
        // Re-throw so caller sees the error
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
