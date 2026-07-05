"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";

type Kind = "legacy" | "v6";

const OLD_CONTRACTS: { name: string; address: string; kind: Kind; hasSuper: boolean }[] = [
  { name: "Season 1 · v6", address: "0xF1c619ad86e7a9C83502D4200DFD6263B5e2E020", kind: "v6", hasSuper: true },
  { name: "Season 1 · v5", address: "0xAF335bd7c4DaA6DC137815bA0d6141534CEB75D4", kind: "v6", hasSuper: true },
  { name: "Season 1 · v4", address: "0x0A79278b0017Aa90DF59696F0aA4e0648c45bb92", kind: "v6", hasSuper: true },
  { name: "Season 1 · v2", address: "0xe876f175AcD484b0F502cEA38FC9215913FCDCdb", kind: "legacy", hasSuper: false },
  { name: "Season 1 · v1", address: "0x9dA6B01BFcbf5ab256B7B1d46F316e946da85507", kind: "legacy", hasSuper: false },
];

const V6_ABI = [
  "function getUserStakedPlants(address) view returns (uint256[])",
  "function getUserStakedLands(address) view returns (uint256[])",
  "function getUserStakedSuperLands(address) view returns (uint256[])",
  "function unstakePlants(uint256[])",
  "function unstakeLands(uint256[])",
  "function unstakeSuperLands(uint256[])",
];

const LEGACY_ABI = [
  "function plantsOf(address) view returns (uint256[])",
  "function landsOf(address) view returns (uint256[])",
  "function unstakePlants(uint256[])",
  "function unstakeLands(uint256[])",
];

const ifaceV6 = new ethers.utils.Interface(V6_ABI);
const ifaceLegacy = new ethers.utils.Interface(LEGACY_ABI);

interface Holding {
  name: string;
  address: string;
  kind: Kind;
  hasSuper: boolean;
  plants: number[];
  lands: number[];
  supers: number[];
}

interface Props {
  address: string | undefined;
  provider: ethers.providers.Provider;
  sendContractTx: (to: string, data: string, gasLimit?: string) => Promise<ethers.providers.TransactionResponse | null>;
  onDone?: () => void;
}

export function SeasonOneRescue({ address, provider, sendContractTx, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [busy, setBusy] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [scanned, setScanned] = useState(false);

  const scan = useCallback(async () => {
    if (!address) return;
    setScanning(true);
    setStatus("");
    const found: Holding[] = [];
    for (const c of OLD_CONTRACTS) {
      try {
        const contract = new ethers.Contract(c.address, c.kind === "v6" ? V6_ABI : LEGACY_ABI, provider);
        const plants: ethers.BigNumber[] = c.kind === "v6"
          ? await contract.getUserStakedPlants(address).catch(() => [])
          : await contract.plantsOf(address).catch(() => []);
        const lands: ethers.BigNumber[] = c.kind === "v6"
          ? await contract.getUserStakedLands(address).catch(() => [])
          : await contract.landsOf(address).catch(() => []);
        const supers: ethers.BigNumber[] = c.kind === "v6" && c.hasSuper
          ? await contract.getUserStakedSuperLands(address).catch(() => [])
          : [];
        const P = plants.map((b) => b.toNumber());
        const L = lands.map((b) => b.toNumber());
        const S = supers.map((b) => b.toNumber());
        if (P.length + L.length + S.length > 0) {
          found.push({ name: c.name, address: c.address, kind: c.kind, hasSuper: c.hasSuper, plants: P, lands: L, supers: S });
        }
      } catch {}
    }
    setHoldings(found);
    setScanned(true);
    setScanning(false);
  }, [address, provider]);

  useEffect(() => {
    if (open && address && !scanned) scan();
  }, [open, address, scanned, scan]);

  const unstake = async (h: Holding, type: "plants" | "lands" | "supers", ids: number[]) => {
    if (ids.length === 0) return;
    const key = `${h.address}-${type}`;
    setBusy(key);
    setStatus("");
    try {
      const iface = h.kind === "v6" ? ifaceV6 : ifaceLegacy;
      const fn = type === "plants" ? "unstakePlants" : type === "lands" ? "unstakeLands" : "unstakeSuperLands";
      const data = iface.encodeFunctionData(fn, [ids]);
      const tx = await sendContractTx(h.address, data, "0x2DC6C0");
      if (tx) {
        await tx.wait();
        setStatus(`Pulled ${ids.length} from ${h.name}.`);
        setScanned(false);
        await scan();
        onDone?.();
      } else {
        setStatus("Cancelled.");
      }
    } catch (e: any) {
      const m = e?.reason || e?.message || "Failed";
      setStatus(/health|!$|!healthy/.test(m) ? "Plants must be healed to 100% first — the team is running the heal pass. Try again shortly." : m.slice(0, 90));
    } finally {
      setBusy("");
    }
  };

  const totalFound = holdings.reduce((n, h) => n + h.plants.length + h.lands.length + h.supers.length, 0);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ width: "100%", padding: "13px 14px", borderRadius: 14, border: "1px solid rgba(245,166,35,0.35)", background: "rgba(245,166,35,0.08)", color: "#f5a623", fontSize: 13.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        🔓 Season 1 Rescue — pull plants from old vaults
      </button>
    );
  }

  return (
    <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.012))", border: "1px solid rgba(245,166,35,0.3)", borderRadius: 16, padding: 16, textAlign: "left" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#f5a623" }}>🔓 Season 1 Rescue</div>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#7b84a8", fontSize: 16, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ fontSize: 11.5, color: "#8d96ba", lineHeight: 1.55, marginBottom: 14 }}>
        Everything you had staked across all Season 1 vaults, in one place. Pull your Plants, Land and Super Land back to your wallet — they carry straight into Season 2.
      </div>

      {!address && (
        <div style={{ fontSize: 12.5, color: "#aab3d6", textAlign: "center", padding: "16px 8px" }}>
          Connect your wallet to scan the Season 1 vaults for your plants.
        </div>
      )}

      {address && scanning && <div style={{ fontSize: 12, color: "#aab3d6", textAlign: "center", padding: 14 }}>Scanning the old vaults…</div>}

      {!scanning && scanned && totalFound === 0 && (
        <div style={{ fontSize: 12.5, color: "#8d96ba", textAlign: "center", padding: "18px 8px" }}>
          <div style={{ fontSize: 26, marginBottom: 6 }}>✅</div>
          Nothing left in the old vaults. You&apos;re clear for Season 2.
        </div>
      )}

      {!scanning && holdings.map((h) => (
        <div key={h.address} style={{ background: "rgba(0,0,0,0.28)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#e9edff", marginBottom: 8 }}>{h.name}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {h.plants.length > 0 && (
              <button disabled={busy !== ""} onClick={() => unstake(h, "plants", h.plants)} style={rescueBtn(busy === `${h.address}-plants`)}>
                {busy === `${h.address}-plants` ? "Pulling…" : `🌱 ${h.plants.length} Plant${h.plants.length !== 1 ? "s" : ""}`}
              </button>
            )}
            {h.lands.length > 0 && (
              <button disabled={busy !== ""} onClick={() => unstake(h, "lands", h.lands)} style={rescueBtn(busy === `${h.address}-lands`)}>
                {busy === `${h.address}-lands` ? "Pulling…" : `🏠 ${h.lands.length} Land`}
              </button>
            )}
            {h.supers.length > 0 && (
              <button disabled={busy !== ""} onClick={() => unstake(h, "supers", h.supers)} style={rescueBtn(busy === `${h.address}-supers`)}>
                {busy === `${h.address}-supers` ? "Pulling…" : `⭐ ${h.supers.length} Super Land`}
              </button>
            )}
          </div>
          {h.plants.length > 0 && h.lands.length > 0 && (
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 8 }}>If Land won&apos;t pull, unstake Plants first (capacity rule).</div>
          )}
        </div>
      ))}

      {status && <div style={{ fontSize: 12, color: status.includes("Pulled") ? "#7ef7c8" : "#ffb37a", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>{status}</div>}

      {!scanning && (
        <button onClick={() => { setScanned(false); scan(); }} style={{ width: "100%", marginTop: 10, padding: "8px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#aab3d6", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>↻ Rescan vaults</button>
      )}
    </div>
  );
}

function rescueBtn(active: boolean): React.CSSProperties {
  return {
    padding: "9px 14px",
    borderRadius: 10,
    border: "none",
    background: active ? "#374151" : "linear-gradient(180deg,#ffe08a,#f5a623)",
    color: active ? "#9ca3af" : "#1a1205",
    fontSize: 12,
    fontWeight: 800,
    cursor: active ? "default" : "pointer",
  };
}
