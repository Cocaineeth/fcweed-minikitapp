"use client";

import { ReactNode, useEffect, useState } from "react";
import { base } from "wagmi/chains";
import { WagmiProvider, http, createConfig, useAccount, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { parseUnits } from "viem";
import { sdk } from "@farcaster/miniapp-sdk";

import "@rainbow-me/rainbowkit/styles.css";
import {
  RainbowKitProvider,
  darkTheme,
  connectorsForWallets,
  useConnectModal,
} from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  phantomWallet,
  rabbyWallet,
} from "@rainbow-me/rainbowkit/wallets";

const DEV_WALLET = "0x5230Fdbee42a2a557bad206dB73C4205f98bF980";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PRICE = parseUnits("20", 6);

const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "3a8170812b534d0ff9d794f19a901d64";

const connectors = connectorsForWallets(
  [
    { groupName: "Installed", wallets: [phantomWallet, rabbyWallet, metaMaskWallet, coinbaseWallet] },
    { groupName: "Detected", wallets: [injectedWallet] },
    { groupName: "More Wallets", wallets: [walletConnectWallet] },
  ],
  { appName: "CARTEL", projectId }
);

const config = createConfig({
  connectors,
  chains: [base],
  transports: { [base.id]: http("https://base.publicnode.com") },
  ssr: false,
});

const queryClient = new QueryClient();

function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()} modalSize="wide" initialChain={base}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

type Item = {
  key: string;
  title: string;
  effect: string;
  sub: string;
  color: string;
  icon: ReactNode;
};

const ICONS: Record<string, ReactNode> = {
  water: (
    <svg viewBox="0 0 48 48" width="46" height="46" fill="none">
      <path d="M24 6c0 0 12 13 12 22a12 12 0 0 1-24 0C12 19 24 6 24 6z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M18 30a6 6 0 0 0 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity="0.6" />
    </svg>
  ),
  ak: (
    <svg viewBox="0 0 48 48" width="46" height="46" fill="none">
      <path d="M6 20h30l4 0v4h-8l-2 5h-4l1-5H16v3a5 5 0 0 1-5 5H9v-4h2v-4H6z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M20 20v-4h6v4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  doctor: (
    <svg viewBox="0 0 48 48" width="46" height="46" fill="none">
      <rect x="9" y="9" width="30" height="30" rx="8" stroke="currentColor" strokeWidth="2.4" />
      <path d="M24 17v14M17 24h14" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  ),
  kevlar: (
    <svg viewBox="0 0 48 48" width="46" height="46" fill="none">
      <path d="M24 6l14 5v9c0 9-6 15-14 18-8-3-14-9-14-18v-9l14-5z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M18 24l4 4 8-9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  crate: (
    <svg viewBox="0 0 48 48" width="46" height="46" fill="none">
      <rect x="9" y="9" width="30" height="30" rx="4" stroke="currentColor" strokeWidth="2.4" />
      <path d="M9 20h30M20 9v30" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      <path d="M24 26v1M24 30v.5M22 21a2 2 0 1 1 3 1.7c-.7.5-1 .9-1 1.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ),
};

const ITEMS: Item[] = [
  { key: "water", title: "WATER", effect: "5 Liters", sub: "Keeps your plants alive", color: "#38bdf8", icon: ICONS.water },
  { key: "ak", title: "AK-47", effect: "+100% ATTACK", sub: "Win the Cartel Wars", color: "#ef4444", icon: ICONS.ak },
  { key: "doctor", title: "EL DOCTOR", effect: "+100% HEALTH", sub: "Full plant recovery", color: "#34d399", icon: ICONS.doctor },
  { key: "kevlar", title: "KEVLAR", effect: "+15% DEFENSE", sub: "Soak the raids", color: "#a78bfa", icon: ICONS.kevlar },
  { key: "crate", title: "CRATE", effect: "MYSTERY DROP", sub: "Random loot inside", color: "#f59e0b", icon: ICONS.crate },
];

function Landing() {
  const { address, isConnected, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [status, setStatus] = useState<"idle" | "pending" | "mining" | "done" | "error">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string>("");

  const { isSuccess: mined } = useWaitForTransactionReceipt({ hash: txHash as `0x${string}` | undefined });

  useEffect(() => {
    if (mined && status === "mining") setStatus("done");
  }, [mined, status]);

  async function onBuy() {
    setErrMsg("");
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    try {
      setStatus("pending");
      if (chainId !== base.id) {
        await switchChainAsync({ chainId: base.id });
      }
      const hash = await writeContractAsync({
        address: USDC as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [DEV_WALLET as `0x${string}`, PRICE],
      });
      setTxHash(hash);
      setStatus("mining");
    } catch (e: any) {
      const m = e?.shortMessage || e?.message || "Transaction failed";
      if (/reject|denied|cancel/i.test(m)) setErrMsg("Transaction canceled");
      else if (/insufficient/i.test(m)) setErrMsg("Insufficient USDC or ETH for gas");
      else setErrMsg(m.slice(0, 90));
      setStatus("error");
    }
  }

  let btnLabel = "Buy for $20 USDC";
  if (!isConnected) btnLabel = "Connect Wallet to Buy";
  else if (status === "pending") btnLabel = "Confirm in wallet…";
  else if (status === "mining") btnLabel = "Processing…";
  else if (status === "done") btnLabel = "✓ Purchased — GM";

  const busy = status === "pending" || status === "mining";

  return (
    <main className="cartel-root">
      <div className="glow" />
      <div className="wrap">
        <div className="brand">CARTEL</div>
        <h1 className="headline">$20 STARTER PACK</h1>

        <div className="grid">
          {ITEMS.map((it) => (
            <div key={it.key} className="card" style={{ ["--c" as any]: it.color }}>
              <div className="icon" style={{ color: it.color }}>{it.icon}</div>
              <div className="ctitle">{it.title}</div>
              <div className="ceffect" style={{ color: it.color }}>{it.effect}</div>
              <div className="csub">{it.sub}</div>
            </div>
          ))}
        </div>

        <div className="playable">▶ PLAYABLE JULY 5</div>

        <button className="buy" onClick={onBuy} disabled={busy}>
          {btnLabel}
        </button>

        <div className="statusline">
          {status === "done" && txHash && (
            <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" className="txlink">
              You're in. View receipt ↗
            </a>
          )}
          {status === "error" && <span className="err">{errMsg}</span>}
          {isConnected && status === "idle" && (
            <span className="hint">Connected {address?.slice(0, 6)}…{address?.slice(-4)} · $20 USDC on Base</span>
          )}
        </div>
      </div>

      <style jsx>{`
        .cartel-root {
          position: relative;
          min-height: 100vh;
          background: #050812;
          color: #e6ebff;
          font-family: var(--font-inter), system-ui, sans-serif;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 18px;
        }
        .glow {
          position: absolute;
          top: -160px;
          left: 50%;
          transform: translateX(-50%);
          width: 900px;
          height: 420px;
          background: radial-gradient(ellipse at center, rgba(245, 175, 60, 0.16), rgba(5, 8, 18, 0) 70%);
          pointer-events: none;
        }
        .wrap {
          position: relative;
          width: 100%;
          max-width: 1120px;
          text-align: center;
        }
        .brand {
          color: #f2496b;
          font-weight: 800;
          letter-spacing: 0.42em;
          font-size: clamp(15px, 2.4vw, 22px);
          text-shadow: 0 0 18px rgba(242, 73, 107, 0.55);
          margin-bottom: 10px;
          padding-left: 0.42em;
        }
        .headline {
          margin: 0 0 40px;
          font-weight: 900;
          font-size: clamp(38px, 8vw, 92px);
          line-height: 0.98;
          letter-spacing: 0.01em;
          background: linear-gradient(180deg, #ffe08a 0%, #f5a623 55%, #e8890c 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter: drop-shadow(0 0 26px rgba(245, 166, 35, 0.45));
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 16px;
          margin-bottom: 34px;
        }
        .card {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));
          border: 1.5px solid var(--c);
          border-radius: 18px;
          padding: 26px 14px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2), 0 0 22px -6px var(--c);
          transition: transform 0.16s ease, box-shadow 0.16s ease;
        }
        .card:hover {
          transform: translateY(-4px);
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2), 0 0 34px -4px var(--c);
        }
        .icon {
          margin-bottom: 10px;
          filter: drop-shadow(0 0 10px currentColor);
        }
        .ctitle {
          font-weight: 800;
          font-size: clamp(15px, 1.5vw, 20px);
          letter-spacing: 0.06em;
        }
        .ceffect {
          font-weight: 800;
          font-size: clamp(12px, 1.15vw, 14px);
          letter-spacing: 0.03em;
        }
        .csub {
          color: #8b93b5;
          font-size: 12px;
          letter-spacing: 0.01em;
        }
        .playable {
          display: inline-block;
          margin: 6px auto 22px;
          padding: 13px 30px;
          border-radius: 999px;
          font-weight: 800;
          letter-spacing: 0.14em;
          font-size: clamp(14px, 1.6vw, 18px);
          color: #fff;
          background: linear-gradient(180deg, #ff5a6e, #e23a52);
          box-shadow: 0 0 34px -6px rgba(242, 73, 107, 0.85);
        }
        .buy {
          display: block;
          width: min(440px, 100%);
          margin: 0 auto;
          padding: 17px 24px;
          border: none;
          border-radius: 16px;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 0.02em;
          color: #08131a;
          cursor: pointer;
          background: linear-gradient(180deg, #7ef7c8, #21c48a);
          box-shadow: 0 0 34px -8px rgba(46, 220, 150, 0.8);
          transition: transform 0.12s ease, filter 0.12s ease;
        }
        .buy:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.05); }
        .buy:disabled { opacity: 0.65; cursor: default; }
        .statusline {
          min-height: 26px;
          margin-top: 16px;
          font-size: 13px;
        }
        .txlink { color: #7ef7c8; text-decoration: none; font-weight: 700; }
        .err { color: #ff8a9b; }
        .hint { color: #6b7398; }
        @media (max-width: 760px) {
          .grid { grid-template-columns: repeat(2, 1fr); }
          .grid .card:last-child { grid-column: 1 / -1; }
        }
        @media (max-width: 380px) {
          .grid { grid-template-columns: 1fr; }
          .grid .card:last-child { grid-column: auto; }
        }
      `}</style>
    </main>
  );
}

export default function CartelStarterPack() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    (async () => {
      try {
        await sdk.actions.ready();
      } catch {}
    })();
  }, []);

  if (!mounted) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#050812", color: "#f2496b", fontWeight: 800, letterSpacing: "0.4em" }}>
        CARTEL
      </div>
    );
  }

  return (
    <Providers>
      <Landing />
    </Providers>
  );
}
