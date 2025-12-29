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
    "function getSuspectInfo(address) view returns (bool isSuspect, uint256 lastSellTimestamp, uint256 expiresAt, uint256 totalTimesRaided, uint256 totalLost, uint256 totalSoldAmount, uint256 sellCount, bool canCurrentlyBeRaided)",
    "function getSuspectList() view returns (address[])",
    "function canBeRaided(address) view returns (bool)",
    "function getDeaAttackerStats(address) view returns (uint256 raidsWon, uint256 raidsLost, uint256 rewardsStolen, uint256 rewardsLostAttacking, uint256 cooldownRemaining, bool canAttack)",
    "function getGlobalStats() view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
    "function deaLastAttackOnTarget(address attacker, address target) view returns (uint256)",
    "function suspects(address) view returns (bool isSuspect, uint256 firstFlaggedAt, uint256 lastSellTimestamp, uint256 lastRaidedAt, uint256 totalTimesRaided, uint256 totalLost, uint256 totalSoldAmount, uint256 sellCount)",
    "function deaTargetImmunity() view returns (uint256)",
    "function deaPerTargetCooldown() view returns (uint256)",
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

export function DEARaidsLeaderboard({ connected, userAddress, theme, readProvider, sendContractTx, ensureAllowance, refreshData }: Props) {
    const [jeets, setJeets] = useState<JeetEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalRaids, setTotalRaids] = useState(0);
    const [raidFee, setRaidFee] = useState("100K");
    const [raidFeeRaw, setRaidFeeRaw] = useState<ethers.BigNumber>(ethers.utils.parseUnits("100000", 18));
    const [deaEnabled, setDeaEnabled] = useState(true);
    
   
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
    
    const fetchingRef = useRef(false);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(Math.floor(Date.now() / 1000)), 1000);
        return () => clearInterval(timer);
    }, []);

    const now = currentTime;
    const activeJeets = jeets.filter(j => j.expiresAt > now && j.totalPlants > 0);
    const totalPages = Math.ceil(activeJeets.length / ITEMS_PER_PAGE);
    const paginatedJeets = activeJeets.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const formatLargeNumber = (val: ethers.BigNumber | string | number): string => {
        let num: number;
        if (typeof val === 'number') num = val;
        else if (typeof val === 'string') {
            const parsed = parseFloat(val);
            num = parsed > 1e15 ? parsed / 1e18 : parsed;
        }
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
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    const formatCooldown = (seconds: number): string => {
        if (seconds <= 0) return "";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
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
        setLoading(true);
        
        try {
            const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, BATTLES_ABI, readProvider);
            const stakingContract = new ethers.Contract(V5_STAKING_ADDRESS, STAKING_ABI, readProvider);
            
           
            try {
                const [enabled, fee, globalStats] = await Promise.all([
                    battlesContract.deaRaidsEnabled(),
                    battlesContract.deaRaidFee(),
                    battlesContract.getGlobalStats()
                ]);
                setDeaEnabled(enabled);
                setRaidFeeRaw(fee);
                setRaidFee(formatLargeNumber(fee));
                setTotalRaids(globalStats[1].toNumber());
            } catch (e) {
                console.error("[DEA] Stats error:", e);
            }
            
           
            if (userAddress) {
                try {
                    const [attackerStats, power] = await Promise.all([
                        battlesContract.getDeaAttackerStats(userAddress),
                        stakingContract.calculateBattlePower(userAddress)
                    ]);
                    setCooldownRemaining(attackerStats.cooldownRemaining.toNumber());
                    setMyBattlePower(power.toNumber());
                   
                    setPlayerDeaStats({
                        wins: attackerStats.raidsWon.toNumber(),
                        losses: attackerStats.raidsLost.toNumber(),
                        stolen: formatLargeNumber(attackerStats.rewardsStolen)
                    });
                } catch (e) {
                    console.error("[DEA] User stats error:", e);
                }
            }
            
           
            let backendData: any[] = [];
            try {
                const res = await fetch(`${WARS_BACKEND_URL}/api/dea/leaderboard?limit=200`);
                const data = await res.json();
                if (data.success && Array.isArray(data.jeets)) {
                    backendData = data.jeets;
                }
            } catch (e) {
                console.error("[DEA] Backend error:", e);
            }
            
           
            const processedJeets: JeetEntry[] = [];
            
            for (const j of backendData) {
                const lastSell = j.lastSellTime || j.lastSellTimestamp || 0;
                const expiresAt = j.expiresAt || (lastSell > 0 ? lastSell + SUSPECT_EXPIRY : 0);
                if (expiresAt <= now) continue;
                
                let farms: FarmInfo[] = [];
                let totalPlants = 0;
                let avgHealthSum = 0;
                
                if (j.farms && Array.isArray(j.farms) && j.farms.length > 0) {
                    farms = j.farms.map((f: any) => ({
                        address: f.address,
                        plants: f.plants || 0,
                        avgHealth: f.avgHealth || 0,
                        pendingRewards: f.pendingRewards || "0",
                        hasShield: f.hasShield || false,
                        canAttack: f.canBeRaided || f.canAttack || false,
                        battlePower: f.battlePower || 0,
                        targetImmunityEnds: 0,
                        myAttackCooldownEnds: 0
                    }));
                    for (const f of farms) {
                        totalPlants += f.plants;
                        avgHealthSum += f.avgHealth;
                    }
                } else {
                    farms = [{
                        address: j.address,
                        plants: j.totalPlants || j.plants || 0,
                        avgHealth: j.avgHealth || 0,
                        pendingRewards: "0",
                        hasShield: j.hasShield || false,
                        canAttack: true,
                        battlePower: 0,
                        targetImmunityEnds: 0,
                        myAttackCooldownEnds: 0
                    }];
                    totalPlants = farms[0].plants;
                    avgHealthSum = farms[0].avgHealth;
                }
                
                const avgHealth = farms.length > 0 ? Math.round(avgHealthSum / farms.length) : 0;
                
                processedJeets.push({
                    address: j.address,
                    totalSold: j.totalSold || "0",
                    sellCount: j.sellCount || 1,
                    lastSellTimestamp: lastSell,
                    expiresAt,
                    hasShield: j.hasShield || false,
                    source: j.flaggedOnChain ? "onchain" : "backend",
                    needsFlagging: !j.flaggedOnChain,
                    plants: totalPlants,
                    avgHealth,
                    battlePower: 0,
                    isCluster: farms.length > 1,
                    farms,
                    totalPlants,
                    targetImmunityEnds: 0,
                    myAttackCooldownEnds: 0,
                    hasRaidableFarm: farms.some(f => f.plants > 0 && !f.hasShield)
                });
            }
            
            processedJeets.sort((a, b) => (parseFloat(b.totalSold) || 0) - (parseFloat(a.totalSold) || 0));
            setJeets(processedJeets);
        } catch (e) {
            console.error("[DEA] Fetch error:", e);
        }
        
        setLoading(false);
        fetchingRef.current = false;
    }, [readProvider, userAddress, now]);

   
    const handleSelectTarget = async (jeet: JeetEntry) => {
        if (!readProvider) return;
        
        setSelectedJeet(jeet);
        setLoadingTarget(true);
        setStatus("");
        setShowAttackModal(true);
        setSelectedTarget(null);
        setShowFarmDropdown(false);
        
        try {
            const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
            const farmAddresses = jeet.farms.map(f => f.address);
            const calls: any[] = [];
            
            farmAddresses.forEach(addr => {
                calls.push(
                    { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("pending", [addr]) },
                    { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("getUserBattleStats", [addr]) },
                    { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("calculateBattlePower", [addr]) },
                    { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("hasRaidShield", [addr]) },
                    { target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("canBeRaided", [addr]) },
                    { target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("suspects", [addr]) }
                );
               
                if (userAddress) {
                    calls.push({ target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("deaLastAttackOnTarget", [userAddress, addr]) });
                }
            });
            
            if (userAddress) {
                calls.push({ target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("calculateBattlePower", [userAddress]) });
            }
            
            const results = await mc.tryAggregate(false, calls);
            
            const updatedFarms: FarmInfo[] = [];
            let bestFarm: FarmInfo | null = null;
            const isBackendOnly = jeet.needsFlagging;
            const callsPerFarm = userAddress ? 7 : 6;
            
            for (let i = 0; i < farmAddresses.length; i++) {
                const baseIdx = i * callsPerFarm;
                const addr = farmAddresses[i];
                
                let pending = "0", plants = 0, avgHealth = 0, power = 0, hasShield = false, canBeRaided = false;
                let lastRaidedAt = 0, myLastAttackAt = 0;
                
                if (results[baseIdx]?.success) {
                    pending = formatLargeNumber(stakingInterface.decodeFunctionResult("pending", results[baseIdx].returnData)[0]);
                }
                if (results[baseIdx + 1]?.success) {
                    const stats = stakingInterface.decodeFunctionResult("getUserBattleStats", results[baseIdx + 1].returnData);
                    plants = stats[0].toNumber();
                    avgHealth = stats[3].toNumber();
                }
                if (results[baseIdx + 2]?.success) {
                    power = stakingInterface.decodeFunctionResult("calculateBattlePower", results[baseIdx + 2].returnData)[0].toNumber();
                }
                if (results[baseIdx + 3]?.success) {
                    hasShield = stakingInterface.decodeFunctionResult("hasRaidShield", results[baseIdx + 3].returnData)[0];
                }
                if (results[baseIdx + 4]?.success) {
                    canBeRaided = battlesInterface.decodeFunctionResult("canBeRaided", results[baseIdx + 4].returnData)[0];
                }
                if (results[baseIdx + 5]?.success) {
                    const suspectData = battlesInterface.decodeFunctionResult("suspects", results[baseIdx + 5].returnData);
                    lastRaidedAt = suspectData.lastRaidedAt.toNumber();
                }
                if (userAddress && results[baseIdx + 6]?.success) {
                    myLastAttackAt = battlesInterface.decodeFunctionResult("deaLastAttackOnTarget", results[baseIdx + 6].returnData)[0].toNumber();
                }
                
               
                const targetImmunityEnds = lastRaidedAt > 0 ? lastRaidedAt + TARGET_IMMUNITY : 0;
                const myAttackCooldownEnds = myLastAttackAt > 0 ? myLastAttackAt + PER_TARGET_COOLDOWN : 0;
                
               
               
                const hasImmunity = targetImmunityEnds > now;
                const hasMyPersonalCooldown = myAttackCooldownEnds > now;
                const canAttack = plants > 0 && !hasShield && avgHealth > 0 && (canBeRaided || isBackendOnly) && !hasImmunity && !hasMyPersonalCooldown;
                
                const farm: FarmInfo = {
                    address: addr,
                    plants,
                    avgHealth,
                    pendingRewards: pending,
                    hasShield,
                    canAttack,
                    battlePower: power || Math.floor(plants * 3 * avgHealth / 100),
                    targetImmunityEnds,
                    myAttackCooldownEnds
                };
                
                updatedFarms.push(farm);
                
                if (canAttack && (!bestFarm || parseFloat(pending) > parseFloat(bestFarm.pendingRewards))) {
                    bestFarm = farm;
                }
            }
            
            let attackerPower = myBattlePower;
            if (userAddress) {
                const attackerIdx = farmAddresses.length * callsPerFarm;
                if (results[attackerIdx]?.success) {
                    attackerPower = stakingInterface.decodeFunctionResult("calculateBattlePower", results[attackerIdx].returnData)[0].toNumber();
                    setMyBattlePower(attackerPower);
                }
            }
            
            const selectedFarm = bestFarm || updatedFarms.find(f => f.plants > 0) || updatedFarms[0];
            const targetPower = selectedFarm?.battlePower || 0;
            const winChance = attackerPower > 0 && targetPower > 0 
                ? Math.min(95, Math.max(5, Math.round((attackerPower / (attackerPower + targetPower)) * 100))) 
                : 50;
            
            setSelectedTarget({
                address: selectedFarm?.address || jeet.address,
                pendingRewards: selectedFarm?.pendingRewards || "0",
                plants: selectedFarm?.plants || 0,
                avgHealth: selectedFarm?.avgHealth || 0,
                battlePower: targetPower,
                hasShield: selectedFarm?.hasShield || false,
                attackerPower,
                winChance,
                needsFlagging: jeet.needsFlagging,
                farms: updatedFarms
            });
            
        } catch (e: any) {
            console.error("[DEA] Failed to load target:", e);
            setStatus("Failed to load target stats");
        }
        setLoadingTarget(false);
    };

    const selectFarm = (farm: FarmInfo) => {
        if (!selectedTarget) return;
        
        const attackerPower = selectedTarget.attackerPower || myBattlePower;
        const targetPower = farm.battlePower || 0;
        const winChance = attackerPower > 0 && targetPower > 0 
            ? Math.min(95, Math.max(5, Math.round((attackerPower / (attackerPower + targetPower)) * 100))) 
            : 50;
        
        setSelectedTarget({
            ...selectedTarget,
            address: farm.address,
            pendingRewards: farm.pendingRewards,
            plants: farm.plants,
            avgHealth: farm.avgHealth,
            battlePower: targetPower,
            hasShield: farm.hasShield,
            winChance
        });
        setShowFarmDropdown(false);
    };

    const handleRaid = async () => {
        if (!selectedTarget || !userAddress || !readProvider) return;
        if (selectedTarget.hasShield) { setStatus("Target has shield!"); return; }
        if (selectedTarget.plants === 0) { setStatus("Target has no plants!"); return; }
        
        if (selectedTarget.needsFlagging) {
            setStatus("⏳ Target pending verification - try again in a few minutes");
            return;
        }
        
        setRaiding(true);
        setRaidResult(null);
        
        try {
            setStatus("Checking allowance...");
            const hasAllowance = await ensureAllowance(V5_BATTLES_ADDRESS, raidFeeRaw);
            if (!hasAllowance) { setStatus("Approval failed"); setRaiding(false); return; }
            
            setStatus("Executing raid...");
            const data = battlesInterface.encodeFunctionData("deaRaid", [selectedTarget.address]);
            const tx = await sendContractTx(V5_BATTLES_ADDRESS, data, "0x4C4B40");
            
            if (!tx) { setStatus("Transaction rejected"); setRaiding(false); return; }
            
            setStatus("Confirming...");
            const receipt = await tx.wait();
            
            let resultFound = false;
            if (receipt?.logs) {
                for (const log of receipt.logs) {
                    try {
                        const parsed = battlesInterface.parseLog(log);
                        if (parsed.name === "DeaRaidResult") {
                            setRaidResult({ 
                                won: parsed.args.attackerWon, 
                                amount: formatLargeNumber(parsed.args.stolenAmount), 
                                damage: parsed.args.damagePct.toNumber() 
                            });
                            resultFound = true;
                            break;
                        }
                    } catch {}
                }
            }
            
            setShowAttackModal(false);
            if (resultFound) setShowResultModal(true);
            refreshData();
            setTimeout(() => fetchDEAData(), 2000);
        } catch (e: any) {
            setStatus(e?.reason || e?.message || "Raid failed");
        }
        setRaiding(false);
    };

    const closeAttackModal = () => { 
        setShowAttackModal(false); 
        setSelectedTarget(null); 
        setSelectedJeet(null); 
        setStatus(""); 
        setShowFarmDropdown(false);
    };
    
    const closeResultModal = () => { 
        setShowResultModal(false); 
        setRaidResult(null); 
    };

    useEffect(() => { fetchDEAData(); }, [fetchDEAData]);
    useEffect(() => { 
        const interval = setInterval(() => fetchDEAData(), 30000); 
        return () => clearInterval(interval); 
    }, [fetchDEAData]);

    const cardBg = theme === "light" ? "#fff" : "linear-gradient(180deg, rgba(15,23,42,0.95), rgba(5,8,20,0.98))";
    const cellBg = theme === "light" ? "#f8fafc" : "rgba(15,23,42,0.5)";
    const textMain = theme === "light" ? "#1e293b" : "#f1f5f9";
    const textMuted = theme === "light" ? "#64748b" : "#94a3b8";
    const modalBg = theme === "light" ? "#fff" : "rgba(15,23,42,0.98)";
    const borderColor = theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.1)";

   
    const selectedFarm = selectedTarget?.farms.find(f => f.address === selectedTarget.address);

    return (
        <>
            <div style={{ background: cardBg, borderRadius: 12, padding: 16, border: `1px solid ${borderColor}`, marginTop: 16 }}>
                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 20 }}>🚔</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#dc2626" }}>DEA WATCHLIST</span>
                        {!deaEnabled && <span style={{ fontSize: 9, background: "#374151", color: "#fbbf24", padding: "2px 6px", borderRadius: 4 }}>PAUSED</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#fbbf24", marginBottom: 8 }}>Suspects: <b>{activeJeets.length}</b></div>
                    
                    {/* Stats Box */}
                    <div style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 8, padding: 10 }}>
                        {/* Total Raids */}
                        <div style={{ textAlign: "center", marginBottom: connected && playerDeaStats ? 8 : 0 }}>
                            <div style={{ fontSize: 9, color: textMuted }}>TOTAL DEA RAIDS</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: "#ef4444" }}>{totalRaids}</div>
                        </div>
                        
                        {/* Player Stats */}
                        {connected && playerDeaStats && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, borderTop: "1px solid rgba(220,38,38,0.2)", paddingTop: 8 }}>
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 8, color: textMuted }}>WINS</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>{playerDeaStats.wins}</div>
                                </div>
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 8, color: textMuted }}>LOSSES</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: "#ef4444" }}>{playerDeaStats.losses}</div>
                                </div>
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 8, color: textMuted }}>SEIZED</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>{playerDeaStats.stolen}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                
                {cooldownRemaining > 0 && (
                    <div style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, padding: 8, marginBottom: 12, textAlign: "center" }}>
                        <span style={{ fontSize: 11, color: "#fbbf24" }}>⏳ Your Cooldown: <b>{formatCooldown(cooldownRemaining)}</b></span>
                    </div>
                )}

                {/* Table */}
                {paginatedJeets.length > 0 ? (
                    <>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                <thead>
                                    <tr style={{ borderBottom: `1px solid ${borderColor}` }}>
                                        <th style={{ padding: "8px 4px", textAlign: "left", color: textMuted, fontWeight: 600 }}>Address</th>
                                        <th style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontWeight: 600 }}>🏠</th>
                                        <th style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontWeight: 600 }}>🌱</th>
                                        <th style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontWeight: 600 }}>❤️</th>
                                        <th style={{ padding: "8px 4px", textAlign: "right", color: textMuted, fontWeight: 600 }}>24h Sold</th>
                                        <th style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontWeight: 600 }}>Status</th>
                                        <th style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontWeight: 600 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedJeets.map((jeet) => (
                                        <tr key={jeet.address} style={{ borderBottom: `1px solid ${theme === "light" ? "#f1f5f9" : "rgba(255,255,255,0.05)"}` }}>
                                            <td style={{ padding: "8px 4px", fontFamily: "monospace", fontSize: 10, color: textMain }}>
                                                {jeet.address.slice(0, 4)}..{jeet.address.slice(-4)}
                                            </td>
                                            <td style={{ padding: "8px 4px", textAlign: "center", color: jeet.isCluster ? "#fbbf24" : textMuted, fontWeight: 600 }}>
                                                {jeet.isCluster ? `🔗${jeet.farms.length}` : "1"}
                                            </td>
                                            <td style={{ padding: "8px 4px", textAlign: "center", color: "#10b981", fontWeight: 600 }}>{jeet.totalPlants}</td>
                                            <td style={{ padding: "8px 4px", textAlign: "center", color: getHealthColor(jeet.avgHealth), fontWeight: 600 }}>{jeet.avgHealth}%</td>
                                            <td style={{ padding: "8px 4px", textAlign: "right", color: "#ef4444", fontWeight: 600 }}>{formatLargeNumber(jeet.totalSold)}</td>
                                            <td style={{ padding: "8px 4px", textAlign: "center" }}>
                                                <span style={{ fontSize: 8, background: jeet.source === "backend" ? "rgba(251,191,36,0.2)" : "rgba(16,185,129,0.2)", color: jeet.source === "backend" ? "#fbbf24" : "#10b981", padding: "2px 6px", borderRadius: 4 }}>
                                                    {jeet.source === "backend" ? "TRACKED" : "ON-CHAIN"}
                                                </span>
                                            </td>
                                            <td style={{ padding: "8px 4px", textAlign: "center" }}>
                                                {jeet.hasShield ? (
                                                    <span style={{ fontSize: 12, color: "#3b82f6" }}>🛡️</span>
                                                ) : (
                                                    <button 
                                                        onClick={() => handleSelectTarget(jeet)} 
                                                        disabled={!connected || !deaEnabled}
                                                        style={{
                                                            padding: "4px 10px", 
                                                            fontSize: 10, 
                                                            borderRadius: 4, 
                                                            border: "none", 
                                                            background: deaEnabled ? "linear-gradient(135deg, #dc2626, #ef4444)" : "#374151", 
                                                            color: "#fff", 
                                                            cursor: deaEnabled && connected ? "pointer" : "not-allowed", 
                                                            fontWeight: 600,
                                                            opacity: cooldownRemaining > 0 ? 0.7 : 1
                                                        }}
                                                    >
                                                        🚔
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        {totalPages > 1 && (
                            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 12 }}>
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ padding: "6px 12px", fontSize: 11, borderRadius: 6, border: `1px solid ${borderColor}`, background: cellBg, color: textMain, cursor: currentPage === 1 ? "not-allowed" : "pointer", opacity: currentPage === 1 ? 0.5 : 1 }}>←</button>
                                <span style={{ fontSize: 11, color: textMuted }}>{currentPage}/{totalPages}</span>
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ padding: "6px 12px", fontSize: 11, borderRadius: 6, border: `1px solid ${borderColor}`, background: cellBg, color: textMain, cursor: currentPage === totalPages ? "not-allowed" : "pointer", opacity: currentPage === totalPages ? 0.5 : 1 }}>→</button>
                            </div>
                        )}
                    </>
                ) : (
                    <div style={{ textAlign: "center", padding: 20, color: textMuted }}>
                        {loading ? "Loading..." : "No suspects"}
                    </div>
                )}
            </div>

            {/* Attack Modal - Redesigned */}
            {showAttackModal && selectedJeet && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
                    <div style={{ background: modalBg, borderRadius: 16, padding: 20, maxWidth: 380, width: "100%", border: "2px solid rgba(220,38,38,0.4)", boxShadow: "0 0 60px rgba(220,38,38,0.2)" }}>
                        
                        {/* Header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 28 }}>🚔</span>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: "#dc2626" }}>DEA RAID</div>
                                    <div style={{ fontSize: 10, color: textMuted, fontFamily: "monospace" }}>
                                        {selectedJeet.address.slice(0, 6)}...{selectedJeet.address.slice(-4)}
                                    </div>
                                </div>
                            </div>
                            <button onClick={closeAttackModal} style={{ background: "none", border: "none", color: textMuted, fontSize: 20, cursor: "pointer" }}>✕</button>
                        </div>

                        {/* Farm Dropdown Selector */}
                        {selectedTarget && selectedTarget.farms.length > 0 && (
                            <div style={{ marginBottom: 16, position: "relative" }}>
                                <div style={{ fontSize: 10, color: textMuted, marginBottom: 6 }}>
                                    SELECT TARGET FARM {selectedTarget.farms.length > 1 && `(${selectedTarget.farms.filter(f => f.canAttack).length}/${selectedTarget.farms.length} available)`}
                                </div>
                                
                                {/* Dropdown Button */}
                                <button
                                    onClick={() => setShowFarmDropdown(!showFarmDropdown)}
                                    style={{
                                        width: "100%",
                                        padding: "12px",
                                        borderRadius: 8,
                                        border: "1px solid rgba(16,185,129,0.4)",
                                        background: "rgba(16,185,129,0.1)",
                                        cursor: "pointer",
                                        textAlign: "left",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center"
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <span style={{ fontFamily: "monospace", fontSize: 11, color: textMain }}>
                                            ...{selectedTarget.address.slice(-4)}
                                        </span>
                                        <span style={{ color: "#22c55e", fontSize: 11 }}>🌱 {selectedFarm?.plants || 0}</span>
                                        <span style={{ color: getHealthColor(selectedFarm?.avgHealth || 0), fontSize: 11 }}>❤️ {selectedFarm?.avgHealth || 0}%</span>
                                        <span style={{ color: "#10b981", fontSize: 11 }}>{selectedFarm?.pendingRewards || "0"}</span>
                                    </div>
                                    <span style={{ color: textMuted }}>{showFarmDropdown ? "▲" : "▼"}</span>
                                </button>

                                {/* Dropdown List */}
                                {showFarmDropdown && (
                                    <div style={{
                                        position: "absolute",
                                        top: "100%",
                                        left: 0,
                                        right: 0,
                                        background: modalBg,
                                        border: "1px solid rgba(107,114,128,0.3)",
                                        borderRadius: 8,
                                        marginTop: 4,
                                        maxHeight: 200,
                                        overflowY: "auto",
                                        zIndex: 10,
                                        boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
                                    }}>
                                        {selectedTarget.farms
                                            .filter(f => f.plants > 0)
                                            .map((farm) => {
                                                const isSelected = selectedTarget.address === farm.address;
                                               
                                                const myPersonalCooldownLeft = farm.myAttackCooldownEnds > now ? farm.myAttackCooldownEnds - now : 0;
                                                const targetImmunityLeft = farm.targetImmunityEnds > now ? farm.targetImmunityEnds - now : 0;
                                                const hasAnyCooldown = myPersonalCooldownLeft > 0 || targetImmunityLeft > 0;
                                                
                                               
                                                let cooldownDisplay = null;
                                                if (myPersonalCooldownLeft > 0) {
                                                   
                                                    cooldownDisplay = <span style={{ fontSize: 9, color: "#ef4444", fontWeight: 600 }}>⏳ {formatCooldown(myPersonalCooldownLeft)}</span>;
                                                } else if (targetImmunityLeft > 0) {
                                                   
                                                    cooldownDisplay = <span style={{ fontSize: 9, color: "#fbbf24" }}>⏳ {formatCooldown(targetImmunityLeft)}</span>;
                                                }
                                                
                                                return (
                                                    <button
                                                        key={farm.address}
                                                        onClick={() => farm.canAttack && selectFarm(farm)}
                                                        style={{
                                                            width: "100%",
                                                            padding: "10px 12px",
                                                            border: "none",
                                                            borderBottom: "1px solid rgba(107,114,128,0.2)",
                                                            background: isSelected ? "rgba(16,185,129,0.15)" : hasAnyCooldown ? "rgba(251,191,36,0.05)" : "transparent",
                                                            cursor: farm.canAttack ? "pointer" : "not-allowed",
                                                            opacity: farm.canAttack ? 1 : 0.6,
                                                            textAlign: "left",
                                                            display: "flex",
                                                            justifyContent: "space-between",
                                                            alignItems: "center"
                                                        }}
                                                    >
                                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                            <span style={{ fontFamily: "monospace", fontSize: 10, color: textMain }}>
                                                                ...{farm.address.slice(-4)}
                                                            </span>
                                                            <span style={{ color: "#22c55e", fontSize: 10 }}>🌱{farm.plants}</span>
                                                            <span style={{ color: getHealthColor(farm.avgHealth), fontSize: 10 }}>❤️{farm.avgHealth}%</span>
                                                            <span style={{ color: "#10b981", fontSize: 10 }}>{farm.pendingRewards}</span>
                                                        </div>
                                                        {farm.hasShield ? (
                                                            <span style={{ fontSize: 10, color: "#3b82f6" }}>🛡️</span>
                                                        ) : cooldownDisplay ? (
                                                            cooldownDisplay
                                                        ) : isSelected ? (
                                                            <span style={{ fontSize: 10, color: "#10b981" }}>✓</span>
                                                        ) : null}
                                                    </button>
                                                );
                                            })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Loading */}
                        {loadingTarget && (
                            <div style={{ textAlign: "center", padding: 30, color: textMuted }}>
                                Loading...
                            </div>
                        )}

                        {/* Target Stats */}
                        {!loadingTarget && selectedTarget && (
                            <>
                                {/* Shield Warning */}
                                {selectedTarget.hasShield && (
                                    <div style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.4)", borderRadius: 10, padding: 16, marginBottom: 16, textAlign: "center" }}>
                                        <div style={{ fontSize: 28, marginBottom: 4 }}>🛡️</div>
                                        <div style={{ fontSize: 12, color: "#3b82f6", fontWeight: 600 }}>Target Protected</div>
                                    </div>
                                )}

                                {/* Needs Flagging */}
                                {selectedTarget.needsFlagging && !selectedTarget.hasShield && (
                                    <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 6, padding: 6, marginBottom: 12, textAlign: "center" }}>
                                        <span style={{ color: "#fbbf24", fontSize: 9 }}>📡 Will be flagged on-chain when you raid</span>
                                    </div>
                                )}

                                {/* Stats Grid */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                                    <div style={{ background: "rgba(239,68,68,0.1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
                                        <div style={{ fontSize: 9, color: textMuted, marginBottom: 4 }}>THEIR POWER</div>
                                        <div style={{ fontSize: 22, fontWeight: 700, color: "#ef4444" }}>{selectedTarget.battlePower}</div>
                                    </div>
                                    <div style={{ background: "rgba(16,185,129,0.1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
                                        <div style={{ fontSize: 9, color: textMuted, marginBottom: 4 }}>PENDING LOOT</div>
                                        <div style={{ fontSize: 22, fontWeight: 700, color: "#10b981" }}>{selectedTarget.pendingRewards}</div>
                                    </div>
                                </div>

                                {/* Battle Analysis */}
                                <div style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                                    <div style={{ fontSize: 10, color: "#60a5fa", marginBottom: 10, fontWeight: 600, textAlign: "center" }}>⚔️ BATTLE ANALYSIS</div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                                        <div style={{ textAlign: "center" }}>
                                            <div style={{ fontSize: 8, color: textMuted }}>YOUR POWER</div>
                                            <div style={{ fontSize: 18, fontWeight: 700, color: "#10b981" }}>{selectedTarget.attackerPower || myBattlePower}</div>
                                        </div>
                                        <div style={{ textAlign: "center" }}>
                                            <div style={{ fontSize: 8, color: textMuted }}>VS</div>
                                            <div style={{ fontSize: 18, fontWeight: 700, color: "#ef4444" }}>{selectedTarget.battlePower}</div>
                                        </div>
                                        <div style={{ textAlign: "center" }}>
                                            <div style={{ fontSize: 8, color: textMuted }}>WIN CHANCE</div>
                                            <div style={{ fontSize: 18, fontWeight: 700, color: selectedTarget.winChance >= 50 ? "#10b981" : "#ef4444" }}>{selectedTarget.winChance}%</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Raid Fee */}
                                <div style={{ background: "rgba(251,191,36,0.1)", borderRadius: 8, padding: 8, marginBottom: 16, textAlign: "center" }}>
                                    <span style={{ fontSize: 10, color: "#fbbf24" }}>Raid Fee: <b>{raidFee}</b> • Refunded on win</span>
                                </div>

                                {/* Action Buttons */}
                                <div style={{ display: "flex", gap: 10 }}>
                                    <button 
                                        onClick={closeAttackModal} 
                                        disabled={raiding } 
                                        style={{ flex: 1, padding: "12px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: `1px solid ${borderColor}`, background: "transparent", color: textMuted, cursor: "pointer" }}
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={handleRaid} 
                                        disabled={raiding || selectedTarget.hasShield || selectedTarget.plants === 0 || cooldownRemaining > 0} 
                                        style={{ 
                                            flex: 2, 
                                            padding: "12px", 
                                            fontSize: 13, 
                                            fontWeight: 700, 
                                            borderRadius: 8, 
                                            border: "none", 
                                            background: (raiding || selectedTarget.hasShield || cooldownRemaining > 0) ? "#374151" : "linear-gradient(135deg, #dc2626, #ef4444)", 
                                            color: "#fff", 
                                            cursor: (raiding || selectedTarget.hasShield || cooldownRemaining > 0) ? "not-allowed" : "pointer" 
                                        }}
                                    >
                                        {raiding ? "Raiding..." : selectedTarget.hasShield ? "🛡️ Shielded" : cooldownRemaining > 0 ? `⏳ ${formatCooldown(cooldownRemaining)}` : "🚔 RAID"}
                                    </button>
                                </div>

                                {status && <div style={{ fontSize: 10, color: "#fbbf24", marginTop: 10, textAlign: "center" }}>{status}</div>}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Result Modal */}
            {showResultModal && raidResult && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
                    <div style={{ background: modalBg, borderRadius: 16, padding: 24, maxWidth: 340, width: "100%", border: `2px solid ${raidResult.won ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)"}`, textAlign: "center" }}>
                        <div style={{ fontSize: 56, marginBottom: 12 }}>{raidResult.won ? "🎉" : "💀"}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: raidResult.won ? "#10b981" : "#ef4444", marginBottom: 16 }}>
                            {raidResult.won ? "SUCCESS!" : "FAILED!"}
                        </div>
                        <div style={{ background: raidResult.won ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                            {raidResult.won ? (
                                <>
                                    <div style={{ fontSize: 11, color: textMuted }}>Seized</div>
                                    <div style={{ fontSize: 28, fontWeight: 700, color: "#10b981" }}>{raidResult.amount}</div>
                                </>
                            ) : (
                                <>
                                    <div style={{ fontSize: 11, color: textMuted }}>Fee Lost</div>
                                    <div style={{ fontSize: 20, fontWeight: 600, color: "#ef4444" }}>{raidFee}</div>
                                </>
                            )}
                            <div style={{ fontSize: 10, color: textMuted, marginTop: 8 }}>Damage: {raidResult.damage}%</div>
                        </div>
                        <button onClick={closeResultModal} style={{ width: "100%", padding: "12px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", cursor: "pointer" }}>
                            Continue
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
