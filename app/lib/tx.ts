// lib/tx.ts
import { ethers } from "ethers";

export type EnsureWalletCtx = {
  signer: ethers.Signer;
  provider: ethers.providers.Provider;
  userAddress: string;
  isMini: boolean;
  ethProvider?: any; // Add the raw eth provider to context
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

  // Helper function to send wallet calls using provided ethProvider
  async function sendWalletCallsWithProvider(
    ethProvider: any,
    from: string,
    to: string,
    data: string,
    gasLimit: string = "0x1E8480"
  ): Promise<ethers.providers.TransactionResponse>
  {
    if (!ethProvider) throw new Error("Mini app provider not available");

    const req =
      ethProvider.request?.bind(ethProvider) ??
      ethProvider.send?.bind(ethProvider);

    if (!req) throw new Error("Mini app provider missing request/send method");

    let txHash: string | null = null;

    // Just use eth_sendTransaction - it's the most reliable
    console.log("[TX] Sending transaction via eth_sendTransaction...");
    const result = await req({
      method: "eth_sendTransaction",
      params: [
        { from, to, data, value: "0x0", gas: gasLimit },
      ],
    });

    if (typeof result === "string" && result.startsWith("0x")) {
      txHash = result;
    } else if (result?.hash) {
      txHash = result.hash;
    } else if (result?.txHash) {
      txHash = result.txHash;
    }

    if (!txHash || typeof txHash !== "string" || !txHash.startsWith("0x") || txHash.length < 66)
    {
      console.warn("[TX] No valid txHash received:", result);
      return {
        hash: "0x" + "0".repeat(64),
        wait: async () => null,
      } as any;
    }

    console.log("[TX] Got txHash:", txHash);

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

  // Legacy sendWalletCalls that uses deps.miniAppEthProvider (kept for backward compatibility)
  async function sendWalletCalls(
    from: string,
    to: string,
    data: string,
    gasLimit: string = "0x1E8480"
  ): Promise<ethers.providers.TransactionResponse>
  {
    return sendWalletCallsWithProvider(deps.miniAppEthProvider, from, to, data, gasLimit);
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
      // Detect if we're on mobile
      const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      // Use ethProvider from context if available (fresh from ensureWallet)
      const ethProvider = ctx.ethProvider || deps.miniAppEthProvider;
      
      // On mobile mini app, use raw provider for better compatibility
      // On desktop (even in Farcaster iframe), use signer for more stable popup handling
      if (ctx.isMini && ethProvider && isMobile)
      {
        console.log("[TX] Using raw provider (mobile mini app)");
        return await sendWalletCallsWithProvider(ethProvider, ctx.userAddress, to, data, gasLimit);
      }

      // Use signer for desktop (including desktop Farcaster) - more stable
      console.log("[TX] Using signer.sendTransaction");
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
    
    // Detect if we're on mobile
    const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

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
      // Only use raw provider on mobile mini app
      if (isMini && ethProvider && isMobile)
      {
        const data = usdcInterface.encodeFunctionData("approve", [spender, required]);
        await sendWalletCallsWithProvider(ethProvider, addr, USDC_ADDRESS, data);

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
        // Use signer for desktop (including desktop Farcaster)
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
