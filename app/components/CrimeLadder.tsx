"use client";

import styles from "../page.module.css";
import type { LeaderboardItem } from "../lib/leaderboard";

export function CrimeLadder(props: {
    connected: boolean;
    loading: boolean;
    rows: LeaderboardItem[];
    farmerCount: number;
    walletRank: number | null;
    walletRow: LeaderboardItem | null;
    onRefresh?: () => Promise<void> | void;
    theme?: "dark" | "light";
})
{
    const {
        connected,
        loading,
        rows,
        farmerCount,
        walletRank,
        walletRow,
        theme = "dark",
    } = props;

    const isLight = theme === "light";

    return (
        <>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                }}
            >
                <h2 className={styles.heading} style={{ color: isLight ? "#1e293b" : undefined }}>Crime Ladder — (Top Farmers)</h2>
                {props.onRefresh && (
                    <button
                        type="button"
                        className={styles.btnSecondary}
                        disabled={props.loading}
                        onClick={() => void props.onRefresh?.()}
                        style={{
                            background: isLight ? "#f1f5f9" : undefined,
                            borderColor: isLight ? "#cbd5e1" : undefined,
                            color: isLight ? "#1e293b" : undefined,
                        }}
                    >
                        {props.loading ? "Refreshing…" : "Refresh"}
                    </button>
                )}
            </div>

            {connected && farmerCount > 0 && (
                <div
                    style={{
                        fontSize: 12,
                        margin: "4px 0 10px",
                        padding: "6px 8px",
                        borderRadius: 10,
                        border: `1px solid ${isLight ? "#e2e8f0" : "rgba(255,255,255,0.12)"}`,
                        background: isLight ? "#f8fafc" : "rgba(5,8,20,0.8)",
                        color: isLight ? "#1e293b" : undefined,
                    }}
                >
                    {walletRow && walletRank ? (
                        <>
                            <div style={{ marginBottom: 4 }}>
                                Your rank: <b>#{walletRank}</b> out of <b>{farmerCount}</b>{" "}
                                staked wallets.
                            </div>

                            <div
                                style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 10,
                                    opacity: 0.9,
                                }}
                            >
                                <span>
                                    Plants: <b>{walletRow.plants}</b>
                                </span>
                                <span>
                                    Lands: <b>{walletRow.lands}</b>
                                </span>
                                <span>
                                    SuperLands: <b>{walletRow.superLands}</b>
                                </span>
                                <span>
                                    Score: <b>{walletRow.score}</b>
                                </span>
                            </div>
                        </>
                    ) : (
                        <span>
                            You&apos;re not on the Crime Ladder yet. Stake Plants + Land to
                            start earning.
                        </span>
                    )}
                </div>
            )}

            {loading ? (
                <p style={{ fontSize: 13, opacity: 0.8, color: isLight ? "#64748b" : undefined }}>Loading ladder…</p>
            ) : rows.length === 0 ? (
                <p style={{ fontSize: 13, opacity: 0.8, color: isLight ? "#64748b" : undefined }}>
                    Stake Plants + Land to appear on the Crime Ladder.
                </p>
            ) : (
                <div style={{ marginTop: 10, overflowX: "auto" }}>
                    <table
                        style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontSize: 12,
                            color: isLight ? "#1e293b" : undefined,
                        }}
                    >
                        <thead>
                            <tr style={{ borderBottom: `1px solid ${isLight ? "#e2e8f0" : "rgba(255,255,255,0.1)"}` }}>
                                <th style={{ textAlign: "left", padding: "4px 6px", color: isLight ? "#64748b" : "#9ca3af" }}>Rank</th>
                                <th style={{ textAlign: "left", padding: "4px 6px", color: isLight ? "#64748b" : "#9ca3af" }}>Farmer</th>
                                <th style={{ textAlign: "right", padding: "4px 6px", color: isLight ? "#64748b" : "#9ca3af" }}>Plants</th>
                                <th style={{ textAlign: "right", padding: "4px 6px", color: isLight ? "#64748b" : "#9ca3af" }}>Lands</th>
                                <th style={{ textAlign: "right", padding: "4px 6px", color: isLight ? "#64748b" : "#9ca3af" }}>Super</th>
                                <th style={{ textAlign: "right", padding: "4px 6px", color: isLight ? "#64748b" : "#9ca3af" }}>Score</th>
                            </tr>
                        </thead>

                        <tbody>
                            {rows.map((row, idx) => {
                                const isMe =
                                    walletRow &&
                                    walletRow.staker.toLowerCase() === row.staker.toLowerCase();

                                return (
                                    <tr
                                        key={row.staker}
                                        style={{
                                            background: isMe 
                                                ? (isLight ? "rgba(16, 185, 129, 0.1)" : "rgba(0, 200, 130, 0.12)") 
                                                : undefined,
                                            borderBottom: `1px solid ${isLight ? "#f1f5f9" : "rgba(255,255,255,0.05)"}`,
                                        }}
                                    >
                                        <td style={{ padding: "6px", fontWeight: isMe ? 600 : undefined }}>{idx + 1}</td>
                                        <td style={{ padding: "6px", fontWeight: isMe ? 600 : undefined }}>
                                            {row.staker.slice(0, 6)}…{row.staker.slice(-4)}
                                        </td>
                                        <td style={{ padding: "6px", textAlign: "right" }}>
                                            {row.plants}
                                        </td>
                                        <td style={{ padding: "6px", textAlign: "right" }}>
                                            {row.lands}
                                        </td>
                                        <td style={{ padding: "6px", textAlign: "right" }}>
                                            {row.superLands}
                                        </td>
                                        <td style={{ padding: "6px", textAlign: "right", fontWeight: 600, color: isLight ? "#16a34a" : "#10b981" }}>
                                            {row.score}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}
