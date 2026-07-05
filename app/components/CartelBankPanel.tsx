"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { CARTEL_BANK_ADDRESS, CARTEL_PAIR_ADDRESS, CARTEL_STAKING_ADDRESS, BANK_QUALIFY_USD, BANK_LOCK_DAYS, BANK_EARLY_EXIT_PCT } from "../lib/cartelConstants";

const BANK_ABI = [
  "function getBankStats() view returns (uint256 locked, uint256 lockedValueUsdc, uint256 lockerCount, uint256 distributed, uint256 penalties, uint256 threshold, uint256 rate)",
  "function getPosition(address) view returns (uint256 amount, uint256 valueUsdcNow, uint256 qualifiedValueUsdc, uint256 unlockAt, bool autoRenew, bool qualified, uint256 pending)",
  "function lpValueUsdc(uint256) view returns (uint256)",
  "function lock(uint256)",
  "function claim()",
  "function stopRenewal()",
  "function unlock()",
  "function earlyExit()",
  "function convertToCartel(uint256)",
  "function lastBankConvert(address) view returns (uint256)",
  "function bankConversionCooldown() view returns (uint256)",
];

const LP_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

const STAKING_MIN_ABI = ["function getXCartelBalance(address) view returns (uint256)"];

const bankInterface = new ethers.utils.Interface(BANK_ABI);
const lpInterface = new ethers.utils.Interface(LP_ABI);

interface CartelBankPanelProps {
  address: string | undefined;
  provider: ethers.providers.Provider;
  sendContractTx: (to: string, data: string, gasLimit?: string) => Promise<ethers.providers.TransactionResponse | null>;
  onSuccess?: () => void;
}

const card: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012))",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 16,
  padding: 18,
};

const label: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#7b84a8",
  fontWeight: 700,
};

const big: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
  color: "#e9edff",
  lineHeight: 1.15,
  marginTop: 4,
};

function fmtUsd(bn: ethers.BigNumber) {
  const n = parseFloat(ethers.utils.formatUnits(bn, 6));
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtLp(bn: ethers.BigNumber) {
  const n = parseFloat(ethers.utils.formatEther(bn));
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
  return n.toFixed(4);
}

function fmtCountdown(target: number) {
  const s = Math.max(0, target - Math.floor(Date.now() / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function CartelBankPanel({ address, provider, sendContractTx, onSuccess }: CartelBankPanelProps) {
  const [stats, setStats] = useState<any>(null);
  const [pos, setPos] = useState<any>(null);
  const [lpBalance, setLpBalance] = useState(ethers.constants.Zero);
  const [xBalance, setXBalance] = useState(ethers.constants.Zero);
  const [lockAmount, setLockAmount] = useState("");
  const [convertAmount, setConvertAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [confirmExit, setConfirmExit] = useState(false);

  const ready = CARTEL_BANK_ADDRESS !== "" && CARTEL_PAIR_ADDRESS !== "";

  const load = useCallback(async () => {
    if (!ready || !provider) return;
    try {
      const bank = new ethers.Contract(CARTEL_BANK_ADDRESS, BANK_ABI, provider);
      const s = await bank.getBankStats();
      setStats(s);
      if (address) {
        const lp = new ethers.Contract(CARTEL_PAIR_ADDRESS, LP_ABI, provider);
        const staking = new ethers.Contract(CARTEL_STAKING_ADDRESS, STAKING_MIN_ABI, provider);
        const [p, bal, x] = await Promise.all([
          bank.getPosition(address),
          lp.balanceOf(address),
          staking.getXCartelBalance(address).catch(() => ethers.constants.Zero),
        ]);
        setPos(p);
        setLpBalance(bal);
        setXBalance(x);
      }
    } catch (e) {
      console.error("[Bank] load failed", e);
    }
  }, [ready, provider, address]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const run = async (fn: () => Promise<void>, doing: string, done: string) => {
    if (busy) return;
    setBusy(true);
    setStatus(doing);
    try {
      await fn();
      setStatus(done);
      await load();
      onSuccess?.();
    } catch (e: any) {
      const m = e?.reason || e?.message || "Failed";
      setStatus(m.includes("cancel") ? "Cancelled" : m.slice(0, 80));
    } finally {
      setBusy(false);
      setConfirmExit(false);
    }
  };

  const handleLock = () =>
    run(async () => {
      if (!address) throw new Error("Connect wallet");
      const amt = ethers.utils.parseEther(lockAmount || "0");
      if (amt.isZero() || amt.gt(lpBalance)) throw new Error("Check the amount");
      const lp = new ethers.Contract(CARTEL_PAIR_ADDRESS, LP_ABI, provider);
      const allowance = await lp.allowance(address, CARTEL_BANK_ADDRESS);
      if (allowance.lt(amt)) {
        setStatus("Approving LP…");
        const txA = await sendContractTx(CARTEL_PAIR_ADDRESS, lpInterface.encodeFunctionData("approve", [CARTEL_BANK_ADDRESS, ethers.constants.MaxUint256]));
        if (txA) await txA.wait();
      }
      setStatus("Locking…");
      const tx = await sendContractTx(CARTEL_BANK_ADDRESS, bankInterface.encodeFunctionData("lock", [amt]));
      if (tx) await tx.wait();
      setLockAmount("");
    }, "Locking LP…", "Locked. You're in the Bank.");

  const handleClaim = () =>
    run(async () => {
      const tx = await sendContractTx(CARTEL_BANK_ADDRESS, bankInterface.encodeFunctionData("claim", []));
      if (tx) await tx.wait();
    }, "Claiming USDC…", "USDC claimed.");

  const handleConvert = () =>
    run(async () => {
      const amt = ethers.utils.parseEther(convertAmount || "0");
      if (amt.isZero() || amt.gt(xBalance)) throw new Error("Check the amount");
      const tx = await sendContractTx(CARTEL_BANK_ADDRESS, bankInterface.encodeFunctionData("convertToCartel", [amt]));
      if (tx) await tx.wait();
      setConvertAmount("");
    }, "Converting 2:1…", "Converted at the member rate.");

  const handleStopRenewal = () =>
    run(async () => {
      const tx = await sendContractTx(CARTEL_BANK_ADDRESS, bankInterface.encodeFunctionData("stopRenewal", []));
      if (tx) await tx.wait();
    }, "Stopping renewal…", "Renewal off. Unlock opens when the term ends.");

  const handleUnlock = () =>
    run(async () => {
      const tx = await sendContractTx(CARTEL_BANK_ADDRESS, bankInterface.encodeFunctionData("unlock", []));
      if (tx) await tx.wait();
    }, "Unlocking…", "LP returned in full.");

  const handleEarlyExit = () =>
    run(async () => {
      const tx = await sendContractTx(CARTEL_BANK_ADDRESS, bankInterface.encodeFunctionData("earlyExit", []));
      if (tx) await tx.wait();
    }, "Exiting early…", "Exited. Penalty applied.");

  if (!ready) {
    return (
      <div style={{ ...card, textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>🏦</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#e9edff" }}>The Bank opens with the season</div>
        <div style={{ color: "#7b84a8", fontSize: 13, marginTop: 6 }}>Lock liquidity. Earn the street tax. Convert at 2:1.</div>
      </div>
    );
  }

  const hasPosition = pos && !pos.amount.isZero();
  const qualified = hasPosition && pos.qualified;
  const pending = pos ? pos.pending : ethers.constants.Zero;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <div style={card}>
          <div style={label}>Vault Total</div>
          <div style={big}>${stats ? fmtUsd(stats.lockedValueUsdc) : "—"}</div>
        </div>
        <div style={card}>
          <div style={label}>Members</div>
          <div style={big}>{stats ? stats.lockerCount.toString() : "—"}</div>
        </div>
        <div style={card}>
          <div style={label}>USDC Paid Out</div>
          <div style={{ ...big, color: "#7ef7c8" }}>${stats ? fmtUsd(stats.distributed) : "—"}</div>
        </div>
      </div>

      {hasPosition ? (
        <div style={{ ...card, border: qualified ? "1px solid rgba(245,166,35,0.45)" : (card.border as string) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={label}>Your Position</div>
              <div style={big}>${fmtUsd(pos.valueUsdcNow)}</div>
              <div style={{ color: "#7b84a8", fontSize: 12, marginTop: 2 }}>{fmtLp(pos.amount)} LP locked</div>
            </div>
            {qualified && (
              <div style={{ background: "linear-gradient(180deg,#ffe08a,#f5a623)", color: "#1a1205", fontWeight: 900, fontSize: 11, letterSpacing: "0.08em", padding: "6px 12px", borderRadius: 999 }}>
                2:1 MEMBER
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
            <div>
              <div style={label}>Pending USDC</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#7ef7c8", marginTop: 3 }}>${fmtUsd(pending)}</div>
            </div>
            <div>
              <div style={label}>{pos.autoRenew ? "Renews In" : "Unlocks In"}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#e9edff", marginTop: 3 }}>{fmtCountdown(pos.unlockAt.toNumber())}</div>
            </div>
            <div>
              <div style={label}>Auto-Renew</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: pos.autoRenew ? "#7ef7c8" : "#ff8a9b", marginTop: 3 }}>{pos.autoRenew ? "ON" : "OFF"}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button className="bankBtn bankPrimary" disabled={busy || pending.isZero()} onClick={handleClaim}>
              Claim ${fmtUsd(pending)}
            </button>
            {pos.autoRenew ? (
              <button className="bankBtn" disabled={busy} onClick={handleStopRenewal}>Stop Renewal</button>
            ) : (
              <button className="bankBtn" disabled={busy || pos.unlockAt.toNumber() > Date.now() / 1000} onClick={handleUnlock}>Unlock</button>
            )}
            {!confirmExit ? (
              <button className="bankBtn bankDanger" disabled={busy} onClick={() => setConfirmExit(true)}>Early Exit</button>
            ) : (
              <button className="bankBtn bankDanger" disabled={busy} onClick={handleEarlyExit}>
                Confirm: lose {BANK_EARLY_EXIT_PCT}% + pending
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={card}>
          <div style={label}>Open a Position</div>
          <div style={{ color: "#aab3d6", fontSize: 13, marginTop: 8, lineHeight: 1.55 }}>
            Pair CARTEL with USDC on the DEX, then lock the LP here. Lock ${BANK_QUALIFY_USD.toLocaleString()}+ and your conversion rate drops from 3:1 to 2:1 for as long as you stay locked.
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={label}>Lock LP</div>
          <div style={{ fontSize: 11, color: "#7b84a8" }}>
            Wallet: {fmtLp(lpBalance)} LP
            <button className="bankMax" onClick={() => setLockAmount(ethers.utils.formatEther(lpBalance))}>MAX</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            className="bankInput"
            placeholder="0.0"
            value={lockAmount}
            onChange={(e) => setLockAmount(e.target.value)}
            inputMode="decimal"
          />
          <button className="bankBtn bankPrimary" disabled={busy || !address} onClick={handleLock}>
            Lock {BANK_LOCK_DAYS}d
          </button>
        </div>
      </div>

      {qualified && (
        <div style={{ ...card, borderColor: "rgba(245,166,35,0.35)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={label}>Member Conversion — 2:1</div>
            <div style={{ fontSize: 11, color: "#7b84a8" }}>
              xCARTEL: {fmtLp(xBalance)}
              <button className="bankMax" onClick={() => setConvertAmount(ethers.utils.formatEther(xBalance))}>MAX</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input
              className="bankInput"
              placeholder="0.0"
              value={convertAmount}
              onChange={(e) => setConvertAmount(e.target.value)}
              inputMode="decimal"
            />
            <button className="bankBtn bankGold" disabled={busy} onClick={handleConvert}>Convert</button>
          </div>
          <div style={{ fontSize: 11, color: "#7b84a8", marginTop: 8 }}>
            Everyone else pays 3. You pay 2. Converting extends your lock.
          </div>
        </div>
      )}

      {status && <div style={{ textAlign: "center", fontSize: 13, color: "#aab3d6" }}>{status}</div>}

      <div style={card}>
        <div style={{ ...label, marginBottom: 6 }}>How the Bank Works</div>
        {[
          ["Where the yield comes from", "Every trade pays the house — 3% on buys, 3% on sells. Half of that (1.5% + 1.5%) is swapped to USDC and paid to lockers, split by share of the vault. Real stablecoins, not more tokens."],
          ["The 2:1 privilege", `Lock $${BANK_QUALIFY_USD.toLocaleString()} or more and your xCARTEL converts at 2:1 instead of 3:1 — a 50% bigger payout on every conversion, for as long as you're locked. Your dollar value is measured when you lock, so a red day doesn't take it from you.`],
          ["The lock", `${BANK_LOCK_DAYS} days, renewing automatically. Want out? Stop renewal and the vault releases you at the end of the current term — full LP back, no penalty.`],
          ["Leaving early", `Break the term and it costs ${BANK_EARLY_EXIT_PCT}% of your LP plus any unclaimed USDC — which gets split among the members who stayed.`],
        ].map(([t, d]) => (
          <details key={t as string} className="bankRow">
            <summary>{t}</summary>
            <p>{d}</p>
          </details>
        ))}
      </div>

      <style jsx>{`
        .bankBtn {
          padding: 10px 16px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.05);
          color: #e9edff;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: transform 0.12s ease, filter 0.12s ease;
        }
        .bankBtn:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.12); }
        .bankBtn:disabled { opacity: 0.45; cursor: default; }
        .bankPrimary {
          background: linear-gradient(180deg, #7ef7c8, #21c48a);
          border: none;
          color: #08131a;
        }
        .bankGold {
          background: linear-gradient(180deg, #ffe08a, #f5a623);
          border: none;
          color: #1a1205;
        }
        .bankDanger {
          border-color: rgba(242, 73, 107, 0.4);
          color: #ff8a9b;
        }
        .bankInput {
          flex: 1;
          min-width: 0;
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 10px 14px;
          color: #e9edff;
          font-size: 15px;
          font-weight: 700;
          outline: none;
        }
        .bankInput:focus { border-color: rgba(245, 166, 35, 0.5); }
        .bankMax {
          margin-left: 8px;
          background: none;
          border: none;
          color: #f5a623;
          font-weight: 800;
          font-size: 11px;
          cursor: pointer;
          letter-spacing: 0.06em;
        }
        .bankRow {
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          padding: 10px 2px;
        }
        .bankRow summary {
          cursor: pointer;
          font-weight: 700;
          font-size: 13.5px;
          color: #cdd5f5;
          list-style: none;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .bankRow summary::after {
          content: "+";
          color: #f5a623;
          font-weight: 800;
        }
        .bankRow[open] summary::after { content: "–"; }
        .bankRow p {
          margin: 8px 0 2px;
          color: #8d96ba;
          font-size: 12.5px;
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}
