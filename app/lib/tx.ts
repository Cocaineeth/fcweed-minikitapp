// lib/tx.ts
import { ethers } from "ethers";
import { sdk } from "@farcaster/miniapp-sdk";

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

    // Detect if we're on desktop (not mobile)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
    
    console.log("[TX] Attempting transaction on desktop:", !isMobile);
    console.log("[TX] Account:", from);

    // Try wallet_sendCalls FIRST on desktop as it's more likely to work with Farcaster's newer wallet
    // On mobile, try eth_sendTransaction first as it's the standard
    const methodOrder = isMobile 
      ? ["eth_sendTransaction", "wallet_sendCalls"]
      : ["wallet_sendCalls", "eth_sendTransaction"];

    for (const method of methodOrder) {
      try {
        console.log(`[TX] Attempting ${method}...`);
        
        if (method === "eth_sendTransaction") {
          result = await req({
            method: "eth_sendTransaction",
            params: [
              { from, to, data, value: "0x0", gas: gasLimit, gasLimit: gasLimit },
            ],
          });
        } else {
          result = await req({
            method: "wallet_sendCalls",
            params: [
              {
                from,
                chainId: chainIdHex,
                atomicRequired: false,
                capabilities: { paymasterService: {} },
                calls: [{ to, data, value: "0x0" }],
              },
            ],
          });
        }

        console.log(`[TX] ${method} result:`, result);

        if (typeof result === "string" && result.startsWith("0x")) {
          txHash = result;
        } else {
          txHash = result?.txHashes?.[0] || result?.txHash || result?.hash || result?.id || null;
        }

        if (txHash && txHash.startsWith("0x") && txHash.length >= 66) {
          console.log(`[TX] Got txHash from ${method}:`, txHash);
          break;
        }
      } catch (err: any) {
        console.warn(`[TX] ${method} failed:`, err?.message || err?.code || err);
        
        // If user explicitly rejected, don't try other methods
        if (err?.code === 4001 || err?.message?.includes("rejected") || err?.message?.includes("denied")) {
          throw new Error("Transaction signing is not fully supported on Farcaster desktop yet. Please open this app in the Warpcast mobile app to complete transactions.");
        }
        
        // Continue to next method
        continue;
      }
    }

    if (!txHash || typeof txHash !== "string" || !txHash.startsWith("0x") || txHash.length < 66)
    {
      console.warn("[TX] No valid txHash obtained, returning placeholder");
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
      if (errMsg.includes("rejected") || errMsg.includes("denied") || err?.code === 4001)
        setMintStatus("Transaction rejected. Please approve in your wallet.");
      else if (errMsg.includes("insufficient"))
        setMintStatus("Insufficient funds for transaction.");
      else if (errMsg.includes("not fully supported"))
        setMintStatus(errMsg);
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
      if (isMini && miniAppEthProvider)
      {
        const data = usdcInterface.encodeFunctionData("approve", [spender, required]);
        await sendWalletCalls(addr, USDC_ADDRESS, data);

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
