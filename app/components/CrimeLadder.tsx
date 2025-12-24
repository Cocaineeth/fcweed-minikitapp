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
})
{
    const {
        connected,
        loading,
        rows,
        farmerCount,
        walletRank,
        walletRow,
    } = props;

    return (
        <section className={styles.infoCard}>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                }}
            >
                <h2 className={styles.heading}>Crime Ladder — (Top Farmers)</h2>
                {props.onRefresh && (
                    <button
                        type="button"
                        className={styles.btnSecondary}
                        disabled={props.loading}
                        onClick={() => void props.onRefresh?.()}
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
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(5,8,20,0.8)",
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
                <p style={{ fontSize: 13, opacity: 0.8 }}>Loading ladder…</p>
            ) : rows.length === 0 ? (
                <p style={{ fontSize: 13, opacity: 0.8 }}>
                    Stake Plants + Land to appear on the Crime Ladder.
                </p>
            ) : (
                <div style={{ marginTop: 10, overflowX: "auto" }}>
                    <table
                        style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontSize: 12,
                        }}
                    >
                        <thead>
                            <tr>
                                <th style={{ textAlign: "left", padding: "4px 6px" }}>Rank</th>
                                <th style={{ textAlign: "left", padding: "4px 6px" }}>Farmer</th>
                                <th style={{ textAlign: "right", padding: "4px 6px" }}>Plants</th>
                                <th style={{ textAlign: "right", padding: "4px 6px" }}>Lands</th>
                                <th style={{ textAlign: "right", padding: "4px 6px" }}>Super</th>
                                <th style={{ textAlign: "right", padding: "4px 6px" }}>Score</th>
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
                                            background: isMe ? "rgba(0, 200, 130, 0.12)" : undefined,
                                        }}
                                    >
                                        <td style={{ padding: "4px 6px" }}>{idx + 1}</td>
                                        <td style={{ padding: "4px 6px" }}>
                                            {row.staker.slice(0, 6)}…{row.staker.slice(-4)}
                                        </td>
                                        <td style={{ padding: "4px 6px", textAlign: "right" }}>
                                            {row.plants}
                                        </td>
                                        <td style={{ padding: "4px 6px", textAlign: "right" }}>
                                            {row.lands}
                                        </td>
                                        <td style={{ padding: "4px 6px", textAlign: "right" }}>
                                            {row.superLands}
                                        </td>
                                        <td style={{ padding: "4px 6px", textAlign: "right" }}>
                                            {row.score}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
