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
    console.log("[TX] sendWalletCallsInternal called with:", { 
      hasProvider: !!ethProvider, 
      providerType: typeof ethProvider,
      from, 
      to: to.substring(0, 10) + "...",
      dataLength: data.length 
    });
    
    if (!ethProvider) throw new Error("Mini app provider not available");

    const chainIdHex = ethers.utils.hexValue(CHAIN_ID);
    let result: any;
    let txHash: string | null = null;

    // Detect if we're on mobile
    const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    // On desktop Farcaster, the raw provider auto-rejects. 
    // Try to import and use the SDK's sendTransaction which handles the popup properly
    if (!isMobile) {
      console.log("[TX] Desktop detected, trying Farcaster SDK sendTransaction...");
      try {
        // Dynamically import the SDK to use its sendTransaction
        const { sdk } = await import("@farcaster/miniapp-sdk");
        
        if (sdk?.wallet?.sendTransaction) {
          console.log("[TX] Using sdk.wallet.sendTransaction...");
          const sdkResult = await sdk.wallet.sendTransaction({
            chainId: `eip155:${CHAIN_ID}`,
            to: to,
            data: data,
            value: "0x0",
          });
          
          console.log("[TX] SDK sendTransaction result:", sdkResult);
          
          if (sdkResult?.transactionHash) {
            txHash = sdkResult.transactionHash;
          } else if (typeof sdkResult === 'string' && sdkResult.startsWith('0x')) {
            txHash = sdkResult;
          }
          
          if (txHash) {
            console.log("[TX] Got txHash from SDK:", txHash);
            // Return fake tx object
            const fakeTx: any = {
              hash: txHash,
              wait: async () => {
                for (let i = 0; i < 45; i++) {
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
        }
      } catch (sdkErr: any) {
        console.warn("[TX] SDK sendTransaction failed:", sdkErr?.message || sdkErr);
        // Fall through to try regular provider
      }
    }

    // Mobile path or desktop fallback: use the provider directly
    const req =
      ethProvider.request?.bind(ethProvider) ??
      ethProvider.send?.bind(ethProvider);

    console.log("[TX] Provider methods:", {
      hasRequest: !!ethProvider.request,
      hasSend: !!ethProvider.send,
      reqType: typeof req
    });

    if (!req) throw new Error("Mini app provider missing request/send method");

    // Try eth_sendTransaction first
    console.log("[TX] Attempting eth_sendTransaction...");
    try {
      result = await req({
        method: "eth_sendTransaction",
        params: [
          { from, to, data, value: "0x0", gas: gasLimit, gasLimit: gasLimit },
        ],
      });
      
      console.log("[TX] eth_sendTransaction raw result:", result);
      
      if (typeof result === "string" && result.startsWith("0x")) txHash = result;
      else txHash = result?.hash || result?.txHash || null;
      
      console.log("[TX] eth_sendTransaction parsed txHash:", txHash);
    } catch (err: any) {
      console.error("[TX] eth_sendTransaction error:", {
        code: err?.code,
        message: err?.message,
        reason: err?.reason,
        fullError: err
      });
      
      // Try wallet_sendCalls as fallback
      console.log("[TX] Trying wallet_sendCalls fallback...");
      try {
        result = await req({
          method: "wallet_sendCalls",
          params: [
            {
              from,
              chainId: chainIdHex,
              atomicRequired: false,
              capabilities: { paymasterService: {} },
              calls: [{ to, data, value: "0x0", gas: gasLimit, gasLimit: gasLimit }],
            },
          ],
        });

        console.log("[TX] wallet_sendCalls raw result:", result);

        txHash =
          result?.txHashes?.[0] ||
          result?.txHash ||
          result?.hash ||
          result?.id ||
          (typeof result === "string" && result.startsWith("0x") ? result : null);
          
        console.log("[TX] wallet_sendCalls parsed txHash:", txHash);
      } catch (fallbackErr: any) {
        console.error("[TX] wallet_sendCalls also failed:", {
          code: fallbackErr?.code,
          message: fallbackErr?.message,
          fullError: fallbackErr
        });
        throw fallbackErr;
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
