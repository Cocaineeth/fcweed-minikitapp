"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { V5_BATTLES_ADDRESS, WARS_BACKEND_URL, V5_STAKING_ADDRESS } from "../lib/constants";

const BATTLES_ABI = [
    "function purge(address target) external",
    "function purgeFee() view returns (uint256)",
    "function canPurge(address) view returns (bool)",
    "function isPurgeActive() view returns (bool)",
    "function getAtkStats(address) view returns (uint256 wins, uint256 losses, uint256 stolen, uint256 nukes)",
    "function getDefStats(address) view returns (uint256 wins, uint256 losses, uint256 lost, bool hasShield)",
    "function getGlobal() view returns (uint256 cartel, uint256 dea, uint256 purge, uint256 flagged, uint256 redist, uint256 fees, uint256 burned)",
    "function getPower(address) view returns (uint256 base, uint256 atk, uint256 def)",
    "function lastPurge(address) view returns (uint256)",
    "event PurgeResult(address indexed a, address indexed t, bool w, uint256 ap, uint256 dp, uint256 s, uint256 dmg)"
];

const STAKING_ABI = [
    "function getUserBattleStats(address) view returns (uint256 plants, uint256 lands, uint256 superLands, uint256 avgHealth, uint256 pendingRewards)",
    "function calculateBattlePower(address) view returns (uint256)",
    "function pending(address) view returns (uint256)",
    "function getTotalStakers() view returns (uint256)",
    "function getStakerAtIndex(uint256) view returns (address)"
];

type Props = {
    connected: boolean;
    userAddress: string | null;
    theme: "light" | "dark";
    readProvider: ethers.providers.Provider | null;
    sendContractTx: (to: string, data: string, gasLimit?: string) => Promise<ethers.providers.TransactionResponse | null>;
    ensureAllowance: (spender: string, amount: ethers.BigNumber) => Promise<boolean>;
    refreshData: () => void;
};

export function ThePurge({ connected, userAddress, theme, readProvider, sendContractTx, ensureAllowance, refreshData }: Props) {
    const [isPurgeActive, setIsPurgeActive] = useState(false);
    const [totalPurged, setTotalPurged] = useState(0);
    const [totalBurned, setTotalBurned] = useState("0");
    const [totalLooted, setTotalLooted] = useState("0");
    const [purgeFee, setPurgeFee] = useState("500K");
    const [purgeFeeRaw, setPurgeFeeRaw] = useState<ethers.BigNumber>(ethers.utils.parseUnits("500000", 18));
    const [canPurge, setCanPurge] = useState(false);
    const [loading, setLoading] = useState(true);
    const [attacking, setAttacking] = useState(false);
    const [status, setStatus] = useState("");
    const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
    const [lastRefresh, setLastRefresh] = useState(Date.now());

    const fetchingRef = useRef(false);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(Math.floor(Date.now() / 1000)), 1000);
        return () => clearInterval(timer);
    }, []);

    const formatLargeNumber = (num: ethers.BigNumber | number): string => {
        const n = typeof num === "number" ? num : parseFloat(ethers.utils.formatUnits(num, 18));
        if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
        if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
        if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
        return n.toFixed(0);
    };

    const fetchPurgeData = useCallback(async () => {
        if (fetchingRef.current || !readProvider) return;
        fetchingRef.current = true;

        try {
            const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, BATTLES_ABI, readProvider);

            const [isActive, fee, globalStats] = await Promise.all([
                battlesContract.isPurgeActive(),
                battlesContract.purgeFee(),
                battlesContract.getGlobal()
            ]);

            setIsPurgeActive(isActive);
            setPurgeFeeRaw(fee);
            setPurgeFee(formatLargeNumber(fee));
            setTotalPurged(globalStats[2].toNumber()); // purge is index 2
            setTotalLooted(formatLargeNumber(globalStats[4])); // redist is index 4
            setTotalBurned(formatLargeNumber(globalStats[6])); // burned is index 6

            if (userAddress) {
                try {
                    const canAttack = await battlesContract.canPurge(userAddress);
                    setCanPurge(canAttack);
                } catch (e) {
                    console.error("[Purge] canPurge error:", e);
                }
            }

            setLastRefresh(Date.now());
        } catch (e) {
            console.error("[Purge] Fetch error:", e);
        }

        setLoading(false);
        fetchingRef.current = false;
    }, [readProvider, userAddress]);

    useEffect(() => {
        if (!readProvider) return;
        fetchPurgeData();
        const refreshInterval = setInterval(fetchPurgeData, 30000);
        return () => clearInterval(refreshInterval);
    }, [readProvider, userAddress, fetchPurgeData]);

    const cardBg = theme === "light" ? "rgba(241,245,249,0.8)" : "rgba(15,23,42,0.6)";
    const borderColor = theme === "light" ? "rgba(148,163,184,0.3)" : "rgba(51,65,85,0.5)";
    const textPrimary = theme === "light" ? "#1e293b" : "#ffffff";
    const textMuted = theme === "light" ? "#64748b" : "#94a3b8";

    return (
        <div style={{ padding: 16 }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: "#dc2626", margin: 0 }}>🔪 THE PURGE</h2>
                    {isPurgeActive ? (
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "rgba(220,38,38,0.2)", color: "#dc2626", fontWeight: 600 }}>ACTIVE</span>
                    ) : (
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "rgba(100,116,139,0.2)", color: textMuted, fontWeight: 600 }}>INACTIVE</span>
                    )}
                </div>
            </div>

            {/* Stats subtitle */}
            <div style={{ fontSize: 10, color: textMuted, marginBottom: 16 }}>
                {totalPurged} purged • {totalBurned} burned • {totalLooted} looted
            </div>

            {/* Purge Info Box */}
            <div style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#fca5a5", textAlign: "center", lineHeight: 1.6 }}>
                    <strong style={{ color: "#dc2626" }}>⚠️ CHAOS MODE</strong><br/>
                    During The Purge, <strong>ALL shields are bypassed</strong>.<br/>
                    Attack anyone regardless of protection!<br/>
                    <span style={{ fontSize: 10, color: textMuted }}>Fee: {purgeFee} $FCWEED (50% burned)</span>
                </div>
            </div>

            {/* Status */}
            {!isPurgeActive && (
                <div style={{ textAlign: "center", padding: 20, color: textMuted }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
                    <div style={{ fontSize: 12 }}>The Purge is not currently active.</div>
                    <div style={{ fontSize: 10, marginTop: 4 }}>Check back during chaos events!</div>
                </div>
            )}

            {status && (
                <div style={{ fontSize: 10, color: "#fbbf24", textAlign: "center", marginTop: 8 }}>{status}</div>
            )}
        </div>
    );
}
