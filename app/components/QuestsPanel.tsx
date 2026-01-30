"use client";

import { useEffect, useMemo, useState } from "react";
import type { ethers } from "ethers";
import {
  type AuthCtx,
  convertPoints,
  fetchMissionCatalog,
  fetchMyMissionProgress,
  fetchMyPointsBalance,
  MissionProgress,
  MissionRow,
  PointBalances,
} from "../lib/questsApi";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function getWeeklyMultiplier(weeklyPoints: number): number {
  if (weeklyPoints >= 500) return 2;
  if (weeklyPoints >= 200) return 1.5;
  if (weeklyPoints >= 100) return 1.25;
  if (weeklyPoints >= 50) return 1.1;
  return 1;
}

function kindLabel(k: string) {
  switch (k) {
    case "DAILY":
      return "Daily";
    case "WEEKLY":
      return "Weekly";
    case "MONTHLY":
      return "Monthly";
    case "ONCE":
      return "Special";
    default:
      return k;
  }
}

function formatTitle(title: string): string {
  // Replace underscores with spaces and convert to title case
  return title
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function QuestsPanel(props: {
  connected: boolean;
  userAddress?: string;
  signer: ethers.Signer;
  chainId: number;
  backendBaseUrl: string;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [progress, setProgress] = useState<MissionProgress[]>([]);
  const [points, setPoints] = useState<PointBalances | null>(null);

  const [convertPts, setConvertPts] = useState<number>(10);
  const [convertReward, setConvertReward] = useState<"water">("water");
  const [convertStatus, setConvertStatus] = useState<string | null>(null);

  const canLoad = props.connected && !!props.userAddress;

  const authCtx: AuthCtx | null = useMemo(() => {
    if (!props.userAddress || !props.signer) return null;
    return {
      backendBaseUrl: props.backendBaseUrl,
      address: props.userAddress,
      signer: props.signer,
      chainId: props.chainId,
    };
  }, [props.backendBaseUrl, props.userAddress, props.signer, props.chainId]);

  async function refresh() {
    if (!canLoad || !authCtx) return;

    setLoading(true);
    setErr(null);
    setConvertStatus(null);

    const controller = new AbortController();
    try {
      const [m, p, b] = await Promise.all([
        fetchMissionCatalog(props.backendBaseUrl, controller.signal),
        fetchMyMissionProgress(authCtx, controller.signal),
        fetchMyPointsBalance(authCtx, controller.signal),
      ]);
      setMissions(m);
      setProgress(p);
      setPoints(b);
    } catch (e: any) {
      setErr(e?.message || "Failed to load quests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.connected, props.userAddress, props.backendBaseUrl, authCtx]);

  const progById = useMemo(() => {
    const map = new Map<string, MissionProgress>();
    for (const pr of progress) {
      const id = (pr as any).mission_id || (pr as any).missionId || (pr as any).id || "";
      if (id) map.set(id, pr);
    }
    return map;
  }, [progress]);


    const groups = useMemo(() => {
        const out = new Map<string, MissionRow[]>();
    for (const m of missions) {
      if (!m.enabled) continue;
      const key = m.kind || "DAILY";
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(m);
    }
    for (const [, arr] of out) {
      arr.sort((a, b) => a.points === b.points ? a.title.localeCompare(b.title) : b.points - a.points);
    }
    return out;
  }, [missions]);

  const weeklyPoints = points?.weekly_points || 0;
  const mult = getWeeklyMultiplier(weeklyPoints);

  async function onConvert() {
    setConvertStatus(null);
    setErr(null);

    if (!canLoad) {
      setErr("Connect wallet first");
      return;
    }

    const pts = clamp(Math.floor(convertPts), 1, 2000);

    try {
      setLoading(true);
      if (!authCtx) throw new Error("Not authenticated");
      const out = await convertPoints(authCtx, { points: pts, reward: convertReward });
      setConvertStatus(`Converted ${pts} pts → ${out.rewardAmount} ${out.reward.toUpperCase()}`);
      await refresh();
    } catch (e: any) {
      setErr(e?.message || "Conversion failed");
    } finally {
      setLoading(false);
    }
  }

return (
    <div style={{ display: "grid", gap: 12 }}>
        <section
            style={{
                borderRadius: 16,
                border: "1px solid rgba(59,130,246,0.25)",
                background: "linear-gradient(135deg, rgba(5,8,20,0.6), rgba(15,23,42,0.8))",
                padding: 12,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                    <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 800 }}>🎯 QUESTS</div>
                    <div style={{ fontSize: 10, color: "#6b7280" }}>
                        {props.userAddress ? `${props.userAddress.slice(0, 6)}…${props.userAddress.slice(-4)}` : "Not connected"}
                    </div>
                </div>

                <button
                    type="button"
                    onClick={refresh}
                    disabled={!canLoad || loading}
                    style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid rgba(59,130,246,0.35)",
                        background: loading ? "rgba(59,130,246,0.08)" : "rgba(59,130,246,0.15)",
                        color: "#60a5fa",
                        fontWeight: 800,
                        cursor: canLoad && !loading ? "pointer" : "not-allowed",
                        fontSize: 12,
                    }}
                >
                    {loading ? "Loading…" : "Refresh"}
                </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
                <div style={{ borderRadius: 12, border: "1px solid rgba(16,185,129,0.25)", background: "rgba(16,185,129,0.08)", padding: 10 }}>
                    <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 800 }}>TOTAL POINTS</div>
                    <div style={{ fontSize: 16, color: "#10b981", fontWeight: 900 }}>{points?.total_points ?? "-"}</div>
                </div>

                <div style={{ borderRadius: 12, border: "1px solid rgba(251,191,36,0.25)", background: "rgba(251,191,36,0.08)", padding: 10 }}>
                    <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 800 }}>WEEKLY POINTS</div>
                    <div style={{ fontSize: 16, color: "#fbbf24", fontWeight: 900 }}>{weeklyPoints || 0}</div>
                </div>

                <div style={{ borderRadius: 12, border: "1px solid rgba(139,92,246,0.25)", background: "rgba(139,92,246,0.08)", padding: 10 }}>
                    <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 800 }}>MULTIPLIER</div>
                    <div style={{ fontSize: 16, color: "#a78bfa", fontWeight: 900 }}>{mult.toFixed(2)}x</div>
                </div>
            </div>

            {err && <div style={{ marginTop: 10, fontSize: 11, color: "#ef4444", fontWeight: 700 }}>{err}</div>}
            {convertStatus && <div style={{ marginTop: 10, fontSize: 11, color: "#10b981", fontWeight: 800 }}>{convertStatus}</div>}

            <div style={{ marginTop: 12, borderTop: "1px solid rgba(107,114,128,0.2)", paddingTop: 12 }}>
                <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 900, marginBottom: 8 }}>💰 Convert Points</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <select
                        value={convertPts}
                        onChange={(e) => setConvertPts(Number(e.target.value))}
                        style={{
                            width: "100%",
                            borderRadius: 12,
                            border: "1px solid rgba(107,114,128,0.3)",
                            background: "rgba(5,8,20,0.35)",
                            color: "#e5e7eb",
                            padding: "10px 10px",
                            fontSize: 12,
                            fontWeight: 800,
                            outline: "none",
                            cursor: "pointer",
                        }}
                    >
                        <option value={10}>10 points</option>
                        <option value={25}>25 points</option>
                        <option value={50}>50 points</option>
                        <option value={100}>100 points</option>
                    </select>

                    <select
                        value={convertReward}
                        disabled
                        style={{
                            width: "100%",
                            borderRadius: 12,
                            border: "1px solid rgba(107,114,128,0.3)",
                            background: "rgba(5,8,20,0.35)",
                            color: "#e5e7eb",
                            padding: "10px 10px",
                            fontSize: 12,
                            fontWeight: 800,
                            outline: "none",
                        }}
                    >
                        <option value="water">Water</option>
                    </select>
                </div>

                <button
                    type="button"
                    onClick={onConvert}
                    disabled={!canLoad || loading || convertPts > (points?.total_points || 0)}
                    style={{
                        width: "100%",
                        marginTop: 10,
                        padding: "12px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(16,185,129,0.35)",
                        background: loading || convertPts > (points?.total_points || 0) ? "rgba(107,114,128,0.15)" : "rgba(16,185,129,0.15)",
                        color: convertPts > (points?.total_points || 0) ? "#6b7280" : "#10b981",
                        fontWeight: 900,
                        cursor: canLoad && !loading && convertPts <= (points?.total_points || 0) ? "pointer" : "not-allowed",
                        fontSize: 12,
                        opacity: convertPts > (points?.total_points || 0) ? 0.5 : 1,
                    }}
                >
                    {convertPts > (points?.total_points || 0) ? "Not enough points" : "Convert"}
                </button>
            </div>
        </section>

        {[...groups.entries()].map(([kind, ms]) => (
            <section
                key={kind}
                style={{
                    borderRadius: 16,
                    border: "1px solid rgba(107,114,128,0.25)",
                    background: "rgba(5,8,20,0.3)",
                    padding: 12,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#e5e7eb" }}>{kindLabel(kind)}</div>
                    <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 800 }}>{ms.length} missions</div>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                    {ms.map((m) => {
                        const pr = progById.get(m.id);

                        const cur = pr?.progress ?? 0;
                        const comps = pr?.completions ?? 0;

                        const done = m.target > 0 && (cur >= m.target || (m.target === 1 && comps > 0));
                        const pct = m.target > 0
                                             ? clamp(((done ? m.target : cur) / m.target) * 100, 0, 100)
                                             : 0;

                        const shownCur = done && m.target === 1 ? 1 : cur;

                        return (
                            <div
                                key={m.id}
                                style={{
                                    borderRadius: 14,
                                    border: "1px solid rgba(107,114,128,0.25)",
                                    padding: 10,
                                    background: "rgba(15,23,42,0.35)",
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div
                                            style={{
                                                fontSize: 12,
                                                fontWeight: 900,
                                                color: done ? "#10b981" : "#e5e7eb",
                                                whiteSpace: "nowrap",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                            }}
                                        >
                                            {done ? "✅ " : "🎯 "}
                                            {formatTitle(m.title)}
                                        </div>

                                        <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700 }}>
                                            {shownCur}/{m.target} • {m.points} pts
                                            {m.max_completions ? ` • ${comps}/${m.max_completions} completions` : ""}
                                        </div>
                                    </div>

                                    <div style={{ textAlign: "right" }}>
                                        <div style={{ fontSize: 11, fontWeight: 900, color: "#60a5fa" }}>{formatTitle(m.event_key)}</div>
                                        {pr?.resetAt ? (
                                            <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700 }}>
                                                resets {new Date(pr.resetAt).toLocaleString()}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>

                                <div style={{ height: 8, borderRadius: 999, background: "rgba(107,114,128,0.25)", marginTop: 10, overflow: "hidden" }}>
                                    <div style={{ width: `${pct}%`, height: "100%", background: done ? "rgba(16,185,129,0.7)" : "rgba(59,130,246,0.7)" }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
        ))}

        {!canLoad && (
            <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 800, textAlign: "center", padding: 8 }}>
                Connect your wallet to view quests.
            </div>
        )}
    </div>
);
}
