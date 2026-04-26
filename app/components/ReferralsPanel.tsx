"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import styles from "../page.module.css";
import { authedFetch, clearAuthStorage } from "../lib/referralAuth";

type Props = {
    connected: boolean;
    userAddress: string | null;
    signer: ethers.Signer | null;
    chainId: number;
    backendBaseUrl: string;
    signMessageAsync?: (message: string) => Promise<string>;
};

type ReferralSummary = {
    address: string;
    myCode: string;
    referralUrl: string;
    referredBy?: string | null;
    totalReferrals: number;
    totalRewards?: string | null;
    plantsStaked?: number;
    pendingRedeem?: number;
    canReferMore?: boolean;
};

export function ReferralsPanel(props: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");
    const [summary, setSummary] = useState<ReferralSummary | null>(null);
    const [referrerCode, setReferrerCode] = useState<string>("");
    const [claimTx, setClaimTx] = useState<string>("");
    const [copied, setCopied] = useState(false);

    const canAuth = props.connected && !!props.userAddress && (!!props.signer || !!props.signMessageAsync);
    const rewardPerReferral = 0.5;

    const referralBaseUrl = useMemo(() => {
        if (typeof window === "undefined") {
            return "";
        }
        return window.location.origin;
    }, []);

    const loadSummary = useCallback(async () => {
        if (!canAuth || !props.userAddress) return;
        setLoading(true);
        setError("");

        try {
            const codeRes = await authedFetch({
                url: `${props.backendBaseUrl}/v1/referrals/code`,
                backendBaseUrl: props.backendBaseUrl,
                address: props.userAddress,
                signer: props.signer,
                chainId: props.chainId,
                signMessageAsync: props.signMessageAsync,
                init: { method: "GET" }
            });

            const codeText = await codeRes.text().catch(() => "");
            if (!codeRes.ok) throw new Error(`Code failed (${codeRes.status}): ${codeText.slice(0, 140)}`);
            const codeJson = JSON.parse(codeText);
            const myCode = (codeJson?.code || "").toString();

            const statsRes = await authedFetch({
                url: `${props.backendBaseUrl}/v1/referrals/stats`,
                backendBaseUrl: props.backendBaseUrl,
                address: props.userAddress,
                signer: props.signer,
                chainId: props.chainId,
                signMessageAsync: props.signMessageAsync,
            });

            const j = await statsRes.json();

            // Backend returns stats at the top level — not under j.stats.
            // Fields: { code, totalReferred, pendingPoints, claimedPoints, referredBy }
            const st = j?.stats || j || {};

            setSummary({
                address: props.userAddress,
                myCode: myCode || st.code || "",
                referralUrl: "",
                referredBy: st.referredBy ?? null,
                plantsStaked: st.plantsStaked,
                totalReferrals: Number(st.totalReferred ?? st.numberReferred ?? 0),
                totalRewards: null,
                pendingRedeem: Number(st.pendingPoints ?? st.pendingRedeem ?? 0),
                canReferMore: st.canReferMore !== false  // default true; backend has no cap
            });
        } catch (e: any) {
            setError(e?.message || String(e));
            setSummary(null);
        } finally {
            setLoading(false);
        }
    }, [canAuth, props.backendBaseUrl, props.chainId, props.signer, props.userAddress, referralBaseUrl]);

    useEffect(() => {
        if (!canAuth) {
            setSummary(null);
            return;
        }
        loadSummary();
    }, [canAuth, loadSummary]);

    const onCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            prompt("Copy:", text);
        }
    };

    const onApplyReferrer = useCallback(async () => {
        if (!canAuth || !props.userAddress || !props.signer) {
            return;
        }

        const code = referrerCode.trim();
        if (!code) {
            setError("Enter a referral code first.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const res = await authedFetch({
                url: `${props.backendBaseUrl}/v1/referral/redeem`,
                backendBaseUrl: props.backendBaseUrl,
                address: props.userAddress,
                signer: props.signer,
                chainId: props.chainId,
                signMessageAsync: props.signMessageAsync,
                init: {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code }),
                },
            });

            if (!res.ok) {
                const t = await res.text().catch(() => "");
                throw new Error(`Apply failed (${res.status}): ${t.slice(0, 160)}`);
            }

            setReferrerCode("");
            await loadSummary();
        } catch (e: any) {
            setError(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    }, [canAuth, loadSummary, props.backendBaseUrl, props.chainId, props.signer, props.userAddress, referrerCode]);

    const onRedeemRewards = useCallback(async () => {
        if (!canAuth || !props.userAddress) return;

        setLoading(true);
        setError("");
        setClaimTx("");

        try {
            const res = await authedFetch({
                url: `${props.backendBaseUrl}/v1/referrals/claim`,
                backendBaseUrl: props.backendBaseUrl,
                address: props.userAddress,
                signer: props.signer,
                chainId: props.chainId,
                signMessageAsync: props.signMessageAsync,
                init: {
                    method: "POST",
                    headers: { "Content-Type": "application/json" }
                }
            });

            const t = await res.text().catch(() => "");
            if (!res.ok) throw new Error(`Claim failed (${res.status}): ${t.slice(0, 160)}`);

            const j = JSON.parse(t);
            setClaimTx(j?.txHash || "");

            await loadSummary();
        } catch (e: any) {
            setError(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    }, [canAuth, loadSummary, props.backendBaseUrl, props.chainId, props.signer, props.userAddress]);

    return (
        <section className={styles.infoCard} style={{ textAlign: "left", padding: 16, background: "linear-gradient(135deg, rgba(251,191,36,0.08), rgba(245,158,11,0.04))", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 16 }}>
            <h2 style={{ fontSize: 20, margin: "0 0 12px", color: "#fbbf24", display: "flex", alignItems: "center", gap: 8 }}>
                <span>📜</span> Quests & Referrals
            </h2>

            {!props.connected && (
                <div style={{ background: "rgba(5,8,20,0.6)", borderRadius: 12, padding: 16, border: "1px solid rgba(107,114,128,0.3)" }}>
                    <p style={{ fontSize: 13, color: "#9ca3af", margin: 0, textAlign: "center" }}>
                        🔗 Connect a wallet to unlock referrals
                    </p>
                </div>
            )}

            {props.connected && !canAuth && (
                <div style={{ background: "rgba(5,8,20,0.6)", borderRadius: 12, padding: 16, border: "1px solid rgba(107,114,128,0.3)" }}>
                    <p style={{ fontSize: 13, color: "#9ca3af", margin: 0, textAlign: "center" }}>
                        ⏳ Wallet connected, signing not available yet...
                    </p>
                </div>
            )}

            {canAuth && (
                <div style={{ display: "grid", gap: 14 }}>
                    <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 12, padding: 14, border: "1px solid rgba(107,114,128,0.2)" }}>
                        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>
                            🌱 Stake More Plants To Increase Rewards
                        </div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>
                            💧 Rewards = 0.5 Ltr × Plants Staked × Referrals
                        </div>
                    </div>

                    <div style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(245,158,11,0.06))", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 12, padding: 14 }}>
                        <div style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>🎟️ Your Referral Code</div>

                        {loading && !summary && (
                            <div style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: 12 }}>Loading...</div>
                        )}

                        {summary && (
                            <>
                                {summary.canReferMore ? (
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                                            <div style={{ background: "rgba(5,8,20,0.6)", borderRadius: 8, padding: "10px 14px", border: "1px solid rgba(251,191,36,0.3)" }}>
                                                <span style={{ fontSize: 11, color: "#9ca3af" }}>Code: </span>
                                                <span style={{ fontSize: 15, fontWeight: 800, color: "#fbbf24", letterSpacing: 1 }}>{summary.myCode || "—"}</span>
                                            </div>
                                            <button type="button" className={styles.btnPrimary} onClick={() => onCopy(summary.myCode)} disabled={!summary.myCode} style={{ padding: "10px 16px", fontSize: 12, background: "linear-gradient(135deg, #fbbf24, #f59e0b)", color: "#000", fontWeight: 700, borderRadius: 8, border: "none", cursor: summary.myCode ? "pointer" : "not-allowed" }}>
                                                {copied ? "✓ Copied" : "📋 Copy"}
                                            </button>
                                        </div>
                                        {copied && <div style={{ fontSize: 10, color: "#10b981", marginTop: 4 }}>✓ copied to clipboard</div>}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: 12, color: "#ef4444", background: "rgba(239,68,68,0.1)", borderRadius: 8, padding: 10, border: "1px solid rgba(239,68,68,0.3)", marginBottom: 12 }}>
                                        ⚠️ Referral limit reached
                                    </div>
                                )}

                                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                                    <div style={{ background: "rgba(16,185,129,0.1)", borderRadius: 8, padding: "8px 12px", border: "1px solid rgba(16,185,129,0.3)" }}>
                                        <span style={{ fontSize: 10, color: "#6b7280" }}>Referrals</span>
                                        <div style={{ fontSize: 16, fontWeight: 800, color: "#10b981" }}>{summary.totalReferrals}</div>
                                    </div>

                                    {summary.pendingRedeem !== undefined && summary.pendingRedeem > 0 && (
                                        <div style={{ background: "rgba(251,191,36,0.1)", borderRadius: 8, padding: "8px 12px", border: "1px solid rgba(251,191,36,0.3)" }}>
                                            <span style={{ fontSize: 10, color: "#6b7280" }}>Rewards</span>
                                            {summary.plantsStaked && summary.plantsStaked > 0 ? (
                                                <div style={{ fontSize: 16, fontWeight: 800, color: "#fbbf24" }}>{summary.pendingRedeem * rewardPerReferral * summary.plantsStaked} Ltrs</div>
                                            ) : (
                                                <div style={{ fontSize: 11, fontWeight: 600, color: "#f59e0b" }}>Stake plants to claim</div>
                                            )}
                                        </div>
                                    )}

                                    <div style={{ background: "rgba(139,92,246,0.1)", borderRadius: 8, padding: "8px 12px", border: "1px solid rgba(139,92,246,0.3)" }}>
                                        <span style={{ fontSize: 10, color: "#6b7280" }}>Referred By</span>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "#a78bfa" }}>{summary.referredBy || "—"}</div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {summary && summary.referredBy == null && (
                        <div style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.1), rgba(34,197,94,0.05))", border: "1px solid rgba(16,185,129,0.35)", borderRadius: 12, padding: 14 }}>
                            <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>🎁 Enter a Referral Code</div>
                            <div style={{ display: "flex", gap: 10 }}>
                                <input
                                    value={referrerCode}
                                    onChange={(e) => setReferrerCode(e.target.value)}
                                    placeholder="e.g. X420-ABCD"
                                    style={{ flex: 1, padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(16,185,129,0.3)", background: "rgba(5,8,20,0.6)", color: "#e5e7eb", fontSize: 13, outline: "none" }}
                                />
                                <button
                                    type="button"
                                    className={styles.btnPrimary}
                                    onClick={onApplyReferrer}
                                    disabled={loading}
                                    style={{ padding: "12px 20px", fontSize: 13, background: loading ? "#374151" : "linear-gradient(135deg, #10b981, #22c55e)", color: "#fff", fontWeight: 700, borderRadius: 10, border: "none", cursor: loading ? "not-allowed" : "pointer" }}
                                >
                                    {loading ? "..." : "Apply"}
                                </button>
                            </div>
                        </div>
                    )}

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button type="button" className={styles.btnPrimary} onClick={loadSummary} disabled={loading} style={{ padding: "10px 16px", fontSize: 12, background: "linear-gradient(135deg, rgba(59,130,246,0.3), rgba(99,102,241,0.2))", border: "1px solid rgba(59,130,246,0.4)", borderRadius: 8, color: "#93c5fd", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
                            🔄 Refresh
                        </button>

                        {summary && summary.pendingRedeem !== undefined && summary.pendingRedeem > 0 && (
                            summary.plantsStaked && summary.plantsStaked > 0 ? (
                                <button
                                    type="button"
                                    className={styles.btnPrimary}
                                    onClick={onRedeemRewards}
                                    disabled={loading}
                                    style={{ padding: "10px 16px", fontSize: 12, background: "linear-gradient(135deg, #fbbf24, #f59e0b)", color: "#000", fontWeight: 700, borderRadius: 8, border: "none", cursor: loading ? "not-allowed" : "pointer" }}
                                >
                                    {loading ? "..." : "💰 Claim Rewards"}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className={styles.btnPrimary}
                                    disabled={true}
                                    style={{ padding: "10px 16px", fontSize: 12, background: "#374151", color: "#6b7280", fontWeight: 600, borderRadius: 8, border: "1px solid #4b5563", cursor: "not-allowed" }}
                                >
                                    🌱 Stake Plants To Claim
                                </button>
                            )
                        )}
                    </div>

                    {claimTx && (
                        <div style={{ background: "rgba(16,185,129,0.1)", borderRadius: 10, padding: 12, border: "1px solid rgba(16,185,129,0.3)" }}>
                            <span style={{ fontSize: 11, color: "#10b981" }}>✅ Tx Sent: </span>
                            <span style={{ fontSize: 11, color: "#a78bfa", wordBreak: "break-all" }}>{claimTx}</span>
                        </div>
                    )}

                    {error && (
                        <div style={{ fontSize: 12, color: "#fbbf24", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 10, padding: 12 }}>
                            ⚠️ {error}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
