"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { V5_BATTLES_ADDRESS, WARS_BACKEND_URL, MULTICALL3_ADDRESS, V5_STAKING_ADDRESS } from "../lib/constants";

const MULTICALL3_ABI = [
    "function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])"
];

const BATTLES_ABI = [
    "function deaRaid(address target) external",
    "function deaRaidFee() view returns (uint256)",
    "function deaRaidsEnabled() view returns (bool)",
    "function getDeaAttackerStats(address) view returns (uint256 raidsWon, uint256 raidsLost, uint256 rewardsStolen, uint256 rewardsLostAttacking, uint256 cooldownRemaining, bool canAttack)",
    "function getGlobalStats() view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
    "function deaLastAttackOnTarget(address attacker, address target) view returns (uint256)",
    "function suspects(address) view returns (bool isSuspect, uint256 firstFlaggedAt, uint256 lastSellTimestamp, uint256 lastRaidedAt, uint256 totalTimesRaided, uint256 totalLost, uint256 totalSoldAmount, uint256 sellCount)",
    "function canBeRaided(address) view returns (bool)",
    "event DeaRaidResult(address indexed attacker, address indexed defender, bool attackerWon, uint256 stolenAmount, uint256 damagePct)"
];

const STAKING_ABI = [
    "function hasRaidShield(address) view returns (bool)",
    "function getUserBattleStats(address) view returns (uint256 plants, uint256 lands, uint256 superLands, uint256 avgHealth, uint256 pendingRewards)",
    "function calculateBattlePower(address) view returns (uint256)",
    "function pending(address) view returns (uint256)"
];

const battlesInterface = new ethers.utils.Interface(BATTLES_ABI);
const stakingInterface = new ethers.utils.Interface(STAKING_ABI);

type FarmInfo = {
    address: string;
    plants: number;
    avgHealth: number;
    pendingRewards: string;
    hasShield: boolean;
    canAttack: boolean;
    battlePower: number;
    targetImmunityEnds: number;
    myAttackCooldownEnds: number;
};

type JeetEntry = { 
    address: string; 
    totalSold: string; 
    sellCount: number; 
    lastSellTimestamp: number;
    expiresAt: number; 
    hasShield: boolean; 
    source: "onchain" | "backend" | "both";
    needsFlagging: boolean;
    plants: number;
    avgHealth: number;
    battlePower: number;
    isCluster: boolean;
    farms: FarmInfo[];
    totalPlants: number;
    targetImmunityEnds: number;
    myAttackCooldownEnds: number;
    hasRaidableFarm: boolean;
};

type TargetInfo = { 
    address: string; 
    pendingRewards: string; 
    plants: number; 
    avgHealth: number; 
    battlePower: number; 
    hasShield: boolean; 
    attackerPower: number; 
    winChance: number; 
    needsFlagging: boolean;
    farms: FarmInfo[];
};

type ActiveTargeting = {
    targetAddress: string;
    attackerAddress: string;
    farmAddress?: string;
    timestamp: number;
    isAttacking: boolean;
};

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
const SUSPECT_EXPIRY = 24 * 60 * 60;
const TARGET_IMMUNITY = 2 * 60 * 60;
const PER_TARGET_COOLDOWN = 6 * 60 * 60;
const TARGETING_POLL_INTERVAL = 3000;
const TARGETING_TIMEOUT = 120000;

export function DEARaidsLeaderboard({ connected, userAddress, theme, readProvider, sendContractTx, ensureAllowance, refreshData }: Props) {
    const [jeets, setJeets] = useState<JeetEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalRaids, setTotalRaids] = useState(0);
    const [raidFee, setRaidFee] = useState("100K");
    const [raidFeeRaw, setRaidFeeRaw] = useState<ethers.BigNumber>(ethers.utils.parseUnits("100000", 18));
    const [playerDeaStats, setPlayerDeaStats] = useState<{ wins: number; losses: number; stolen: string } | null>(null);
    const [showAttackModal, setShowAttackModal] = useState(false);
    const [showResultModal, setShowResultModal] = useState(false);
    const [selectedTarget, setSelectedTarget] = useState<TargetInfo | null>(null);
    const [selectedJeet, setSelectedJeet] = useState<JeetEntry | null>(null);
    const [showFarmDropdown, setShowFarmDropdown] = useState(false);
    const [raiding, setRaiding] = useState(false);
    const [loadingTarget, setLoadingTarget] = useState(false);
    const [status, setStatus] = useState("");
    const [raidResult, setRaidResult] = useState<{ won: boolean; amount: string; damage: number } | null>(null);
    const [cooldownRemaining, setCooldownRemaining] = useState(0);
    const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
    const [myBattlePower, setMyBattlePower] = useState(0);
    const [lastRefresh, setLastRefresh] = useState(Date.now());
    const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
    const [activeTargetings, setActiveTargetings] = useState<ActiveTargeting[]>([]);
    
    const fetchingRef = useRef(false);
    const targetingPollRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(Math.floor(Date.now() / 1000)), 1000);
        return () => clearInterval(timer);
    }, []);

    const pollActiveTargetings = useCallback(async () => {
        try {
            const response = await fetch(`${WARS_BACKEND_URL}/api/dea/targeting/active`);
            if (response.ok) {
                const data = await response.json();
                if (data.success && Array.isArray(data.targetings)) {
                    const now = Date.now();
                    setActiveTargetings(data.targetings.filter((t: ActiveTargeting) => now - t.timestamp < TARGETING_TIMEOUT));
                }
            }
        } catch {}
    }, []);

    const registerTargeting = useCallback(async (jeetAddress: string, farmAddress?: string, isAttacking: boolean = false) => {
        if (!userAddress) return;
        try {
            await fetch(`${WARS_BACKEND_URL}/api/dea/targeting/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetAddress: jeetAddress, attackerAddress: userAddress, farmAddress, isAttacking, timestamp: Date.now() })
            });
        } catch {}
    }, [userAddress]);

    const clearTargeting = useCallback(async (jeetAddress: string) => {
        if (!userAddress) return;
        try {
            await fetch(`${WARS_BACKEND_URL}/api/dea/targeting/clear`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetAddress: jeetAddress, attackerAddress: userAddress })
            });
        } catch {}
    }, [userAddress]);

    useEffect(() => {
        pollActiveTargetings();
        targetingPollRef.current = setInterval(pollActiveTargetings, TARGETING_POLL_INTERVAL);
        return () => { if (targetingPollRef.current) clearInterval(targetingPollRef.current); };
    }, [pollActiveTargetings]);

    const getTargetingInfo = useCallback((jeetAddress: string) => {
        const addr = jeetAddress.toLowerCase();
        const targeters = activeTargetings.filter(t => t.targetAddress.toLowerCase() === addr && t.attackerAddress.toLowerCase() !== userAddress?.toLowerCase());
        const uniqueAttackers = [...new Set(targeters.map(t => t.attackerAddress))];
        return { count: uniqueAttackers.length, attackers: uniqueAttackers, hasActiveAttack: targeters.some(t => t.isAttacking) };
    }, [activeTargetings, userAddress]);

    const now = currentTime;
    const activeJeets = jeets.filter(j => j.expiresAt > now && j.totalPlants > 0);
    const totalPages = Math.ceil(activeJeets.length / ITEMS_PER_PAGE);
    const paginatedJeets = activeJeets.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const formatLargeNumber = (val: ethers.BigNumber | string | number): string => {
        let num: number;
        if (typeof val === 'number') num = val;
        else if (typeof val === 'string') { const parsed = parseFloat(val); num = parsed > 1e15 ? parsed / 1e18 : parsed; }
        else num = parseFloat(ethers.utils.formatUnits(val, 18));
        if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
        if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
        if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
        return num.toFixed(0);
    };

    const formatTimeRemaining = (expiresAt: number): string => {
        const remaining = expiresAt - now;
        if (remaining <= 0) return "Expired";
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    };

    const formatCooldown = (seconds: number): string => {
        if (seconds <= 0) return "";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const getHealthColor = (health: number): string => {
        if (health >= 70) return "#22c55e";
        if (health >= 40) return "#fbbf24";
        if (health >= 20) return "#f97316";
        return "#ef4444";
    };

    const fetchDEAData = useCallback(async () => {
        if (fetchingRef.current || !readProvider) return;
        fetchingRef.current = true;
        setIsAutoRefreshing(true);
        
        try {
            const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, BATTLES_ABI, readProvider);
            const stakingContract = new ethers.Contract(V5_STAKING_ADDRESS, STAKING_ABI, readProvider);
            
            try {
                const [fee, globalStats] = await Promise.all([battlesContract.deaRaidFee(), battlesContract.getGlobalStats()]);
                setRaidFeeRaw(fee);
                setRaidFee(formatLargeNumber(fee));
                setTotalRaids(globalStats[1].toNumber());
            } catch (e) { console.error("[DEA] Stats error:", e); }
            
            if (userAddress) {
                try {
                    const [attackerStats, power] = await Promise.all([battlesContract.getDeaAttackerStats(userAddress), stakingContract.calculateBattlePower(userAddress)]);
                    setCooldownRemaining(attackerStats.cooldownRemaining.toNumber());
                    setMyBattlePower(power.toNumber());
                    setPlayerDeaStats({ wins: attackerStats.raidsWon.toNumber(), losses: attackerStats.raidsLost.toNumber(), stolen: formatLargeNumber(attackerStats.rewardsStolen) });
                } catch (e) { console.error("[DEA] User stats error:", e); }
            }
            
            let backendData: any[] = [];
            try {
                const res = await fetch(`${WARS_BACKEND_URL}/api/dea/leaderboard?limit=200`);
                const data = await res.json();
                if (data.success && Array.isArray(data.jeets)) backendData = data.jeets;
            } catch (e) { console.error("[DEA] Backend error:", e); }
            
            const processedJeets: JeetEntry[] = [];
            for (const j of backendData) {
                const lastSell = j.lastSellTime || j.lastSellTimestamp || 0;
                const expiresAt = j.expiresAt || (lastSell > 0 ? lastSell + SUSPECT_EXPIRY : 0);
                if (expiresAt <= now) continue;
                
                let farms: FarmInfo[] = [];
                let totalPlants = 0, avgHealthSum = 0;
                
                if (j.farms && Array.isArray(j.farms) && j.farms.length > 0) {
                    farms = j.farms.map((f: any) => ({ address: f.address, plants: f.plants || 0, avgHealth: f.avgHealth || 0, pendingRewards: f.pendingRewards || "0", hasShield: f.hasShield || false, canAttack: f.canBeRaided || f.canAttack || false, battlePower: f.battlePower || 0, targetImmunityEnds: 0, myAttackCooldownEnds: 0 }));
                    for (const f of farms) { totalPlants += f.plants; avgHealthSum += f.avgHealth; }
                } else {
                    farms = [{ address: j.address, plants: j.totalPlants || j.plants || 0, avgHealth: j.avgHealth || 0, pendingRewards: "0", hasShield: j.hasShield || false, canAttack: true, battlePower: 0, targetImmunityEnds: 0, myAttackCooldownEnds: 0 }];
                    totalPlants = farms[0].plants; avgHealthSum = farms[0].avgHealth;
                }
                
                processedJeets.push({ address: j.address, totalSold: j.totalSold || "0", sellCount: j.sellCount || 1, lastSellTimestamp: lastSell, expiresAt, hasShield: j.hasShield || false, source: j.flaggedOnChain ? "onchain" : "backend", needsFlagging: !j.flaggedOnChain, plants: totalPlants, avgHealth: farms.length > 0 ? Math.round(avgHealthSum / farms.length) : 0, battlePower: 0, isCluster: farms.length > 1, farms, totalPlants, targetImmunityEnds: 0, myAttackCooldownEnds: 0, hasRaidableFarm: farms.some(f => f.plants > 0 && !f.hasShield) });
            }
            
            processedJeets.sort((a, b) => (parseFloat(b.totalSold) || 0) - (parseFloat(a.totalSold) || 0));
            setJeets(processedJeets);
            setLastRefresh(Date.now());
        } catch (e) { console.error("[DEA] Fetch error:", e); }
        
        setLoading(false);
        setIsAutoRefreshing(false);
        fetchingRef.current = false;
    }, [readProvider, userAddress, now]);

    useEffect(() => {
        if (!readProvider) return;
        fetchDEAData();
        const refreshInterval = setInterval(fetchDEAData, 15000);
        return () => clearInterval(refreshInterval);
    }, [readProvider, userAddress, fetchDEAData]);

    const handleSelectTarget = async (jeet: JeetEntry) => {
        if (!readProvider || !userAddress) return;
        setSelectedJeet(jeet); setLoadingTarget(true); setStatus(""); setShowAttackModal(true); setSelectedTarget(null); setShowFarmDropdown(false);
        await registerTargeting(jeet.address);
        
        try {
            const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
            const farmAddresses = jeet.farms.map(f => f.address);
            const calls: any[] = [];
            farmAddresses.forEach(addr => {
                calls.push({ target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("pending", [addr]) }, { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("getUserBattleStats", [addr]) }, { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("calculateBattlePower", [addr]) }, { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("hasRaidShield", [addr]) }, { target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("canBeRaided", [addr]) }, { target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("suspects", [addr]) });
                if (userAddress) calls.push({ target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("deaLastAttackOnTarget", [userAddress, addr]) });
            });
            if (userAddress) calls.push({ target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("calculateBattlePower", [userAddress]) });
            
            const results = await mc.tryAggregate(false, calls);
            const updatedFarms: FarmInfo[] = [];
            let bestFarm: FarmInfo | null = null;
            const callsPerFarm = userAddress ? 7 : 6;
            
            for (let i = 0; i < farmAddresses.length; i++) {
                const baseIdx = i * callsPerFarm, addr = farmAddresses[i];
                let pending = "0", plants = 0, avgHealth = 0, power = 0, hasShield = false, canBeRaided = false, lastRaidedAt = 0, myLastAttackAt = 0;
                if (results[baseIdx]?.success) pending = formatLargeNumber(stakingInterface.decodeFunctionResult("pending", results[baseIdx].returnData)[0]);
                if (results[baseIdx + 1]?.success) { const stats = stakingInterface.decodeFunctionResult("getUserBattleStats", results[baseIdx + 1].returnData); plants = stats[0].toNumber(); avgHealth = stats[3].toNumber(); }
                if (results[baseIdx + 2]?.success) power = stakingInterface.decodeFunctionResult("calculateBattlePower", results[baseIdx + 2].returnData)[0].toNumber();
                if (results[baseIdx + 3]?.success) hasShield = stakingInterface.decodeFunctionResult("hasRaidShield", results[baseIdx + 3].returnData)[0];
                if (results[baseIdx + 4]?.success) canBeRaided = battlesInterface.decodeFunctionResult("canBeRaided", results[baseIdx + 4].returnData)[0];
                if (results[baseIdx + 5]?.success) lastRaidedAt = battlesInterface.decodeFunctionResult("suspects", results[baseIdx + 5].returnData).lastRaidedAt.toNumber();
                if (userAddress && results[baseIdx + 6]?.success) myLastAttackAt = battlesInterface.decodeFunctionResult("deaLastAttackOnTarget", results[baseIdx + 6].returnData)[0].toNumber();
                
                const targetImmunityEnds = lastRaidedAt > 0 ? lastRaidedAt + TARGET_IMMUNITY : 0;
                const myAttackCooldownEnds = myLastAttackAt > 0 ? myLastAttackAt + PER_TARGET_COOLDOWN : 0;
                const canAttack = plants > 0 && !hasShield && avgHealth > 0 && (canBeRaided || jeet.needsFlagging) && !(targetImmunityEnds > now) && !(myAttackCooldownEnds > now);
                const farm: FarmInfo = { address: addr, plants, avgHealth, pendingRewards: pending, hasShield, canAttack, battlePower: power || Math.floor(plants * 3 * avgHealth / 100), targetImmunityEnds, myAttackCooldownEnds };
                updatedFarms.push(farm);
                if (canAttack && (!bestFarm || parseFloat(pending) > parseFloat(bestFarm.pendingRewards))) bestFarm = farm;
            }
            
            let attackerPower = myBattlePower;
            if (userAddress && results[farmAddresses.length * callsPerFarm]?.success) { attackerPower = stakingInterface.decodeFunctionResult("calculateBattlePower", results[farmAddresses.length * callsPerFarm].returnData)[0].toNumber(); setMyBattlePower(attackerPower); }
            
            const selectedFarm = bestFarm || updatedFarms.find(f => f.plants > 0) || updatedFarms[0];
            const targetPower = selectedFarm?.battlePower || 0;
            const winChance = attackerPower > 0 && targetPower > 0 ? Math.min(95, Math.max(5, Math.round((attackerPower / (attackerPower + targetPower)) * 100))) : 50;
            setSelectedTarget({ address: selectedFarm?.address || jeet.address, pendingRewards: selectedFarm?.pendingRewards || "0", plants: selectedFarm?.plants || 0, avgHealth: selectedFarm?.avgHealth || 0, battlePower: targetPower, hasShield: selectedFarm?.hasShield || false, attackerPower, winChance, needsFlagging: jeet.needsFlagging, farms: updatedFarms });
        } catch (e: any) { console.error("[DEA] Failed to load target:", e); setStatus("Failed to load target stats"); }
        setLoadingTarget(false);
    };

    const selectFarm = async (farm: FarmInfo) => {
        if (!selectedTarget || !selectedJeet) return;
        const attackerPower = selectedTarget.attackerPower || myBattlePower;
        const targetPower = farm.battlePower || 0;
        const winChance = attackerPower > 0 && targetPower > 0 ? Math.min(95, Math.max(5, Math.round((attackerPower / (attackerPower + targetPower)) * 100))) : 50;
        await registerTargeting(selectedJeet.address, farm.address);
        setSelectedTarget({ ...selectedTarget, address: farm.address, pendingRewards: farm.pendingRewards, plants: farm.plants, avgHealth: farm.avgHealth, battlePower: targetPower, hasShield: farm.hasShield, winChance });
        setShowFarmDropdown(false);
    };

    const closeAttackModal = async () => { if (selectedJeet) await clearTargeting(selectedJeet.address); setShowAttackModal(false); setSelectedTarget(null); setSelectedJeet(null); setShowFarmDropdown(false); };
    const closeResultModal = () => { setShowResultModal(false); setRaidResult(null); refreshData(); fetchDEAData(); };

    const handleRaid = async () => {
        if (!selectedTarget || !userAddress || !selectedJeet || raiding) return;
        await registerTargeting(selectedJeet.address, selectedTarget.address, true);
        setRaiding(true); setStatus("Checking allowance...");
        try {
            const approved = await ensureAllowance(V5_BATTLES_ADDRESS, raidFeeRaw);
            if (!approved) { setStatus("Approval failed"); setRaiding(false); return; }
            setStatus("Initiating DEA Raid...");
            const data = battlesInterface.encodeFunctionData("deaRaid", [selectedTarget.address]);
            const tx = await sendContractTx(V5_BATTLES_ADDRESS, data, "0x7A120");
            if (!tx) { setStatus("Transaction rejected"); setRaiding(false); return; }
            setStatus("Raid in progress...");
            const receipt = await tx.wait();
            let won = false, amount = "0", damage = 0;
            for (const log of receipt.logs) { try { const parsed = battlesInterface.parseLog(log); if (parsed.name === "DeaRaidResult") { won = parsed.args.attackerWon; amount = formatLargeNumber(parsed.args.stolenAmount); damage = parsed.args.damagePct.toNumber(); break; } } catch {} }
            await clearTargeting(selectedJeet.address);
            setRaidResult({ won, amount, damage }); setShowAttackModal(false); setShowResultModal(true); fetchDEAData();
        } catch (e: any) { console.error("[DEA] Raid failed:", e); setStatus(e?.reason || e?.message || "Raid failed"); await clearTargeting(selectedJeet.address); }
        setRaiding(false);
    };

    const cardBg = theme === "light" ? "#f8fafc" : "rgba(30,35,45,0.95)";
    const modalBg = theme === "light" ? "#ffffff" : "#1a1f2e";
    const borderColor = theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.1)";
    const textPrimary = theme === "light" ? "#1e293b" : "#ffffff";
    const textMuted = theme === "light" ? "#64748b" : "#94a3b8";
    const shortAddr = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

    return (
        <>
            <div style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div>
                        <h2 style={{ fontSize: 18, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>🚔 DEA Raids</h2>
                        <div style={{ fontSize: 10, color: textMuted }}>{totalRaids} total raids • Fee: {raidFee}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isAutoRefreshing && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", animation: "pulse 1s infinite" }} />}
                        <div style={{ fontSize: 9, color: textMuted }}>Updated {Math.floor((Date.now() - lastRefresh) / 1000)}s ago</div>
                    </div>
                </div>

                {connected && playerDeaStats && (
                    <div style={{ background: cardBg, borderRadius: 10, padding: 12, marginBottom: 16, border: `1px solid ${borderColor}` }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, textAlign: "center" }}>
                            <div><div style={{ fontSize: 9, color: textMuted }}>WINS</div><div style={{ fontSize: 16, fontWeight: 700, color: "#10b981" }}>{playerDeaStats.wins}</div></div>
                            <div><div style={{ fontSize: 9, color: textMuted }}>LOSSES</div><div style={{ fontSize: 16, fontWeight: 700, color: "#ef4444" }}>{playerDeaStats.losses}</div></div>
                            <div><div style={{ fontSize: 9, color: textMuted }}>STOLEN</div><div style={{ fontSize: 16, fontWeight: 700, color: "#fbbf24" }}>{playerDeaStats.stolen}</div></div>
                        </div>
                    </div>
                )}

                {loading ? <div style={{ textAlign: "center", padding: 40, color: textMuted }}>Loading suspects...</div> : activeJeets.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: textMuted }}>No active suspects found</div> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {paginatedJeets.map((jeet) => {
                            const targetingInfo = getTargetingInfo(jeet.address);
                            const isBeingTargeted = targetingInfo.count > 0;
                            return (
                                <div key={jeet.address} onClick={() => handleSelectTarget(jeet)} style={{ background: cardBg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${isBeingTargeted ? "rgba(239,68,68,0.5)" : borderColor}`, cursor: "pointer", position: "relative" }}>
                                    {isBeingTargeted && (
                                        <div style={{ position: "absolute", top: -8, right: 8, background: targetingInfo.hasActiveAttack ? "#dc2626" : "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 10, display: "flex", alignItems: "center", gap: 4, animation: targetingInfo.hasActiveAttack ? "pulse 0.5s infinite" : "pulse 1.5s infinite", boxShadow: "0 2px 4px rgba(0,0,0,0.3)" }}>
                                            <span>{targetingInfo.hasActiveAttack ? "⚔️" : "🎯"}</span>
                                            {targetingInfo.count === 1 ? (targetingInfo.hasActiveAttack ? "Under Attack!" : "1 Player Targeting") : `${targetingInfo.count} Players Targeting`}
                                        </div>
                                    )}
                                    <div style={{ display: "grid", gridTemplateColumns: "130px 1fr 70px", alignItems: "center", gap: 8 }}>
                                        <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: textPrimary, display: "flex", alignItems: "center", gap: 6 }}>
                                            {shortAddr(jeet.address)}
                                            {jeet.isCluster && <span style={{ fontSize: 9, color: "#8b5cf6", background: "rgba(139,92,246,0.15)", padding: "2px 5px", borderRadius: 4 }}>📦 {jeet.farms.length}</span>}
                                        </div>
                                        <div style={{ fontSize: 10, color: textMuted, display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ color: "#fbbf24" }}>💰 {formatLargeNumber(jeet.totalSold)}</span>
                                            <span>•</span>
                                            <span style={{ color: "#10b981" }}>{jeet.totalPlants} 🌿</span>
                                            <span>•</span>
                                            <span style={{ color: getHealthColor(jeet.avgHealth) }}>{jeet.avgHealth}% ❤️</span>
                                        </div>
                                        <div style={{ textAlign: "right" }}>
                                            <div style={{ fontSize: 10, color: "#fbbf24" }}>⏱️ {formatTimeRemaining(jeet.expiresAt)}</div>
                                            {jeet.hasShield && <div style={{ fontSize: 10, color: "#3b82f6" }}>🛡️</div>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {totalPages > 1 && (
                    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ padding: "6px 12px", fontSize: 11, borderRadius: 6, border: `1px solid ${borderColor}`, background: "transparent", color: textMuted, cursor: currentPage === 1 ? "not-allowed" : "pointer" }}>Prev</button>
                        <span style={{ padding: "6px 12px", fontSize: 11, color: textMuted }}>{currentPage} / {totalPages}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ padding: "6px 12px", fontSize: 11, borderRadius: 6, border: `1px solid ${borderColor}`, background: "transparent", color: textMuted, cursor: currentPage === totalPages ? "not-allowed" : "pointer" }}>Next</button>
                    </div>
                )}
            </div>

            {showAttackModal && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
                    <div style={{ background: modalBg, borderRadius: 16, padding: 20, maxWidth: 380, width: "100%", border: `1px solid ${borderColor}`, maxHeight: "90vh", overflow: "auto" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: textPrimary, marginBottom: 16, textAlign: "center" }}>🚔 DEA RAID</div>
                        
                        {selectedJeet && (() => { const info = getTargetingInfo(selectedJeet.address); if (info.count === 0) return null; return (
                            <div style={{ background: info.hasActiveAttack ? "rgba(220,38,38,0.2)" : "rgba(239,68,68,0.15)", border: `1px solid ${info.hasActiveAttack ? "rgba(220,38,38,0.6)" : "rgba(239,68,68,0.4)"}`, borderRadius: 10, padding: 12, marginBottom: 16, textAlign: "center", animation: info.hasActiveAttack ? "pulse 0.5s infinite" : undefined }}>
                                <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>{info.hasActiveAttack ? `⚔️ ${info.count} player${info.count > 1 ? 's' : ''} actively attacking!` : `🎯 ${info.count} other player${info.count > 1 ? 's' : ''} targeting this!`}</div>
                                <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>{info.hasActiveAttack ? "They may claim rewards before you!" : "They may attack before you"}</div>
                            </div>
                        );})()}

                        {selectedJeet && selectedJeet.isCluster && selectedTarget && (
                            <div style={{ marginBottom: 16 }}>
                                <button onClick={() => setShowFarmDropdown(!showFarmDropdown)} style={{ width: "100%", padding: "10px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${borderColor}`, background: cardBg, color: textPrimary, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ fontFamily: "monospace" }}>Target: {shortAddr(selectedTarget.address)}</span>
                                    <span>{showFarmDropdown ? "▲" : "▼"}</span>
                                </button>
                                {showFarmDropdown && (
                                    <div style={{ marginTop: 8, background: cardBg, borderRadius: 8, border: `1px solid ${borderColor}`, overflow: "hidden" }}>
                                        {selectedTarget.farms.map((farm, i) => {
                                            const isSelected = farm.address.toLowerCase() === selectedTarget.address.toLowerCase();
                                            const cooldownLeft = farm.myAttackCooldownEnds > now ? farm.myAttackCooldownEnds - now : 0;
                                            const immunityLeft = farm.targetImmunityEnds > now ? farm.targetImmunityEnds - now : 0;
                                            return (
                                                <button key={farm.address} onClick={() => selectFarm(farm)} disabled={farm.hasShield || !farm.canAttack} style={{ width: "100%", padding: "10px 12px", border: "none", borderBottom: i < selectedTarget.farms.length - 1 ? `1px solid ${borderColor}` : "none", background: isSelected ? "rgba(16,185,129,0.15)" : "transparent", color: farm.hasShield || !farm.canAttack ? textMuted : textPrimary, cursor: farm.hasShield || !farm.canAttack ? "not-allowed" : "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                                                    <div><div style={{ fontWeight: 600, fontFamily: "monospace" }}>{shortAddr(farm.address)}</div><div style={{ fontSize: 9, color: textMuted }}>{farm.plants} 🌿 • {farm.avgHealth}% ❤️ • {farm.pendingRewards} pending</div></div>
                                                    {farm.hasShield ? <span style={{ fontSize: 10, color: "#3b82f6" }}>🛡️</span> : cooldownLeft > 0 ? <span style={{ fontSize: 9, color: "#fbbf24" }}>⏳ {formatCooldown(cooldownLeft)}</span> : immunityLeft > 0 ? <span style={{ fontSize: 9, color: "#3b82f6" }}>🛡️ {formatCooldown(immunityLeft)}</span> : isSelected ? <span style={{ fontSize: 10, color: "#10b981" }}>✓</span> : null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {loadingTarget && <div style={{ textAlign: "center", padding: 30, color: textMuted }}>Loading...</div>}

                        {!loadingTarget && selectedTarget && (
                            <>
                                {selectedTarget.hasShield && <div style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.4)", borderRadius: 10, padding: 16, marginBottom: 16, textAlign: "center" }}><div style={{ fontSize: 28, marginBottom: 4 }}>🛡️</div><div style={{ fontSize: 12, color: "#3b82f6", fontWeight: 600 }}>Target Protected</div></div>}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                                    <div style={{ background: "rgba(239,68,68,0.1)", borderRadius: 8, padding: 12, textAlign: "center" }}><div style={{ fontSize: 9, color: textMuted, marginBottom: 4 }}>THEIR POWER</div><div style={{ fontSize: 22, fontWeight: 700, color: "#ef4444" }}>{selectedTarget.battlePower}</div></div>
                                    <div style={{ background: "rgba(16,185,129,0.1)", borderRadius: 8, padding: 12, textAlign: "center" }}><div style={{ fontSize: 9, color: textMuted, marginBottom: 4 }}>PENDING LOOT</div><div style={{ fontSize: 22, fontWeight: 700, color: "#10b981" }}>{selectedTarget.pendingRewards}</div></div>
                                </div>
                                <div style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                                    <div style={{ fontSize: 10, color: "#60a5fa", marginBottom: 10, fontWeight: 600, textAlign: "center" }}>⚔️ BATTLE ANALYSIS</div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                                        <div style={{ textAlign: "center" }}><div style={{ fontSize: 8, color: textMuted }}>YOUR POWER</div><div style={{ fontSize: 18, fontWeight: 700, color: "#10b981" }}>{selectedTarget.attackerPower || myBattlePower}</div></div>
                                        <div style={{ textAlign: "center" }}><div style={{ fontSize: 8, color: textMuted }}>VS</div><div style={{ fontSize: 18, fontWeight: 700, color: "#ef4444" }}>{selectedTarget.battlePower}</div></div>
                                        <div style={{ textAlign: "center" }}><div style={{ fontSize: 8, color: textMuted }}>WIN CHANCE</div><div style={{ fontSize: 18, fontWeight: 700, color: selectedTarget.winChance >= 50 ? "#10b981" : "#ef4444" }}>{selectedTarget.winChance}%</div></div>
                                    </div>
                                </div>
                                <div style={{ background: "rgba(251,191,36,0.1)", borderRadius: 8, padding: 8, marginBottom: 16, textAlign: "center" }}><span style={{ fontSize: 10, color: "#fbbf24" }}>Raid Fee: <b>{raidFee}</b> • Refunded on win</span></div>
                                <div style={{ display: "flex", gap: 10 }}>
                                    <button onClick={closeAttackModal} disabled={raiding} style={{ flex: 1, padding: "12px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: `1px solid ${borderColor}`, background: "transparent", color: textMuted, cursor: "pointer" }}>Cancel</button>
                                    <button onClick={handleRaid} disabled={raiding || selectedTarget.hasShield || selectedTarget.plants === 0 || cooldownRemaining > 0} style={{ flex: 2, padding: "12px", fontSize: 13, fontWeight: 700, borderRadius: 8, border: "none", background: (raiding || selectedTarget.hasShield || cooldownRemaining > 0) ? "#374151" : "linear-gradient(135deg, #dc2626, #ef4444)", color: "#fff", cursor: (raiding || selectedTarget.hasShield || cooldownRemaining > 0) ? "not-allowed" : "pointer" }}>
                                        {raiding ? "Raiding..." : selectedTarget.hasShield ? "🛡️ Shielded" : cooldownRemaining > 0 ? `⏳ ${formatCooldown(cooldownRemaining)}` : "🚔 RAID"}
                                    </button>
                                </div>
                                {status && <div style={{ fontSize: 10, color: "#fbbf24", marginTop: 10, textAlign: "center" }}>{status}</div>}
                            </>
                        )}
                    </div>
                </div>
            )}

            {showResultModal && raidResult && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
                    <div style={{ background: modalBg, borderRadius: 16, padding: 24, maxWidth: 340, width: "100%", border: `2px solid ${raidResult.won ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)"}`, textAlign: "center" }}>
                        <div style={{ fontSize: 56, marginBottom: 12 }}>{raidResult.won ? "🎉" : "💀"}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: raidResult.won ? "#10b981" : "#ef4444", marginBottom: 16 }}>{raidResult.won ? "SUCCESS!" : "FAILED!"}</div>
                        <div style={{ background: raidResult.won ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                            {raidResult.won ? <><div style={{ fontSize: 11, color: textMuted }}>Seized</div><div style={{ fontSize: 28, fontWeight: 700, color: "#10b981" }}>{raidResult.amount}</div></> : <><div style={{ fontSize: 11, color: textMuted }}>Fee Lost</div><div style={{ fontSize: 20, fontWeight: 600, color: "#ef4444" }}>{raidFee}</div></>}
                            <div style={{ fontSize: 10, color: textMuted, marginTop: 8 }}>Damage: {raidResult.damage}%</div>
                        </div>
                        <button onClick={closeResultModal} style={{ width: "100%", padding: "12px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", cursor: "pointer" }}>Continue</button>
                    </div>
                </div>
            )}
            
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
        </>
    );
}
