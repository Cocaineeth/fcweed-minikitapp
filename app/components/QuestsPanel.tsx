"use client";

import { useEffect, useMemo, useState } from "react";
import type { ethers } from "ethers";
import {
  type AuthCtx,
  convertPoints,
  emitOffchainEvent,
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

  const [convertPts, setConvertPts] = useState<number>(25);
  const [convertReward, setConvertReward] = useState<"water" | "dust">("water");
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
      // Handle both camelCase (missionId) and snake_case (mission_id)
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
    <div style={{ display: "grid", gap: 14 }}>
        {/* Header Card */}
        <section
            style={{
                borderRadius: 18,
                border: "1px solid rgba(59,130,246,0.3)",
                background: "linear-gradient(145deg, rgba(5,8,20,0.7), rgba(15,23,42,0.9))",
                padding: 16,
                boxShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                    <div style={{ fontSize: 14, color: "#60a5fa", fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 18 }}>🎯</span> QUEST HUB
                    </div>
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 3 }}>
                        {props.userAddress ? `${props.userAddress.slice(0, 6)}…${props.userAddress.slice(-4)}` : "Not connected"}
                    </div>
                </div>

                <button
                    type="button"
                    onClick={refresh}
                    disabled={!canLoad || loading}
                    style={{
                        padding: "10px 16px",
                        borderRadius: 12,
                        border: "1px solid rgba(59,130,246,0.4)",
                        background: loading 
                            ? "rgba(59,130,246,0.1)" 
                            : "linear-gradient(135deg, rgba(59,130,246,0.25), rgba(59,130,246,0.1))",
                        color: "#60a5fa",
                        fontWeight: 700,
                        cursor: canLoad && !loading ? "pointer" : "not-allowed",
                        fontSize: 12,
                        transition: "all 0.2s ease",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                    }}
                >
                    <span style={{ 
                        display: "inline-block",
                        animation: loading ? "spin 1s linear infinite" : "none",
                    }}>🔄</span>
                    {loading ? "Loading" : "Refresh"}
                </button>
            </div>

            {/* Stats Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 14 }}>
                <div style={{ 
                    borderRadius: 14, 
                    border: "1px solid rgba(16,185,129,0.35)", 
                    background: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))", 
                    padding: "12px 10px",
                    textAlign: "center",
                }}>
                    <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>Total Points</div>
                    <div style={{ fontSize: 20, color: "#10b981", fontWeight: 900, marginTop: 4 }}>{points?.total_points ?? "-"}</div>
                </div>

                <div style={{ 
                    borderRadius: 14, 
                    border: "1px solid rgba(251,191,36,0.35)", 
                    background: "linear-gradient(135deg, rgba(251,191,36,0.15), rgba(251,191,36,0.05))", 
                    padding: "12px 10px",
                    textAlign: "center",
                }}>
                    <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>Weekly</div>
                    <div style={{ fontSize: 20, color: "#fbbf24", fontWeight: 900, marginTop: 4 }}>{weeklyPoints || 0}</div>
                </div>

                <div style={{ 
                    borderRadius: 14, 
                    border: "1px solid rgba(139,92,246,0.35)", 
                    background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(139,92,246,0.05))", 
                    padding: "12px 10px",
                    textAlign: "center",
                }}>
                    <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>Multiplier</div>
                    <div style={{ fontSize: 20, color: "#a78bfa", fontWeight: 900, marginTop: 4 }}>{mult.toFixed(2)}x</div>
                </div>
            </div>

            {err && (
                <div style={{ 
                    marginTop: 12, 
                    fontSize: 11, 
                    color: "#ef4444", 
                    fontWeight: 700,
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                }}>
                    ⚠️ {err}
                </div>
            )}
            {convertStatus && (
                <div style={{ 
                    marginTop: 12, 
                    fontSize: 11, 
                    color: "#10b981", 
                    fontWeight: 700,
                    background: "rgba(16,185,129,0.1)",
                    border: "1px solid rgba(16,185,129,0.3)",
                    borderRadius: 10,
                    padding: "10px 12px",
                }}>
                    {convertStatus}
                </div>
            )}

            {/* Convert Section */}
            <div style={{ marginTop: 14, borderTop: "1px solid rgba(107,114,128,0.15)", paddingTop: 14 }}>
                <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 800, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>💰</span> Convert Points
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <input
                        inputMode="numeric"
                        value={convertPts}
                        onChange={(e) => setConvertPts(Number(e.target.value) || 0)}
                        placeholder="Points"
                        style={{
                            width: "100%",
                            borderRadius: 12,
                            border: "1px solid rgba(107,114,128,0.3)",
                            background: "rgba(5,8,20,0.6)",
                            color: "#e5e7eb",
                            padding: "12px 14px",
                            fontSize: 13,
                            fontWeight: 700,
                            outline: "none",
                            boxSizing: "border-box",
                        }}
                    />

                    <select
                        value={convertReward}
                        onChange={(e) => setConvertReward(e.target.value as any)}
                        style={{
                            width: "100%",
                            borderRadius: 12,
                            border: "1px solid rgba(107,114,128,0.3)",
                            background: "rgba(5,8,20,0.6)",
                            color: "#e5e7eb",
                            padding: "12px 14px",
                            fontSize: 13,
                            fontWeight: 700,
                            outline: "none",
                            boxSizing: "border-box",
                            cursor: "pointer",
                        }}
                    >
                        <option value="water">💧 Water</option>
                        <option value="dust">✨ Dust</option>
                    </select>
                </div>

                <button
                    type="button"
                    onClick={onConvert}
                    disabled={!canLoad || loading}
                    style={{
                        width: "100%",
                        marginTop: 12,
                        padding: "14px",
                        borderRadius: 14,
                        border: "none",
                        background: !canLoad || loading 
                            ? "rgba(107,114,128,0.2)" 
                            : "linear-gradient(135deg, #10b981, #059669)",
                        color: !canLoad || loading ? "#6b7280" : "#fff",
                        fontWeight: 800,
                        cursor: canLoad && !loading ? "pointer" : "not-allowed",
                        fontSize: 13,
                        transition: "all 0.2s ease",
                        boxShadow: canLoad && !loading ? "0 4px 15px rgba(16,185,129,0.25)" : "none",
                    }}
                >
                    {loading ? "Converting..." : "Convert Points"}
                </button>
            </div>
        </section>

        {[...groups.entries()].map(([kind, ms]) => {
            const kindColors: Record<string, { color: string; border: string; icon: string }> = {
                DAILY: { color: "#60a5fa", border: "rgba(59,130,246,0.3)", icon: "📅" },
                WEEKLY: { color: "#a78bfa", border: "rgba(139,92,246,0.3)", icon: "📆" },
                MONTHLY: { color: "#fbbf24", border: "rgba(251,191,36,0.3)", icon: "🗓️" },
                ONCE: { color: "#10b981", border: "rgba(16,185,129,0.3)", icon: "⭐" },
            };
            const kc = kindColors[kind] || kindColors.DAILY;

            return (
            <section
                key={kind}
                style={{
                    borderRadius: 18,
                    border: `1px solid ${kc.border}`,
                    background: "linear-gradient(145deg, rgba(5,8,20,0.6), rgba(15,23,42,0.8))",
                    padding: 14,
                    boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{kc.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: kc.color }}>{kindLabel(kind)}</span>
                    </div>
                    <div style={{ 
                        fontSize: 10, 
                        color: "#6b7280", 
                        fontWeight: 700,
                        background: "rgba(107,114,128,0.15)",
                        padding: "4px 10px",
                        borderRadius: 20,
                    }}>
                        {ms.length} mission{ms.length !== 1 ? "s" : ""}
                    </div>
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
                                    border: done 
                                        ? "1px solid rgba(16,185,129,0.4)" 
                                        : "1px solid rgba(107,114,128,0.2)",
                                    padding: 12,
                                    background: done 
                                        ? "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))"
                                        : "rgba(15,23,42,0.5)",
                                    transition: "all 0.2s ease",
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div
                                            style={{
                                                fontSize: 13,
                                                fontWeight: 800,
                                                color: done ? "#10b981" : "#e5e7eb",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 6,
                                            }}
                                        >
                                            <span style={{ fontSize: 14 }}>{done ? "✅" : "⬜"}</span>
                                            <span style={{
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}>
                                                {m.title}
                                            </span>
                                        </div>

                                        <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginTop: 4 }}>
                                            <span style={{ color: "#fbbf24", fontWeight: 700 }}>+{m.points} pts</span>
                                            <span style={{ margin: "0 6px", opacity: 0.4 }}>•</span>
                                            <span>{shownCur}/{m.target}</span>
                                            {m.max_completions ? (
                                                <>
                                                    <span style={{ margin: "0 6px", opacity: 0.4 }}>•</span>
                                                    <span>{comps}/{m.max_completions} done</span>
                                                </>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                                        <div style={{ 
                                            fontSize: 9, 
                                            fontWeight: 700, 
                                            color: kc.color,
                                            background: `${kc.color}15`,
                                            padding: "3px 8px",
                                            borderRadius: 6,
                                        }}>
                                            {m.event_key}
                                        </div>
                                        {pr?.resetAt ? (
                                            <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 600, marginTop: 4 }}>
                                                ⏱️ {new Date(pr.resetAt).toLocaleDateString()}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div style={{ 
                                    height: 6, 
                                    borderRadius: 999, 
                                    background: "rgba(107,114,128,0.2)", 
                                    marginTop: 10, 
                                    overflow: "hidden" 
                                }}>
                                    <div style={{ 
                                        width: `${pct}%`, 
                                        height: "100%", 
                                        background: done 
                                            ? "linear-gradient(90deg, #10b981, #34d399)" 
                                            : `linear-gradient(90deg, ${kc.color}, ${kc.color}99)`,
                                        transition: "width 0.3s ease",
                                        borderRadius: 999,
                                    }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
        )})}

        {!canLoad && (
            <div style={{ 
                textAlign: "center", 
                padding: 32,
                background: "linear-gradient(145deg, rgba(5,8,20,0.6), rgba(15,23,42,0.8))",
                borderRadius: 18,
                border: "1px solid rgba(107,114,128,0.2)",
            }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
                <div style={{ fontSize: 13, color: "#9ca3af", fontWeight: 700 }}>
                    Connect your wallet to view quests
                </div>
            </div>
        )}

        {/* Spinner Animation */}
        <style>{`
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `}</style>
    </div>
);
}
