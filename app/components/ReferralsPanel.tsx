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
};

type ReferralSummary = {
    address: string;
    myCode: string;
    referralUrl: string;
    referredBy?: string | null;
    totalReferrals: number;
    totalRewards?: string | null;
};

export function ReferralsPanel(props: Props)
{
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>("");
    const [summary, setSummary] = useState<ReferralSummary | null>(null);
    const [referrerCode, setReferrerCode] = useState<string>("");
    const [claimTx, setClaimTx] = useState<string>("");

    const canAuth = props.connected && !!props.userAddress && !!props.signer;
    const rewardPerReferral = 0.5;

    const referralBaseUrl = useMemo(() =>
        {
            if (typeof window === "undefined")
            {
                return "";
            }
            return window.location.origin;
        }, []);

    const loadSummary = useCallback(async () => {
        if (!canAuth || !props.userAddress || !props.signer) return;
        setLoading(true);
        setError("");

        try
        {
            // 1) get/create code
            const codeRes = await authedFetch({
                url: `${props.backendBaseUrl}/v1/referrals/code`,
                backendBaseUrl: props.backendBaseUrl,
                address: props.userAddress,
                signer: props.signer,
                chainId: props.chainId,
                init: { method: "POST" }
            });

            const codeText = await codeRes.text().catch(() => "");
            if (!codeRes.ok) throw new Error(`Code failed (${codeRes.status}): ${codeText.slice(0, 140)}`);
            const codeJson = JSON.parse(codeText);
            const myCode = (codeJson?.code || "").toString();

            // 2) stats
            const statsRes = await authedFetch({
                url: `${props.backendBaseUrl}/v1/referrals/stats`,
                backendBaseUrl: props.backendBaseUrl,
                address: props.userAddress,
                signer: props.signer,
                chainId: props.chainId
            });

            const j = await statsRes.json();
            const st = j?.stats;

            console.log(j)

            setSummary({
                address: props.userAddress,
                myCode: myCode,
                referredBy: st?.referredBy ?? null,
                totalReferrals: Number(st?.numberReferred ?? 0),
                totalRewards: null, // only when you implement rewards
                pendingRedeem: st?.pendingRedeem,
                canReferMore: st?.canReferMore
            });
        }
        catch (e: any)
        {
            setError(e?.message || String(e));
            setSummary(null);
        }
        finally
        {
            setLoading(false);
        }
    }, [canAuth, props.backendBaseUrl, props.chainId, props.signer, props.userAddress, referralBaseUrl]);

    // Lazy auth: only fetch when the tab is opened (component mounted)
    useEffect(() => {
        if (!canAuth)
        {
            setSummary(null);
            return;
        }

        loadSummary();
    }, [canAuth, loadSummary]);

    const onCopy = async (text: string) =>
    {
        try
        {
            await navigator.clipboard.writeText(text);
            alert("✅ Copied");
        }
        catch
        {
            prompt("Copy:", text);
        }
    };

    const onApplyReferrer = useCallback(async () =>
    {
        if (!canAuth || !props.userAddress || !props.signer)
        {
            return;
        }

        const code = referrerCode.trim();
        if (!code)
        {
            setError("Enter a referral code first.");
            return;
        }

        setLoading(true);
        setError("");

        try
        {
            const res = await authedFetch({
                url: `${props.backendBaseUrl}/v1/referrals/claim`,
                backendBaseUrl: props.backendBaseUrl,
                address: props.userAddress,
                signer: props.signer,
                chainId: props.chainId,
                init: {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code }),
                },
            });

            if (!res.ok)
            {
                const t = await res.text().catch(() => "");
                throw new Error(`Apply failed (${res.status}): ${t.slice(0, 160)}`);
            }

            setReferrerCode("");
            await loadSummary();
        }
        catch (e: any)
        {
            setError(e?.message || String(e));
        }
        finally
        {
            setLoading(false);
        }
    }, [canAuth, loadSummary, props.backendBaseUrl, props.chainId, props.signer, props.userAddress, referrerCode]);

    const onRedeemRewards = useCallback(async () => {
        if (!canAuth || !props.userAddress || !props.signer) return;

        setLoading(true);
        setError("");
        setClaimTx("");

        try
        {
            const res = await authedFetch({
                url: `${props.backendBaseUrl}/v1/referral/redeem`,
                backendBaseUrl: props.backendBaseUrl,
                address: props.userAddress,
                signer: props.signer,
                chainId: props.chainId,
                init: {
                    method: "POST",
                    headers: { "Content-Type": "application/json" }
                }
            });

            const t = await res.text().catch(() => "");
            if (!res.ok) throw new Error(`Claim failed (${res.status}): ${t.slice(0, 160)}`);

            const j = JSON.parse(t);
            setClaimTx(j?.txHash || "");

            await loadSummary(); // refresh UI, claimable should be 0 now
            
        }
        catch(e: any)
        {
            setError(e?.message || String(e));
        }
        finally
        {
            setLoading(false);
        }
    }, [canAuth, loadSummary, props.backendBaseUrl, props.chainId, props.signer, props.userAddress])


    return (
        <section className={styles.infoCard} style={{ textAlign: "left", padding: 16 }}>
            <h2 style={{ fontSize: 18, margin: "0 0 10px", color: "#fbbf24" }}>📜 Quests & Referrals</h2>

            {!props.connected && (
                <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
                    Connect a wallet to unlock referrals.
                </p>
            )}

            {props.connected && !canAuth && (
                <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
                    Wallet connected, but signing is not available yet.
                </p>
            )}

            {canAuth && (
                <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 12, padding: 12 }}>
                        <div style={{ fontSize: 10, color: "#fbbf24", fontWeight: 700, marginBottom: 6 }}>YOUR REFERRAL</div>

                        {loading && !summary && (
                            <div style={{ fontSize: 12, color: "#9ca3af" }}>Loading…</div>
                        )}

                        {summary && (
                            <>
                                { summary.canReferMore ? (<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: "#e5e7eb" }}>
                                        Code: <span style={{ color: "#fbbf24" }}>{summary.myCode || "—"}</span>
                                    </div>
                                    <button type="button" className={styles.btnPrimary} onClick={() => onCopy(summary.myCode)} disabled={!summary.myCode} style={{ padding: "8px 10px", fontSize: 11, background: "rgba(251,191,36,0.15)" }}>
                                        Copy Code
                                    </button>
                                </div>) : (
                                    <div style={{ fontSize: 11, color: "#9ca3af" }}>
                                        Referral limit reached
                                    </div>
                                ) }

                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                                    Referrals: <span style={{ color: "#10b981", fontWeight: 800 }}>{summary.totalReferrals}</span>
                                </div>

                                {summary && (
                                    <div style={{ fontSize: 11, color: "#9ca3af" }}>
                                        Rewards: <span style={{ color: "#fbbf24", fontWeight: 800 }}>{summary.pendingRedeem * rewardPerReferral}</span>Ltrs
                                    </div>
                                )}
                                
                                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                                    Referred by: <span style={{ color: "#c0c9f4" }}>{summary.referredBy || "—"}</span>
                                </div>
                            </div>
                            </>
                        )}
                </div>

                {summary && (summary.referredBy == null ? (<div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 12, padding: 12 }}>
                    <div style={{ fontSize: 10, color: "#10b981", fontWeight: 700, marginBottom: 8 }}>ENTER A REFERRAL CODE</div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <input
                            value={referrerCode}
                            onChange={(e) => setReferrerCode(e.target.value)}
                            placeholder="e.g. X420-ABCD"
                            style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.25)", background: "rgba(5,8,20,0.5)", color: "#e5e7eb", fontSize: 12, outline: "none" }}
                        />
                        <button
                            type="button"
                            className={styles.btnPrimary}
                            onClick={onApplyReferrer}
                            disabled={loading}
                            style={{ padding: "10px 14px", fontSize: 12, background: loading ? "#374151" : "linear-gradient(135deg, #10b981, #22c55e)" }}
                        >
                            {loading ? "…" : "Apply"}
                        </button>
                    </div>
                </div>) : (<div> </div>))}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button type="button" className={styles.btnPrimary} onClick={loadSummary} disabled={loading} style={{ padding: "10px 14px", fontSize: 12, background: "rgba(59,130,246,0.18)" }}>
                        Refresh
                    </button>
                </div>

                {(summary && (summary.pendingRedeem > 0 ) && (<button
                                                                   type="button"
                                                                   className={styles.btnPrimary}
                                                                   onClick={onRedeemRewards}
                                                                   disabled={loading}
                                                                   style={{ padding: "10px 14px", fontSize: 12, background: "rgba(251,191,36,0.18)" }}
                                                               >
                    {loading ? "…" : "Claim Rewards"}
                </button>))}

                {claimTx && (
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>
                        Sent: <span style={{ color: "#c0c9f4" }}>{claimTx}</span>
                    </div>
                )}

                {error && (
                    <div style={{ fontSize: 11, color: "#fbbf24", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: 10 }}>
                        {error}
                    </div>
                )}
                </div>
            )}
        </section>
    );
}
