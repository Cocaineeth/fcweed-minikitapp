"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { V6_STAKING_ADDRESS } from "../lib/constants";
import { V6_STAKING_ABI } from "../lib/abis";

interface XFcweedConverterProps {
    isOpen: boolean;
    onClose: () => void;
    address: string | undefined;
    signer: ethers.Signer | null;
    provider: ethers.providers.Provider;
    xFcweedBalance: ethers.BigNumber;
    conversionRate: number; // 3 = 3:1 ratio
    onSuccess?: () => void;
}

export function XFcweedConverter({
    isOpen,
    onClose,
    address,
    signer,
    provider,
    xFcweedBalance,
    conversionRate = 3,
    onSuccess,
}: XFcweedConverterProps) {
    const [convertAmount, setConvertAmount] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");
    const [lastConvertTime, setLastConvertTime] = useState(0);
    const [conversionCooldown, setConversionCooldown] = useState(86400); // 24h default
    const [cooldownRemaining, setCooldownRemaining] = useState(0);

    // Format balance for display
    const formatBalance = (bn: ethers.BigNumber) => {
        const num = parseFloat(ethers.utils.formatEther(bn));
        if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
        if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
        return num.toFixed(2);
    };

    // Calculate output FCWEED
    const calculateOutput = () => {
        if (!convertAmount || isNaN(parseFloat(convertAmount))) return "0";
        const input = parseFloat(convertAmount);
        const output = input / conversionRate;
        if (output >= 1_000_000) return `${(output / 1_000_000).toFixed(2)}M`;
        if (output >= 1_000) return `${(output / 1_000).toFixed(2)}K`;
        return output.toFixed(2);
    };

    // Load cooldown state
    const loadCooldownState = useCallback(async () => {
        if (!provider || !address) return;
        
        try {
            const v6Contract = new ethers.Contract(V6_STAKING_ADDRESS, V6_STAKING_ABI, provider);
            const [lastConvert, cooldown] = await Promise.all([
                v6Contract.lastConvertTime(address).catch(() => ethers.BigNumber.from(0)),
                v6Contract.conversionCooldown().catch(() => ethers.BigNumber.from(86400)),
            ]);
            
            setLastConvertTime(lastConvert.toNumber());
            setConversionCooldown(cooldown.toNumber());
            
            const now = Math.floor(Date.now() / 1000);
            const nextAllowed = lastConvert.toNumber() + cooldown.toNumber();
            setCooldownRemaining(Math.max(0, nextAllowed - now));
        } catch (err) {
            console.error("[Converter] Load cooldown failed:", err);
        }
    }, [provider, address]);

    useEffect(() => {
        if (isOpen) {
            loadCooldownState();
        }
    }, [isOpen, loadCooldownState]);

    // Countdown timer
    useEffect(() => {
        if (cooldownRemaining <= 0) return;
        const interval = setInterval(() => {
            setCooldownRemaining(prev => Math.max(0, prev - 1));
        }, 1000);
        return () => clearInterval(interval);
    }, [cooldownRemaining > 0]);

    // Format time
    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h}h ${m}m ${s}s`;
    };

    // Quick select percentages
    const handleQuickSelect = (percentage: number) => {
        const amount = xFcweedBalance.mul(percentage).div(100);
        setConvertAmount(ethers.utils.formatEther(amount));
    };

    // Handle conversion
    const handleConvert = async () => {
        if (!signer || !address || !convertAmount) return;
        
        const amountWei = ethers.utils.parseEther(convertAmount);
        if (amountWei.gt(xFcweedBalance)) {
            setStatus("Insufficient xFCWEED balance");
            return;
        }
        
        if (amountWei.isZero()) {
            setStatus("Enter an amount to convert");
            return;
        }
        
        setLoading(true);
        setStatus("Converting xFCWEED to FCWEED...");
        
        try {
            const v6Contract = new ethers.Contract(V6_STAKING_ADDRESS, V6_STAKING_ABI, signer);
            const tx = await v6Contract.convertToFcweed(amountWei);
            
            setStatus("Waiting for confirmation...");
            await tx.wait();
            
            const outputFcweed = amountWei.div(conversionRate);
            const formatted = parseFloat(ethers.utils.formatEther(outputFcweed));
            const displayAmount = formatted >= 1_000_000 
                ? `${(formatted / 1_000_000).toFixed(2)}M` 
                : formatted >= 1_000 
                    ? `${(formatted / 1_000).toFixed(2)}K` 
                    : formatted.toFixed(2);
            
            setStatus(`✅ Converted to ${displayAmount} FCWEED!`);
            setConvertAmount("");
            onSuccess?.();
            
            setTimeout(() => {
                onClose();
                setStatus("");
            }, 2000);
        } catch (err: any) {
            console.error("[Converter] Failed:", err);
            setStatus(err?.reason || err?.message || "Conversion failed");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const canConvert = cooldownRemaining === 0;
    const hasBalance = !xFcweedBalance.isZero();

    return (
        <div 
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0, 0, 0, 0.85)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: 16,
            }}
            onClick={() => !loading && onClose()}
        >
            <div 
                style={{
                    width: "100%",
                    maxWidth: 420,
                    background: "linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)",
                    borderRadius: 16,
                    border: "2px solid #8b5cf6",
                    padding: 24,
                    boxShadow: "0 0 40px rgba(139, 92, 246, 0.3)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ fontSize: 36 }}>💎</div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 20, color: "#a78bfa" }}>xFCWEED Converter</h2>
                            <div style={{ fontSize: 12, color: "#9ca3af" }}>Convert to FCWEED at {conversionRate}:1 ratio</div>
                        </div>
                    </div>
                    <button
                        onClick={() => !loading && onClose()}
                        disabled={loading}
                        style={{
                            background: "none",
                            border: "none",
                            color: "#9ca3af",
                            fontSize: 28,
                            cursor: loading ? "not-allowed" : "pointer",
                            lineHeight: 1,
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Balance Display */}
                <div style={{
                    background: "linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(168, 85, 247, 0.1))",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 20,
                    border: "1px solid rgba(139, 92, 246, 0.3)",
                }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                            <div style={{ fontSize: 11, color: "#a78bfa", marginBottom: 4 }}>YOUR xFCWEED BALANCE</div>
                            <div style={{ fontSize: 28, fontWeight: 700, color: "#e9d5ff" }}>
                                {formatBalance(xFcweedBalance)} 💎
                            </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 11, color: "#86efac", marginBottom: 4 }}>CONVERTS TO</div>
                            <div style={{ fontSize: 20, fontWeight: 600, color: "#4ade80" }}>
                                {formatBalance(xFcweedBalance.div(conversionRate))} 🌿
                            </div>
                        </div>
                    </div>
                </div>

                {/* Cooldown Warning */}
                {!canConvert && (
                    <div style={{
                        background: "rgba(251, 191, 36, 0.1)",
                        border: "1px solid rgba(251, 191, 36, 0.3)",
                        borderRadius: 8,
                        padding: 12,
                        marginBottom: 16,
                        textAlign: "center",
                    }}>
                        <div style={{ color: "#fbbf24", fontWeight: 600, marginBottom: 4 }}>⏱️ COOLDOWN ACTIVE</div>
                        <div style={{ color: "#fcd34d", fontSize: 20, fontFamily: "monospace" }}>
                            {formatTime(cooldownRemaining)}
                        </div>
                        <div style={{ color: "#9ca3af", fontSize: 10, marginTop: 4 }}>
                            You can convert once every {conversionCooldown / 3600} hours
                        </div>
                    </div>
                )}

                {/* Input Section */}
                {canConvert && hasBalance && (
                    <>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: "block", fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>
                                Amount to Convert
                            </label>
                            <div style={{ position: "relative" }}>
                                <input
                                    type="text"
                                    value={convertAmount}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/[^0-9.]/g, '');
                                        setConvertAmount(val);
                                    }}
                                    placeholder="0.00"
                                    disabled={loading}
                                    style={{
                                        width: "100%",
                                        padding: "14px 80px 14px 14px",
                                        fontSize: 18,
                                        fontWeight: 600,
                                        background: "#1f2937",
                                        border: "1px solid #374151",
                                        borderRadius: 10,
                                        color: "#fff",
                                        outline: "none",
                                    }}
                                />
                                <span style={{
                                    position: "absolute",
                                    right: 14,
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    color: "#a78bfa",
                                    fontWeight: 600,
                                }}>
                                    xFCWEED
                                </span>
                            </div>
                        </div>

                        {/* Quick Select Buttons */}
                        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                            {[25, 50, 75, 100].map((pct) => (
                                <button
                                    key={pct}
                                    onClick={() => handleQuickSelect(pct)}
                                    disabled={loading}
                                    style={{
                                        flex: 1,
                                        padding: "8px 0",
                                        background: "rgba(139, 92, 246, 0.2)",
                                        border: "1px solid rgba(139, 92, 246, 0.4)",
                                        borderRadius: 8,
                                        color: "#c4b5fd",
                                        fontSize: 12,
                                        fontWeight: 600,
                                        cursor: loading ? "not-allowed" : "pointer",
                                    }}
                                >
                                    {pct}%
                                </button>
                            ))}
                        </div>

                        {/* Output Preview */}
                        {convertAmount && (
                            <div style={{
                                background: "rgba(74, 222, 128, 0.1)",
                                border: "1px solid rgba(74, 222, 128, 0.3)",
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 16,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                            }}>
                                <div>
                                    <div style={{ fontSize: 11, color: "#86efac" }}>YOU WILL RECEIVE</div>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: "#4ade80" }}>
                                        {calculateOutput()} FCWEED 🌿
                                    </div>
                                </div>
                                <div style={{ 
                                    background: "#166534", 
                                    padding: "4px 10px", 
                                    borderRadius: 6,
                                    fontSize: 11,
                                    color: "#bbf7d0",
                                }}>
                                    {conversionRate}:1
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* No Balance Warning */}
                {!hasBalance && (
                    <div style={{
                        background: "rgba(107, 114, 128, 0.2)",
                        border: "1px solid rgba(107, 114, 128, 0.3)",
                        borderRadius: 8,
                        padding: 16,
                        marginBottom: 16,
                        textAlign: "center",
                    }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>💎</div>
                        <div style={{ color: "#9ca3af", fontWeight: 600 }}>No xFCWEED to Convert</div>
                        <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
                            Stake NFTs in V6 and harvest to earn xFCWEED
                        </div>
                    </div>
                )}

                {/* Status */}
                {status && (
                    <div style={{
                        background: status.includes("✅") ? "rgba(74, 222, 128, 0.1)" : "rgba(251, 191, 36, 0.1)",
                        border: status.includes("✅") ? "1px solid rgba(74, 222, 128, 0.3)" : "1px solid rgba(251, 191, 36, 0.3)",
                        borderRadius: 8,
                        padding: 12,
                        marginBottom: 16,
                        textAlign: "center",
                        color: status.includes("✅") ? "#4ade80" : "#fbbf24",
                    }}>
                        {status}
                    </div>
                )}

                {/* Convert Button */}
                <button
                    onClick={handleConvert}
                    disabled={loading || !canConvert || !hasBalance || !convertAmount}
                    style={{
                        width: "100%",
                        padding: 16,
                        fontSize: 16,
                        fontWeight: 700,
                        background: loading || !canConvert || !hasBalance || !convertAmount
                            ? "#374151"
                            : "linear-gradient(135deg, #7c3aed, #8b5cf6, #a78bfa)",
                        border: "none",
                        borderRadius: 12,
                        color: loading || !canConvert || !hasBalance || !convertAmount ? "#6b7280" : "#fff",
                        cursor: loading || !canConvert || !hasBalance || !convertAmount ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                    }}
                >
                    {loading ? (
                        <>
                            <div style={{
                                width: 20,
                                height: 20,
                                border: "2px solid #9ca3af",
                                borderTop: "2px solid transparent",
                                borderRadius: "50%",
                                animation: "spin 1s linear infinite",
                            }} />
                            Converting...
                        </>
                    ) : (
                        <>💎 → 🌿 Convert to FCWEED</>
                    )}
                </button>

                {/* Info */}
                <div style={{
                    marginTop: 16,
                    padding: 12,
                    background: "rgba(99, 102, 241, 0.1)",
                    borderRadius: 8,
                    border: "1px solid rgba(99, 102, 241, 0.2)",
                }}>
                    <div style={{ fontSize: 11, color: "#a5b4fc" }}>
                        💡 <strong>Tip:</strong> xFCWEED is earned by staking in V6. Convert it to FCWEED 
                        to trade. Conversion has a {conversionCooldown / 3600}h cooldown.
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

export default XFcweedConverter;
