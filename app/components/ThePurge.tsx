"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { V5_BATTLES_ADDRESS, V5_STAKING_ADDRESS, MULTICALL3_ADDRESS } from "../lib/constants";

const MULTICALL3_ABI = ["function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])"];

const BATTLES_ABI = [
    "function isPurgeActive() view returns (bool)",
    "function getPurgeInfo() view returns (bool isActive, uint256 startTime, uint256 endTime, uint256 timeUntilStart, uint256 timeUntilEnd)",
    "function purgeFee() view returns (uint256)",
    "function getPurgeAttackerStats(address) view returns (uint256 wins, uint256 losses, uint256 rewardsStolen, uint256 cooldownRemaining, bool canAttack)",
    "function getGlobalStats() view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
    "function purgeAttack(address target) external",
    "event PurgeAttackResult(address indexed attacker, address indexed target, bool attackerWon, uint256 stolenAmount, uint256 damagePct)"
];

const STAKING_ABI = [
    "function getTotalStakers() view returns (uint256)",
    "function getStakerAtIndex(uint256 index) view returns (address)",
    "function getUserBattleStats(address) view returns (uint256 plants, uint256 lands, uint256 superLands, uint256 avgHealth, uint256 pendingRewards)",
    "function calculateBattlePower(address) view returns (uint256)"
];

const battlesInterface = new ethers.utils.Interface(BATTLES_ABI);
const stakingInterface = new ethers.utils.Interface(STAKING_ABI);

interface PurgeTarget { address: string; plants: number; rank: number; }
interface PurgeInfo { isActive: boolean; startTime: number; endTime: number; timeUntilStart: number; timeUntilEnd: number; }
interface AttackerStats { wins: number; losses: number; rewardsStolen: string; cooldownRemaining: number; canAttack: boolean; battlePower: number; }
interface GlobalStats { totalPurgeAttacks: number; totalRewardsRedistributed: string; totalPurgeFeesBurned: string; }

type Props = {
    connected: boolean;
    userAddress: string | null;
    theme: "light" | "dark";
    readProvider: ethers.providers.Provider | null;
    sendContractTx: (to: string, data: string, gasLimit?: string) => Promise<ethers.providers.TransactionResponse | null>;
    ensureAllowance: (spender: string, amount: ethers.BigNumber) => Promise<boolean>;
    refreshData: () => void;
};

const ITEMS_PER_PAGE = 10;

export function ThePurge({ connected, userAddress, theme, readProvider, sendContractTx, ensureAllowance, refreshData }: Props) {
    const [loading, setLoading] = useState(true);
    const [purgeInfo, setPurgeInfo] = useState<PurgeInfo | null>(null);
    const [attackerStats, setAttackerStats] = useState<AttackerStats | null>(null);
    const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
    const [purgeFee, setPurgeFee] = useState("250K");
    const [purgeFeeRaw, setPurgeFeeRaw] = useState<ethers.BigNumber>(ethers.utils.parseUnits("250000", 18));
    
    const [targets, setTargets] = useState<PurgeTarget[]>([]);
    const [allTargets, setAllTargets] = useState<PurgeTarget[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loadingTargets, setLoadingTargets] = useState(false);
    
    const [showAttackModal, setShowAttackModal] = useState(false);
    const [showResultModal, setShowResultModal] = useState(false);
    const [selectedTarget, setSelectedTarget] = useState<PurgeTarget | null>(null);
    
    const [attacking, setAttacking] = useState(false);
    const [attackResult, setAttackResult] = useState<{ won: boolean; stolen: string; damage: number } | null>(null);
    const [status, setStatus] = useState("");
    const [countdown, setCountdown] = useState(0);
    const [cooldownCountdown, setCooldownCountdown] = useState(0);
    
    const fetchingRef = useRef(false);

    const formatLargeNumber = (bn: ethers.BigNumber | string | number): string => {
        let val: number;
        if (typeof bn === 'number') val = bn;
        else if (typeof bn === 'string') val = parseFloat(bn);
        else val = parseFloat(ethers.utils.formatUnits(bn, 18));
        if (val >= 1e9) return (val / 1e9).toFixed(2) + "B";
        if (val >= 1e6) return (val / 1e6).toFixed(2) + "M";
        if (val >= 1e3) return (val / 1e3).toFixed(1) + "K";
        return val.toFixed(0);
    };

    const formatCountdownTime = (seconds: number): string => {
        if (seconds <= 0) return "NOW";
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (d > 0) return `${d}d ${h}h ${m}m`;
        if (h > 0) return `${h}h ${m}m ${s}s`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    };

    const fetchPurgeInfo = useCallback(async () => {
        if (!readProvider || fetchingRef.current) return;
        fetchingRef.current = true;
        
        try {
            const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
            const calls: any[] = [
                { target: V5_BATTLES_ADDRESS, allowFailure: true, callData: battlesInterface.encodeFunctionData("getPurgeInfo", []) },
                { target: V5_BATTLES_ADDRESS, allowFailure: true, callData: battlesInterface.encodeFunctionData("purgeFee", []) },
                { target: V5_BATTLES_ADDRESS, allowFailure: true, callData: battlesInterface.encodeFunctionData("getGlobalStats", []) },
            ];
            if (userAddress) {
                calls.push({ target: V5_BATTLES_ADDRESS, allowFailure: true, callData: battlesInterface.encodeFunctionData("getPurgeAttackerStats", [userAddress]) });
                calls.push({ target: V5_STAKING_ADDRESS, allowFailure: true, callData: stakingInterface.encodeFunctionData("calculateBattlePower", [userAddress]) });
            }
            
            const results = await mc.aggregate3(calls);
            
            if (results[0].success) {
                const info = battlesInterface.decodeFunctionResult("getPurgeInfo", results[0].returnData);
                setPurgeInfo({ 
                    isActive: info.isActive, 
                    startTime: info.startTime.toNumber(), 
                    endTime: info.endTime.toNumber(),
                    timeUntilStart: info.timeUntilStart.toNumber(),
                    timeUntilEnd: info.timeUntilEnd.toNumber()
                });
            }
            if (results[1].success) {
                const fee = battlesInterface.decodeFunctionResult("purgeFee", results[1].returnData)[0];
                setPurgeFeeRaw(fee);
                const feeNum = parseFloat(ethers.utils.formatUnits(fee, 18));
                setPurgeFee(feeNum >= 1e6 ? (feeNum / 1e6).toFixed(0) + "M" : (feeNum / 1e3).toFixed(0) + "K");
            }
            if (results[2].success) {
                const stats = battlesInterface.decodeFunctionResult("getGlobalStats", results[2].returnData);
                // Note: stats[4] (totalRewardsRedistributed) is shared across ALL battle types
                // Only stats[2] (totalPurgeAttacks) and stats[6] (totalPurgeFeesBurned) are Purge-specific
                setGlobalStats({ 
                    totalPurgeAttacks: stats[2].toNumber(), 
                    totalRewardsRedistributed: "—", // No Purge-specific counter exists in contract
                    totalPurgeFeesBurned: formatLargeNumber(stats[6]) 
                });
            }
            if (userAddress && results[3]?.success) {
                const aStats = battlesInterface.decodeFunctionResult("getPurgeAttackerStats", results[3].returnData);
                let battlePower = 0;
                if (results[4]?.success) battlePower = stakingInterface.decodeFunctionResult("calculateBattlePower", results[4].returnData)[0].toNumber();
                setAttackerStats({ wins: aStats.wins.toNumber(), losses: aStats.losses.toNumber(), rewardsStolen: formatLargeNumber(aStats.rewardsStolen), cooldownRemaining: aStats.cooldownRemaining.toNumber(), canAttack: aStats.canAttack, battlePower });
            }
            setLoading(false);
        } catch (err) { console.error("[Purge] Failed to load info:", err); setLoading(false); }
        fetchingRef.current = false;
    }, [readProvider, userAddress]);

    const fetchTargets = useCallback(async () => {
        if (!readProvider || !purgeInfo?.isActive) return;
        setLoadingTargets(true);
        
        try {
            const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
            const totalCall = await mc.aggregate3([{ target: V5_STAKING_ADDRESS, allowFailure: true, callData: stakingInterface.encodeFunctionData("getTotalStakers", []) }]);
            if (!totalCall[0].success) { setLoadingTargets(false); return; }
            
            const total = stakingInterface.decodeFunctionResult("getTotalStakers", totalCall[0].returnData)[0].toNumber();
            if (total === 0) { setTargets([]); setAllTargets([]); setTotalPages(1); setLoadingTargets(false); return; }
            
            const addressCalls = [];
            for (let i = 0; i < Math.min(total, 500); i++) {
                addressCalls.push({ target: V5_STAKING_ADDRESS, allowFailure: true, callData: stakingInterface.encodeFunctionData("getStakerAtIndex", [i]) });
            }
            const addressResults = await mc.aggregate3(addressCalls);
            const addresses: string[] = [];
            for (const r of addressResults) { if (r.success) addresses.push(stakingInterface.decodeFunctionResult("getStakerAtIndex", r.returnData)[0]); }
            
            const statsCalls = addresses.map(addr => ({ target: V5_STAKING_ADDRESS, allowFailure: true, callData: stakingInterface.encodeFunctionData("getUserBattleStats", [addr]) }));
            const batchSize = 100;
            const loadedTargets: PurgeTarget[] = [];
            
            for (let i = 0; i < statsCalls.length; i += batchSize) {
                const batch = statsCalls.slice(i, i + batchSize);
                const batchResults = await mc.aggregate3(batch);
                batchResults.forEach((r: any, idx: number) => {
                    if (r.success) {
                        const stats = stakingInterface.decodeFunctionResult("getUserBattleStats", r.returnData);
                        const plants = stats[0].toNumber();
                        if (plants > 0) loadedTargets.push({ address: addresses[i + idx], plants, rank: 0 });
                    }
                });
            }
            
            loadedTargets.sort((a, b) => b.plants - a.plants);
            loadedTargets.forEach((t, i) => t.rank = i + 1);
            const filtered = userAddress ? loadedTargets.filter(t => t.address.toLowerCase() !== userAddress.toLowerCase()) : loadedTargets;
            
            setAllTargets(filtered);
            setTotalPages(Math.ceil(filtered.length / ITEMS_PER_PAGE));
            setTargets(filtered.slice(0, ITEMS_PER_PAGE));
        } catch (err) { console.error("[Purge] Failed to load targets:", err); }
        setLoadingTargets(false);
    }, [readProvider, purgeInfo?.isActive, userAddress]);

    useEffect(() => { const start = (currentPage - 1) * ITEMS_PER_PAGE; setTargets(allTargets.slice(start, start + ITEMS_PER_PAGE)); }, [currentPage, allTargets]);

    const handleSelectTarget = (target: PurgeTarget) => {
        if (!userAddress || !readProvider) return;
        setSelectedTarget(target);
        setStatus("");
        setAttackResult(null);
        setShowAttackModal(true);
    };

    const handleAttack = async () => {
        if (!selectedTarget || !userAddress || !readProvider) return;
        setAttacking(true);
        setStatus("Checking allowance...");
        
        try {
            const approved = await ensureAllowance(V5_BATTLES_ADDRESS, purgeFeeRaw);
            if (!approved) { setStatus("Approval failed"); setAttacking(false); return; }
            
            setStatus("Executing purge attack...");
            const data = battlesInterface.encodeFunctionData("purgeAttack", [selectedTarget.address]);
            const tx = await sendContractTx(V5_BATTLES_ADDRESS, data);
            if (!tx) { setStatus("Transaction rejected"); setAttacking(false); return; }
            
            setStatus("Confirming...");
            const receipt = await tx.wait();
            
            let resultFound = false;
            if (receipt) {
                for (const log of receipt.logs || []) {
                    try {
                        const parsed = battlesInterface.parseLog(log);
                        if (parsed.name === "PurgeAttackResult") {
                            setAttackResult({ won: parsed.args.attackerWon, stolen: formatLargeNumber(parsed.args.stolenAmount), damage: parsed.args.damagePct.toNumber() });
                            resultFound = true;
                            break;
                        }
                    } catch {}
                }
            }
            
            setShowAttackModal(false);
            if (resultFound) setShowResultModal(true);
            refreshData();
            fetchPurgeInfo();
            fetchTargets();
        } catch (e: any) { console.error("[Purge] Attack failed:", e); setStatus(e?.reason || e?.message || "Attack failed"); }
        setAttacking(false);
    };

    const closeAttackModal = () => { setShowAttackModal(false); setSelectedTarget(null); setStatus(""); };
    const closeResultModal = () => { setShowResultModal(false); setAttackResult(null); setSelectedTarget(null); };

    useEffect(() => { fetchPurgeInfo(); }, [fetchPurgeInfo]);
    useEffect(() => { const interval = setInterval(fetchPurgeInfo, 30000); return () => clearInterval(interval); }, [fetchPurgeInfo]);
    useEffect(() => { if (purgeInfo?.isActive) fetchTargets(); }, [purgeInfo?.isActive, fetchTargets]);
    
    useEffect(() => {
        if (!purgeInfo) return;
        const updateCountdown = () => {
            const now = Math.floor(Date.now() / 1000);
            if (purgeInfo.isActive) {
                // Purge is active - show time until end
                setCountdown(Math.max(0, purgeInfo.endTime - now));
            } else if (purgeInfo.startTime > 0 && purgeInfo.startTime > now) {
                // Purge is scheduled for future - show time until start
                setCountdown(Math.max(0, purgeInfo.startTime - now));
            } else {
                setCountdown(0);
            }
        };
        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);
        return () => clearInterval(interval);
    }, [purgeInfo]);
    
    useEffect(() => {
        if (!attackerStats?.cooldownRemaining) { setCooldownCountdown(0); return; }
        setCooldownCountdown(attackerStats.cooldownRemaining);
        const interval = setInterval(() => setCooldownCountdown(prev => Math.max(0, prev - 1)), 1000);
        return () => clearInterval(interval);
    }, [attackerStats?.cooldownRemaining]);

    const textMain = theme === "light" ? "#1e293b" : "#fff";
    const textMuted = theme === "light" ? "#64748b" : "#a1a9c5";
    const cardBg = theme === "light" ? "#fff" : "rgba(30,35,60,0.8)";
    const cellBg = theme === "light" ? "#f8fafc" : "rgba(255,255,255,0.03)";
    const modalBg = theme === "light" ? "#fff" : "#0f172a";

    // Check if purge is scheduled for the future
    const now = Math.floor(Date.now() / 1000);
    const isPurgeScheduled = purgeInfo && purgeInfo.startTime > 0 && purgeInfo.startTime > now;
    const isPurgeEnded = purgeInfo && purgeInfo.endTime > 0 && purgeInfo.endTime < now && !purgeInfo.isActive;

    if (loading) return (
        <div style={{ background: cardBg, borderRadius: 12, padding: 20, border: `1px solid ${theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.08)"}`, textAlign: "center" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>☠️</div>
            <div style={{ fontSize: 12, color: textMuted }}>Loading Purge Status...</div>
        </div>
    );

    // Purge is NOT active - show countdown or "no schedule" message
    if (!purgeInfo?.isActive) return (
        <div style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(168,85,247,0.1))", borderRadius: 12, padding: 16, border: "1px solid rgba(139,92,246,0.4)", marginTop: 16 }}>
            <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>☠️</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#a855f7", marginBottom: 4 }}>THE PURGE (Testing - Not Activated)</div>
                <div style={{ fontSize: 11, color: textMuted, marginBottom: 12 }}>24-hour no-shield battle event</div>
                
                {isPurgeScheduled ? (
                    <div style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(168,85,247,0.2))", borderRadius: 12, padding: 16, border: "1px solid rgba(139,92,246,0.5)" }}>
                        <div style={{ fontSize: 11, color: "#c4b5fd", marginBottom: 6, fontWeight: 600 }}>⏰ NEXT PURGE BEGINS IN</div>
                        <div style={{ fontSize: 36, fontWeight: 800, color: "#a855f7", fontFamily: "monospace", textShadow: "0 0 20px rgba(139,92,246,0.5)", marginBottom: 8 }}>{formatCountdownTime(countdown)}</div>
                        <div style={{ background: "rgba(5,8,20,0.4)", borderRadius: 8, padding: 10, marginTop: 8 }}>
                            <div style={{ fontSize: 10, color: "#c4b5fd", marginBottom: 4 }}>📅 Scheduled Start</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: textMain }}>
                                {new Date(purgeInfo!.startTime * 1000).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                            </div>
                            <div style={{ fontSize: 11, color: textMuted }}>
                                at {new Date(purgeInfo!.startTime * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </div>
                            <div style={{ fontSize: 10, color: "#fbbf24", marginTop: 6, fontWeight: 500 }}>
                                ⚡ Duration: {Math.round((purgeInfo!.endTime - purgeInfo!.startTime) / 3600)} hours of chaos
                            </div>
                        </div>
                    </div>
                ) : isPurgeEnded ? (
                    <div style={{ background: "rgba(107,114,128,0.2)", borderRadius: 10, padding: 12 }}>
                        <div style={{ fontSize: 11, color: textMuted }}>Last purge has ended</div>
                        <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>Waiting for next schedule...</div>
                    </div>
                ) : (
                    <div style={{ background: "rgba(107,114,128,0.15)", borderRadius: 10, padding: 12 }}>
                        <div style={{ fontSize: 12, color: textMuted }}>No purge currently scheduled</div>
                        <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>Check back Saturday at 11pm EST!</div>
                    </div>
                )}
                
                {globalStats && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
                        <div style={{ background: "rgba(5,8,20,0.4)", borderRadius: 8, padding: 8, textAlign: "center" }}><div style={{ fontSize: 8, color: textMuted }}>TOTAL ATTACKS</div><div style={{ fontSize: 14, fontWeight: 700, color: "#a855f7" }}>{globalStats.totalPurgeAttacks}</div></div>
                        <div style={{ background: "rgba(5,8,20,0.4)", borderRadius: 8, padding: 8, textAlign: "center" }}><div style={{ fontSize: 8, color: textMuted }}>TOTAL STOLEN</div><div style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>{globalStats.totalRewardsRedistributed}</div></div>
                        <div style={{ background: "rgba(5,8,20,0.4)", borderRadius: 8, padding: 8, textAlign: "center" }}><div style={{ fontSize: 8, color: textMuted }}>BURNED FEES</div><div style={{ fontSize: 14, fontWeight: 700, color: "#ef4444" }}>{globalStats.totalPurgeFeesBurned}</div></div>
                    </div>
                )}
            </div>
        </div>
    );

    // Purge IS active - show full UI with targets
    return (
        <>
            <div style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.15))", borderRadius: 12, padding: 16, border: "2px solid rgba(239,68,68,0.5)", marginTop: 16 }}>
                <div style={{ textAlign: "center", marginBottom: 12 }}>
                    <div style={{ fontSize: 28, marginBottom: 4 }}>☠️🔥☠️</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#ef4444", textTransform: "uppercase", letterSpacing: 2 }}>THE PURGE IS ACTIVE (Testing)</div>
                    <div style={{ fontSize: 10, color: "#fca5a5", marginTop: 4 }}>ALL SHIELDS DISABLED • Attack Anyone!</div>
                    <div style={{ background: "rgba(239,68,68,0.3)", borderRadius: 8, padding: 10, marginTop: 8, display: "inline-block" }}>
                        <div style={{ fontSize: 9, color: "#fca5a5" }}>ENDS IN</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: "monospace" }}>{formatCountdownTime(countdown)}</div>
                    </div>
                </div>

                {connected && attackerStats && (
                    <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: "#fbbf24", fontWeight: 600, marginBottom: 8, textAlign: "center" }}>⚔️ YOUR PURGE STATS</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: 6, textAlign: "center" }}><div style={{ fontSize: 8, color: textMuted }}>WINS</div><div style={{ fontSize: 16, fontWeight: 700, color: "#10b981" }}>{attackerStats.wins}</div></div>
                            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: 6, textAlign: "center" }}><div style={{ fontSize: 8, color: textMuted }}>LOSSES</div><div style={{ fontSize: 16, fontWeight: 700, color: "#ef4444" }}>{attackerStats.losses}</div></div>
                            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: 6, textAlign: "center" }}><div style={{ fontSize: 8, color: textMuted }}>STOLEN</div><div style={{ fontSize: 14, fontWeight: 600, color: "#10b981" }}>{attackerStats.rewardsStolen}</div></div>
                            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: 6, textAlign: "center" }}><div style={{ fontSize: 8, color: textMuted }}>POWER</div><div style={{ fontSize: 14, fontWeight: 600, color: "#60a5fa" }}>{attackerStats.battlePower}</div></div>
                        </div>
                        {cooldownCountdown > 0 && <div style={{ background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 6, padding: 6, marginTop: 8, textAlign: "center" }}><span style={{ fontSize: 10, color: "#fbbf24" }}>⏳ Cooldown: {formatCountdownTime(cooldownCountdown)}</span></div>}
                    </div>
                )}

                {globalStats && (
                    <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 12 }}>
                        <div style={{ background: "rgba(5,8,20,0.4)", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}><div style={{ fontSize: 8, color: textMuted }}>TOTAL ATTACKS</div><div style={{ fontSize: 14, fontWeight: 700, color: "#a855f7" }}>{globalStats.totalPurgeAttacks}</div></div>
                        <div style={{ background: "rgba(5,8,20,0.4)", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}><div style={{ fontSize: 8, color: textMuted }}>TOTAL STOLEN</div><div style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>{globalStats.totalRewardsRedistributed}</div></div>
                        <div style={{ background: "rgba(5,8,20,0.4)", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}><div style={{ fontSize: 8, color: textMuted }}>BURNED FEES</div><div style={{ fontSize: 14, fontWeight: 700, color: "#ef4444" }}>{globalStats.totalPurgeFeesBurned}</div></div>
                    </div>
                )}

                <div style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", marginBottom: 8, textAlign: "center" }}>🎯 SELECT TARGET</div>
                {loadingTargets ? <div style={{ textAlign: "center", padding: 20, color: textMuted }}>Loading targets...</div> : targets.length > 0 ? (
                    <>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                <thead><tr style={{ borderBottom: `1px solid ${theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.1)"}` }}>
                                    <th style={{ padding: "8px 4px", textAlign: "left", color: textMuted, fontWeight: 600 }}>#</th>
                                    <th style={{ padding: "8px 4px", textAlign: "left", color: textMuted, fontWeight: 600 }}>Address</th>
                                    <th style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontWeight: 600 }}>🌱</th>
                                    <th style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontWeight: 600 }}></th>
                                </tr></thead>
                                <tbody>{targets.map((target) => (
                                    <tr key={target.address} style={{ borderBottom: `1px solid ${theme === "light" ? "#f1f5f9" : "rgba(255,255,255,0.05)"}` }}>
                                        <td style={{ padding: "8px 4px", color: textMuted }}>{target.rank}</td>
                                        <td style={{ padding: "8px 4px", fontFamily: "monospace", fontSize: 10, color: textMain }}>{target.address.slice(0, 6)}...{target.address.slice(-4)}</td>
                                        <td style={{ padding: "8px 4px", textAlign: "center", color: "#10b981", fontWeight: 600 }}>{target.plants}</td>
                                        <td style={{ padding: "8px 4px", textAlign: "center" }}>
                                            <button onClick={() => handleSelectTarget(target)} disabled={!connected || cooldownCountdown > 0} style={{ padding: "4px 10px", fontSize: 10, borderRadius: 4, border: "none", background: cooldownCountdown > 0 ? "#374151" : "linear-gradient(135deg, #dc2626, #ef4444)", color: "#fff", cursor: cooldownCountdown > 0 ? "not-allowed" : "pointer", fontWeight: 600 }}>{cooldownCountdown > 0 ? "⏳" : "⚔️"}</button>
                                        </td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 12 }}>
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ padding: "6px 12px", fontSize: 11, borderRadius: 6, border: `1px solid ${theme === "light" ? "#e2e8f0" : "#374151"}`, background: cellBg, color: textMain, cursor: currentPage === 1 ? "not-allowed" : "pointer", opacity: currentPage === 1 ? 0.5 : 1 }}>← Prev</button>
                                <span style={{ fontSize: 11, color: textMuted }}>Page {currentPage} of {totalPages}</span>
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ padding: "6px 12px", fontSize: 11, borderRadius: 6, border: `1px solid ${theme === "light" ? "#e2e8f0" : "#374151"}`, background: cellBg, color: textMain, cursor: currentPage === totalPages ? "not-allowed" : "pointer", opacity: currentPage === totalPages ? 0.5 : 1 }}>Next →</button>
                            </div>
                        )}
                    </>
                ) : <div style={{ textAlign: "center", padding: 20, color: textMuted }}>No targets available</div>}
            </div>

            {/* SECRETIVE Attack Modal - Only shows plants, question marks for everything else */}
            {showAttackModal && selectedTarget && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
                    <div style={{ background: modalBg, borderRadius: 16, padding: 24, maxWidth: 380, width: "100%", border: "2px solid rgba(239,68,68,0.5)", boxShadow: "0 0 40px rgba(239,68,68,0.3)" }}>
                        <div style={{ textAlign: "center", marginBottom: 16 }}><div style={{ fontSize: 36, marginBottom: 8 }}>☠️⚔️☠️</div><div style={{ fontSize: 18, fontWeight: 800, color: "#ef4444" }}>CONFIRM ATTACK</div></div>
                        
                        <div style={{ background: "rgba(239,68,68,0.1)", borderRadius: 10, padding: 12, marginBottom: 16 }}>
                            <div style={{ fontSize: 10, color: textMuted, marginBottom: 4 }}>TARGET</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: textMain, fontFamily: "monospace" }}>{selectedTarget.address.slice(0, 10)}...{selectedTarget.address.slice(-8)}</div>
                            <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
                                <div style={{ textAlign: "center" }}><div style={{ fontSize: 9, color: textMuted }}>PLANTS</div><div style={{ fontSize: 20, fontWeight: 700, color: "#10b981" }}>{selectedTarget.plants}</div></div>
                            </div>
                        </div>

                        {/* Hidden stats - all question marks */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 16 }}>
                            <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 8, padding: 10, textAlign: "center" }}><div style={{ fontSize: 9, color: textMuted }}>THEIR POWER</div><div style={{ fontSize: 20, fontWeight: 700, color: "#ef4444" }}>???</div></div>
                            <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 8, padding: 10, textAlign: "center" }}><div style={{ fontSize: 9, color: textMuted }}>PENDING LOOT</div><div style={{ fontSize: 20, fontWeight: 700, color: "#10b981" }}>???</div></div>
                        </div>

                        <div style={{ background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.4)", borderRadius: 10, padding: 12, marginBottom: 16, textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 6 }}>⚔️ BATTLE ANALYSIS</div>
                            <div style={{ display: "flex", justifyContent: "space-around" }}>
                                <div><div style={{ fontSize: 9, color: textMuted }}>YOUR POWER</div><div style={{ fontSize: 16, fontWeight: 700, color: "#10b981" }}>{attackerStats?.battlePower || "???"}</div></div>
                                <div><div style={{ fontSize: 9, color: textMuted }}>WIN CHANCE</div><div style={{ fontSize: 16, fontWeight: 700, color: "#fbbf24" }}>???</div></div>
                            </div>
                        </div>

                        <div style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 10, padding: 10, marginBottom: 16, textAlign: "center" }}>
                            <div style={{ fontSize: 10, color: "#fbbf24" }}>Attack Fee: <b>{purgeFee} FCWEED</b></div>
                            <div style={{ fontSize: 8, color: textMuted, marginTop: 2 }}>Fee burned on loss, refunded on win</div>
                        </div>

                        <div style={{ display: "flex", gap: 10 }}>
                            <button onClick={closeAttackModal} disabled={attacking} style={{ flex: 1, padding: "14px", fontSize: 14, fontWeight: 600, borderRadius: 10, border: "1px solid rgba(107,114,128,0.3)", background: "transparent", color: textMuted, cursor: attacking ? "not-allowed" : "pointer" }}>Cancel</button>
                            <button onClick={handleAttack} disabled={attacking} style={{ flex: 1, padding: "14px", fontSize: 14, fontWeight: 700, borderRadius: 10, border: "none", background: attacking ? "#374151" : "linear-gradient(135deg, #dc2626, #ef4444)", color: "#fff", cursor: attacking ? "not-allowed" : "pointer" }}>{attacking ? "⚔️ ATTACKING..." : "⚔️ ATTACK"}</button>
                        </div>
                        {status && <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 12, textAlign: "center" }}>{status}</div>}
                    </div>
                </div>
            )}

            {/* Result Modal */}
            {showResultModal && attackResult && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
                    <div style={{ background: modalBg, borderRadius: 16, padding: 24, maxWidth: 380, width: "100%", border: `2px solid ${attackResult.won ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)"}`, boxShadow: `0 0 40px ${attackResult.won ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                        <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 64, marginBottom: 12 }}>{attackResult.won ? "🏆" : "💀"}</div>
                            <div style={{ fontSize: 28, fontWeight: 800, color: attackResult.won ? "#10b981" : "#ef4444", marginBottom: 16 }}>{attackResult.won ? "VICTORY!" : "DEFEATED!"}</div>
                            <div style={{ background: attackResult.won ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
                                {attackResult.won ? <><div style={{ fontSize: 12, color: textMuted, marginBottom: 8 }}>You stole</div><div style={{ fontSize: 32, fontWeight: 700, color: "#10b981" }}>{attackResult.stolen} FCWEED</div></> : <><div style={{ fontSize: 12, color: textMuted, marginBottom: 8 }}>Attack failed</div><div style={{ fontSize: 18, color: "#ef4444" }}>Fee burned: {purgeFee} FCWEED</div></>}
                                <div style={{ fontSize: 11, color: textMuted, marginTop: 10 }}>Damage dealt: {attackResult.damage}%</div>
                            </div>
                            <button onClick={closeResultModal} style={{ width: "100%", padding: "14px", fontSize: 14, fontWeight: 600, borderRadius: 10, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", cursor: "pointer" }}>Continue</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
