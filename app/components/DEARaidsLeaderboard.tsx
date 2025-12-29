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
    "function getSuspectCount() view returns (uint256)",
    "function canBeRaided(address) view returns (bool)",
    "function getDeaAttackerStats(address) view returns (uint256 raidsWon, uint256 raidsLost, uint256 rewardsStolen, uint256 rewardsLostAttacking, uint256 cooldownRemaining, bool canAttack)",
    "function getGlobalStats() view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
    "function deaTargetImmunity() view returns (uint256)",
    "function getDeaRaidStats() view returns (uint256 totalRaids, uint256 totalStolen)",
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
    // Cooldowns
    targetImmunityEnds: number; // 2h cooldown for everyone
    myAttackCooldownEnds: number; // 6h cooldown just for me
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
    // For single-wallet cooldown display
    targetImmunityEnds: number;
    myAttackCooldownEnds: number;
    hasRaidableFarm: boolean; // At least one farm can be raided
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
const TARGET_IMMUNITY = 2 * 60 * 60; // 2 hours - everyone waits
const PER_TARGET_COOLDOWN = 6 * 60 * 60; // 6 hours - just for attacker

export function DEARaidsLeaderboard({ connected, userAddress, theme, readProvider, sendContractTx, ensureAllowance, refreshData }: Props) {
    const [jeets, setJeets] = useState<JeetEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalRaids, setTotalRaids] = useState(0);
    const [totalSeized, setTotalSeized] = useState("0");
    const [raidFee, setRaidFee] = useState("100K");
    const [raidFeeRaw, setRaidFeeRaw] = useState<ethers.BigNumber>(ethers.utils.parseUnits("100000", 18));
    const [deaEnabled, setDeaEnabled] = useState(true);
    
    const [showAttackModal, setShowAttackModal] = useState(false);
    const [showResultModal, setShowResultModal] = useState(false);
    const [selectedTarget, setSelectedTarget] = useState<TargetInfo | null>(null);
    const [selectedJeet, setSelectedJeet] = useState<JeetEntry | null>(null);
    
    const [raiding, setRaiding] = useState(false);
    const [flagging, setFlagging] = useState(false);
    const [loadingTarget, setLoadingTarget] = useState(false);
    const [status, setStatus] = useState("");
    const [raidResult, setRaidResult] = useState<{ won: boolean; amount: string; damage: number } | null>(null);
    const [cooldownRemaining, setCooldownRemaining] = useState(0);
    const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
    const [myBattlePower, setMyBattlePower] = useState(0);
    
    const fetchingRef = useRef(false);

    // Live timer update every second
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(Math.floor(Date.now() / 1000));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const now = currentTime;
    const activeJeets = jeets.filter(j => j.expiresAt > now && j.totalPlants > 0); // Filter out 0-plant entries
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
        const seconds = remaining % 60;
        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
    };

    const formatCooldown = (seconds: number): string => {
        if (seconds <= 0) return "";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    };

    // Get health color based on percentage
    const getHealthColor = (health: number): string => {
        if (health >= 70) return "#22c55e"; // green
        if (health >= 40) return "#fbbf24"; // yellow
        if (health >= 20) return "#f97316"; // orange
        return "#ef4444"; // red
    };

    // Fetch all DEA data
    const fetchDEAData = useCallback(async () => {
        if (fetchingRef.current || !readProvider) return;
        fetchingRef.current = true;
        setLoading(true);
        
        try {
            const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, BATTLES_ABI, readProvider);
            const stakingContract = new ethers.Contract(V5_STAKING_ADDRESS, STAKING_ABI, readProvider);
            const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
            
            // Get global stats and config
            try {
                const [enabled, fee, globalStats] = await Promise.all([
                    battlesContract.deaRaidsEnabled(),
                    battlesContract.deaRaidFee(),
                    battlesContract.getGlobalStats()
                ]);
                setDeaEnabled(enabled);
                setRaidFeeRaw(fee);
                setRaidFee(formatLargeNumber(fee));
                // globalStats[1] = totalDeaRaids, globalStats[4] = totalRewardsRedistributed (shared)
                // We need DEA-specific stats - for now use globalStats[1] for raids
                setTotalRaids(globalStats[1].toNumber());
                // TODO: Need DEA-specific seized amount from contract
                // For now, calculate from events or use a placeholder
                setTotalSeized(formatLargeNumber(globalStats[4])); // This is shared - needs contract update
            } catch (e) {
                console.error("[DEA] Error getting global stats:", e);
            }
            
            // Get user stats
            if (userAddress) {
                try {
                    const [attackerStats, power] = await Promise.all([
                        battlesContract.getDeaAttackerStats(userAddress),
                        stakingContract.calculateBattlePower(userAddress)
                    ]);
                    setCooldownRemaining(attackerStats.cooldownRemaining.toNumber());
                    setMyBattlePower(power.toNumber());
                } catch (e) {
                    console.error("[DEA] Error getting user stats:", e);
                }
            }
            
            // Get backend jeets data (includes clusters and farms)
            let backendData: any[] = [];
            try {
                const res = await fetch(`${WARS_BACKEND_URL}/api/dea/leaderboard?limit=200`);
                const data = await res.json();
                if (data.success && Array.isArray(data.jeets)) {
                    backendData = data.jeets;
                }
            } catch (e) {
                console.error("[DEA] Backend fetch error:", e);
            }
            
            // Process jeets and fetch on-chain stats for each
            const processedJeets: JeetEntry[] = [];
            
            for (const j of backendData) {
                const lastSell = j.lastSellTime || j.lastSellTimestamp || 0;
                const expiresAt = j.expiresAt || (lastSell > 0 ? lastSell + SUSPECT_EXPIRY : 0);
                
                if (expiresAt <= now) continue; // Skip expired
                
                // Get farms data
                let farms: FarmInfo[] = [];
                let totalPlants = 0;
                let avgHealthSum = 0;
                let hasRaidableFarm = false;
                
                // If backend provides farms, use them
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
                        if (f.plants > 0 && !f.hasShield && f.canAttack) {
                            hasRaidableFarm = true;
                        }
                    }
                } else {
                    // Single wallet - create single farm entry
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
                    hasRaidableFarm = farms[0].plants > 0 && !farms[0].hasShield;
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
                    hasRaidableFarm
                });
            }
            
            // Sort by total sold descending
            processedJeets.sort((a, b) => {
                const aVal = parseFloat(a.totalSold) || 0;
                const bVal = parseFloat(b.totalSold) || 0;
                return bVal - aVal;
            });
            
            setJeets(processedJeets);
        } catch (e) {
            console.error("[DEA] Fetch error:", e);
        }
        
        setLoading(false);
        fetchingRef.current = false;
    }, [readProvider, userAddress, now]);

    // Load detailed target stats when opening modal
    const handleSelectTarget = async (jeet: JeetEntry) => {
        if (!readProvider) return;
        
        setSelectedJeet(jeet);
        setLoadingTarget(true);
        setStatus("");
        setShowAttackModal(true);
        setSelectedTarget(null);
        
        try {
            const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
            
            // Build calls for all farms
            const farmAddresses = jeet.farms.map(f => f.address);
            const calls: any[] = [];
            
            farmAddresses.forEach(addr => {
                calls.push(
                    { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("pending", [addr]) },
                    { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("getUserBattleStats", [addr]) },
                    { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("calculateBattlePower", [addr]) },
                    { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("hasRaidShield", [addr]) },
                    { target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("canBeRaided", [addr]) }
                );
            });
            
            // Also get attacker power
            if (userAddress) {
                calls.push({ target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("calculateBattlePower", [userAddress]) });
            }
            
            const results = await mc.tryAggregate(false, calls);
            
            // Parse results for each farm
            const updatedFarms: FarmInfo[] = [];
            let bestFarm: FarmInfo | null = null;
            
            for (let i = 0; i < farmAddresses.length; i++) {
                const baseIdx = i * 5;
                const addr = farmAddresses[i];
                
                let pending = "0", plants = 0, avgHealth = 0, power = 0, hasShield = false, canBeRaided = false;
                
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
                
                // A farm can be attacked if: has plants, no shield, health > 0, and canBeRaided (not on immunity)
                const canAttack = plants > 0 && !hasShield && avgHealth > 0 && canBeRaided;
                
                const farm: FarmInfo = {
                    address: addr,
                    plants,
                    avgHealth,
                    pendingRewards: pending,
                    hasShield,
                    canAttack,
                    battlePower: power || Math.floor(plants * 3 * avgHealth / 100),
                    targetImmunityEnds: canBeRaided ? 0 : now + TARGET_IMMUNITY, // Estimate
                    myAttackCooldownEnds: 0 // Would need per-attacker-target tracking
                };
                
                updatedFarms.push(farm);
                
                // Track best farm (most loot that can be attacked)
                if (canAttack && (!bestFarm || parseFloat(pending) > parseFloat(bestFarm.pendingRewards))) {
                    bestFarm = farm;
                }
            }
            
            // Get attacker power
            let attackerPower = myBattlePower;
            if (userAddress) {
                const attackerIdx = farmAddresses.length * 5;
                if (results[attackerIdx]?.success) {
                    attackerPower = stakingInterface.decodeFunctionResult("calculateBattlePower", results[attackerIdx].returnData)[0].toNumber();
                    setMyBattlePower(attackerPower);
                }
            }
            
            // Select best farm or first one
            const selectedFarm = bestFarm || updatedFarms[0];
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

    // Select a specific farm from the modal
    const selectFarm = (farm: FarmInfo) => {
        if (!selectedTarget) return;
        
        const targetPower = farm.battlePower || 0;
        const attackerPower = selectedTarget.attackerPower || myBattlePower;
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
    };

    // Request backend to flag the suspect
    const requestBackendFlag = async (): Promise<boolean> => {
        if (!selectedTarget || !selectedJeet) return false;
        
        setFlagging(true);
        setStatus("Requesting flag from backend...");
        
        try {
            const response = await fetch(`${WARS_BACKEND_URL}/api/dea/request-flag`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetAddress: selectedJeet.address })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                setStatus(`❌ ${data.error || "Failed to flag"}`);
                setFlagging(false);
                return false;
            }
            
            if (data.success) {
                setStatus(data.alreadyFlagged ? "✓ Already flagged!" : "✓ Flagged!");
                setFlagging(false);
                return true;
            }
            
            setStatus(`❌ ${data.error || "Flag failed"}`);
            setFlagging(false);
            return false;
        } catch (e: any) {
            setStatus("❌ Network error");
            setFlagging(false);
            return false;
        }
    };

    // Execute raid
    const handleRaid = async () => {
        if (!selectedTarget || !userAddress || !readProvider) return;
        if (selectedTarget.hasShield) { setStatus("Target has shield!"); return; }
        if (selectedTarget.plants === 0) { setStatus("Target has no plants!"); return; }
        
        setRaiding(true);
        setRaidResult(null);
        
        try {
            // Flag if needed
            if (selectedTarget.needsFlagging) {
                const flagged = await requestBackendFlag();
                if (!flagged) {
                    setRaiding(false);
                    return;
                }
                await new Promise(r => setTimeout(r, 2000));
            }
            
            // Check allowance
            setStatus("Checking allowance...");
            const hasAllowance = await ensureAllowance(V5_BATTLES_ADDRESS, raidFeeRaw);
            if (!hasAllowance) {
                setStatus("Approval failed");
                setRaiding(false);
                return;
            }
            
            // Execute raid
            setStatus("Executing raid...");
            const data = battlesInterface.encodeFunctionData("deaRaid", [selectedTarget.address]);
            const tx = await sendContractTx(V5_BATTLES_ADDRESS, data, "0x4C4B40");
            
            if (!tx) {
                setStatus("Transaction rejected");
                setRaiding(false);
                return;
            }
            
            setStatus("Waiting for confirmation...");
            const receipt = await tx.wait();
            
            // Parse result
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
            console.error("[DEA] Raid failed:", e);
            setStatus(e?.reason || e?.message || "Raid failed");
        }
        setRaiding(false);
    };

    const closeAttackModal = () => { 
        setShowAttackModal(false); 
        setSelectedTarget(null); 
        setSelectedJeet(null); 
        setStatus(""); 
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

    // Theme colors
    const cardBg = theme === "light" ? "#fff" : "linear-gradient(180deg, rgba(15,23,42,0.95), rgba(5,8,20,0.98))";
    const cellBg = theme === "light" ? "#f8fafc" : "rgba(15,23,42,0.5)";
    const textMain = theme === "light" ? "#1e293b" : "#f1f5f9";
    const textMuted = theme === "light" ? "#64748b" : "#94a3b8";
    const modalBg = theme === "light" ? "#fff" : "rgba(15,23,42,0.98)";
    const borderColor = theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.1)";

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
                    
                    {/* Stats Box - INSIDE the watchlist */}
                    <div style={{ 
                        background: "rgba(220,38,38,0.1)", 
                        border: "1px solid rgba(220,38,38,0.3)", 
                        borderRadius: 8, 
                        padding: 10,
                        marginBottom: 12
                    }}>
                        <div style={{ display: "flex", justifyContent: "center", gap: 20, fontSize: 11 }}>
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: textMuted }}>TOTAL RAIDS</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: "#ef4444" }}>{totalRaids}</div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: textMuted }}>TOTAL SEIZED</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: "#10b981" }}>{totalSeized}</div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: textMuted }}>YOUR POWER</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: "#a78bfa" }}>{myBattlePower}</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* General Cooldown Warning */}
                {cooldownRemaining > 0 && (
                    <div style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, padding: 8, marginBottom: 12, textAlign: "center" }}>
                        <span style={{ fontSize: 11, color: "#fbbf24" }}>⏳ Your Cooldown: <b>{formatCooldown(cooldownRemaining)}</b></span>
                    </div>
                )}

                {/* Jeets Table */}
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
                                        <th style={{ padding: "8px 4px", textAlign: "right", color: textMuted, fontWeight: 600 }}>Sold</th>
                                        <th style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontWeight: 600 }}>⏱️</th>
                                        <th style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontWeight: 600 }}>Status</th>
                                        <th style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontWeight: 600 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedJeets.map((jeet, idx) => {
                                        const health = jeet.avgHealth;
                                        
                                        return (
                                            <tr key={jeet.address} style={{ borderBottom: `1px solid ${theme === "light" ? "#f1f5f9" : "rgba(255,255,255,0.05)"}` }}>
                                                <td style={{ padding: "8px 4px", fontFamily: "monospace", fontSize: 10, color: textMain }}>
                                                    {jeet.address.slice(0, 4)}..{jeet.address.slice(-4)}
                                                </td>
                                                <td style={{ padding: "8px 4px", textAlign: "center", color: jeet.isCluster ? "#fbbf24" : textMuted, fontWeight: 600 }}>
                                                    {jeet.isCluster ? `🔗${jeet.farms.length}` : "1"}
                                                </td>
                                                <td style={{ padding: "8px 4px", textAlign: "center", color: "#10b981", fontWeight: 600 }}>
                                                    {jeet.totalPlants}
                                                </td>
                                                <td style={{ padding: "8px 4px", textAlign: "center", color: getHealthColor(health), fontWeight: 600 }}>
                                                    {health}%
                                                </td>
                                                <td style={{ padding: "8px 4px", textAlign: "right", color: "#ef4444", fontWeight: 600 }}>
                                                    {formatLargeNumber(jeet.totalSold)}
                                                </td>
                                                <td style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontSize: 9 }}>
                                                    {formatTimeRemaining(jeet.expiresAt)}
                                                </td>
                                                <td style={{ padding: "8px 4px", textAlign: "center" }}>
                                                    {jeet.source === "onchain" || jeet.source === "both" ? (
                                                        <span style={{ fontSize: 8, background: "rgba(16,185,129,0.2)", color: "#10b981", padding: "2px 6px", borderRadius: 4 }}>ON-CHAIN</span>
                                                    ) : (
                                                        <span style={{ fontSize: 8, background: "rgba(251,191,36,0.2)", color: "#fbbf24", padding: "2px 6px", borderRadius: 4 }}>TRACKED</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: "8px 4px", textAlign: "center" }}>
                                                    {/* ALWAYS show attack button to allow browsing farms */}
                                                    {jeet.hasShield ? (
                                                        <span style={{ fontSize: 12, color: "#3b82f6" }} title="All farms shielded">🛡️</span>
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
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        
                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 12 }}>
                                <button 
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                                    disabled={currentPage === 1} 
                                    style={{ padding: "6px 12px", fontSize: 11, borderRadius: 6, border: `1px solid ${borderColor}`, background: cellBg, color: textMain, cursor: currentPage === 1 ? "not-allowed" : "pointer", opacity: currentPage === 1 ? 0.5 : 1 }}
                                >
                                    ← Prev
                                </button>
                                <span style={{ fontSize: 11, color: textMuted }}>Page {currentPage} of {totalPages}</span>
                                <button 
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                                    disabled={currentPage === totalPages} 
                                    style={{ padding: "6px 12px", fontSize: 11, borderRadius: 6, border: `1px solid ${borderColor}`, background: cellBg, color: textMain, cursor: currentPage === totalPages ? "not-allowed" : "pointer", opacity: currentPage === totalPages ? 0.5 : 1 }}
                                >
                                    Next →
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <div style={{ textAlign: "center", padding: 20, color: textMuted }}>
                        {loading ? "Loading suspects..." : "No suspects on watchlist"}
                    </div>
                )}
            </div>

            {/* Attack Modal */}
            {showAttackModal && selectedJeet && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
                    <div style={{ background: modalBg, borderRadius: 16, padding: 24, maxWidth: 420, width: "100%", border: "2px solid rgba(220,38,38,0.5)", boxShadow: "0 0 40px rgba(220,38,38,0.3)", maxHeight: "90vh", overflowY: "auto" }}>
                        
                        {/* Header */}
                        <div style={{ textAlign: "center", marginBottom: 16 }}>
                            <div style={{ fontSize: 36, marginBottom: 8 }}>🚔</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: "#dc2626" }}>DEA RAID</div>
                        </div>
                        
                        {/* Suspect Info */}
                        <div style={{ background: "rgba(220,38,38,0.1)", borderRadius: 10, padding: 12, marginBottom: 16 }}>
                            <div style={{ fontSize: 10, color: textMuted, marginBottom: 4 }}>
                                SUSPECT {selectedJeet.isCluster && <span style={{ color: "#fbbf24" }}>({selectedJeet.farms.length} linked farms)</span>}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: textMain, fontFamily: "monospace" }}>
                                {selectedJeet.address.slice(0, 10)}...{selectedJeet.address.slice(-8)}
                            </div>
                            <div style={{ fontSize: 11, color: "#ef4444", marginTop: 6 }}>
                                Sold: <b>{formatLargeNumber(selectedJeet.totalSold)}</b> FCWEED
                            </div>
                        </div>

                        {/* Farm Selector */}
                        {selectedTarget && selectedTarget.farms.length > 0 && (
                            <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 10, padding: 12, marginBottom: 16 }}>
                                <div style={{ fontSize: 11, color: "#10b981", marginBottom: 10, fontWeight: 600 }}>
                                    🎯 {selectedTarget.farms.length > 1 
                                        ? `SELECT FARM (${selectedTarget.farms.filter(f => f.canAttack).length} of ${selectedTarget.farms.length} available)` 
                                        : "TARGET FARM"}
                                </div>
                                
                                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                                    {selectedTarget.farms
                                        .filter(farm => farm.plants > 0) // Don't show 0-plant farms
                                        .map((farm) => {
                                            const isSelected = selectedTarget.address === farm.address;
                                            const onCooldown = !farm.canAttack && !farm.hasShield;
                                            const cooldownLeft = farm.targetImmunityEnds > now ? farm.targetImmunityEnds - now : 0;
                                            
                                            return (
                                                <button
                                                    key={farm.address}
                                                    onClick={() => farm.canAttack && selectFarm(farm)}
                                                    style={{
                                                        padding: "12px",
                                                        borderRadius: 10,
                                                        border: isSelected ? "2px solid #10b981" : "1px solid rgba(107,114,128,0.3)",
                                                        background: isSelected ? "rgba(16,185,129,0.2)" : "rgba(5,8,20,0.5)",
                                                        cursor: farm.canAttack ? "pointer" : "not-allowed",
                                                        opacity: farm.canAttack ? 1 : 0.6,
                                                        textAlign: "left",
                                                        position: "relative",
                                                        overflow: "hidden"
                                                    }}
                                                >
                                                    {/* Cooldown Overlay */}
                                                    {onCooldown && (
                                                        <div style={{ 
                                                            position: "absolute", 
                                                            top: 0, left: 0, right: 0, bottom: 0, 
                                                            background: "rgba(0,0,0,0.7)", 
                                                            borderRadius: 10,
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            flexDirection: "column",
                                                            backdropFilter: "blur(2px)"
                                                        }}>
                                                            <div style={{ fontSize: 10, color: "#fbbf24", fontWeight: 600 }}>⏳ IMMUNITY</div>
                                                            <div style={{ fontSize: 14, color: "#fbbf24", fontWeight: 700 }}>
                                                                {cooldownLeft > 0 ? formatCooldown(cooldownLeft) : "Protected"}
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                                        <div>
                                                            <div style={{ fontSize: 11, fontFamily: "monospace", color: textMain, fontWeight: 600 }}>
                                                                {farm.address.slice(0, 6)}..{farm.address.slice(-4)}
                                                            </div>
                                                            <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                                                                <div>
                                                                    <div style={{ fontSize: 8, color: textMuted }}>PLANTS</div>
                                                                    <div style={{ fontSize: 18, color: "#22c55e", fontWeight: 700 }}>{farm.plants}</div>
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: 8, color: textMuted }}>HEALTH</div>
                                                                    <div style={{ fontSize: 18, color: getHealthColor(farm.avgHealth), fontWeight: 700 }}>{farm.avgHealth}%</div>
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: 8, color: textMuted }}>POWER</div>
                                                                    <div style={{ fontSize: 18, color: "#a78bfa", fontWeight: 700 }}>{farm.battlePower}</div>
                                                                </div>
                                                            </div>
                                                            {farm.hasShield && (
                                                                <div style={{ fontSize: 10, color: "#3b82f6", marginTop: 6, fontWeight: 600 }}>🛡️ Shielded</div>
                                                            )}
                                                        </div>
                                                        <div style={{ textAlign: "right" }}>
                                                            <div style={{ fontSize: 8, color: textMuted }}>LOOT</div>
                                                            <div style={{ fontSize: 20, color: "#10b981", fontWeight: 700 }}>{farm.pendingRewards}</div>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                </div>
                            </div>
                        )}

                        {/* Loading State */}
                        {loadingTarget && (
                            <div style={{ textAlign: "center", padding: 20, color: textMuted }}>
                                Loading target stats...
                            </div>
                        )}

                        {/* Target Stats & Battle Analysis */}
                        {!loadingTarget && selectedTarget && (
                            <>
                                {/* Shield Warning */}
                                {selectedTarget.hasShield && (
                                    <div style={{ 
                                        background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(96,165,250,0.15))", 
                                        border: "2px solid rgba(59,130,246,0.5)", 
                                        borderRadius: 12, 
                                        padding: 16, 
                                        marginBottom: 16,
                                        textAlign: "center"
                                    }}>
                                        <div style={{ fontSize: 32, marginBottom: 8 }}>🛡️</div>
                                        <div style={{ fontSize: 14, color: "#3b82f6", fontWeight: 700 }}>Target Protected!</div>
                                        <div style={{ fontSize: 11, color: textMuted, marginTop: 4 }}>This farm has an active Raid Shield</div>
                                    </div>
                                )}
                                
                                {/* Needs Flagging Notice */}
                                {selectedTarget.needsFlagging && !selectedTarget.hasShield && (
                                    <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, padding: 8, marginBottom: 12, textAlign: "center" }}>
                                        <span style={{ color: "#fbbf24", fontSize: 10 }}>📡 Tracked off-chain • Will be flagged when you raid</span>
                                    </div>
                                )}
                                
                                {/* Stats Grid */}
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 16 }}>
                                    <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 8, padding: 10, textAlign: "center" }}>
                                        <div style={{ fontSize: 9, color: textMuted }}>THEIR POWER</div>
                                        <div style={{ fontSize: 20, fontWeight: 700, color: "#ef4444" }}>{selectedTarget.battlePower}</div>
                                    </div>
                                    <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 8, padding: 10, textAlign: "center" }}>
                                        <div style={{ fontSize: 9, color: textMuted }}>PENDING LOOT</div>
                                        <div style={{ fontSize: 20, fontWeight: 700, color: "#10b981" }}>{selectedTarget.pendingRewards}</div>
                                    </div>
                                </div>
                                
                                {/* Battle Analysis */}
                                <div style={{ background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.4)", borderRadius: 10, padding: 12, marginBottom: 16, textAlign: "center" }}>
                                    <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 6 }}>⚔️ BATTLE ANALYSIS</div>
                                    <div style={{ display: "flex", justifyContent: "space-around" }}>
                                        <div>
                                            <div style={{ fontSize: 9, color: textMuted }}>YOUR POWER</div>
                                            <div style={{ fontSize: 16, fontWeight: 700, color: "#10b981" }}>{selectedTarget.attackerPower || myBattlePower}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 9, color: textMuted }}>WIN CHANCE</div>
                                            <div style={{ fontSize: 16, fontWeight: 700, color: selectedTarget.winChance >= 50 ? "#10b981" : "#ef4444" }}>{selectedTarget.winChance}%</div>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Raid Fee */}
                                <div style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 10, padding: 10, marginBottom: 16, textAlign: "center" }}>
                                    <div style={{ fontSize: 10, color: "#fbbf24" }}>Raid Fee: <b>{raidFee} FCWEED</b></div>
                                    <div style={{ fontSize: 8, color: textMuted, marginTop: 2 }}>Refunded on win, lost on defeat</div>
                                </div>
                                
                                {/* Action Buttons */}
                                <div style={{ display: "flex", gap: 10 }}>
                                    <button 
                                        onClick={closeAttackModal} 
                                        disabled={raiding || flagging} 
                                        style={{ flex: 1, padding: "14px", fontSize: 14, fontWeight: 600, borderRadius: 10, border: "1px solid rgba(107,114,128,0.3)", background: "transparent", color: textMuted, cursor: (raiding || flagging) ? "not-allowed" : "pointer" }}
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={handleRaid} 
                                        disabled={raiding || flagging || selectedTarget.hasShield || selectedTarget.plants === 0 || cooldownRemaining > 0} 
                                        style={{ 
                                            flex: 1, 
                                            padding: "14px", 
                                            fontSize: 14, 
                                            fontWeight: 700, 
                                            borderRadius: 10, 
                                            border: "none", 
                                            background: (raiding || flagging || selectedTarget.hasShield || selectedTarget.plants === 0 || cooldownRemaining > 0) 
                                                ? "#374151" 
                                                : "linear-gradient(135deg, #dc2626, #ef4444)", 
                                            color: "#fff", 
                                            cursor: (raiding || flagging || selectedTarget.hasShield || selectedTarget.plants === 0 || cooldownRemaining > 0) ? "not-allowed" : "pointer" 
                                        }}
                                    >
                                        {flagging ? "📡 FLAGGING..." : raiding ? "🚔 RAIDING..." : selectedTarget.hasShield ? "🛡️ SHIELDED" : cooldownRemaining > 0 ? `⏳ ${formatCooldown(cooldownRemaining)}` : "🚔 RAID"}
                                    </button>
                                </div>
                            </>
                        )}
                        
                        {/* Status Message */}
                        {status && (
                            <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 12, textAlign: "center" }}>{status}</div>
                        )}
                    </div>
                </div>
            )}

            {/* Result Modal */}
            {showResultModal && raidResult && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
                    <div style={{ background: modalBg, borderRadius: 16, padding: 24, maxWidth: 380, width: "100%", border: `2px solid ${raidResult.won ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)"}`, boxShadow: `0 0 40px ${raidResult.won ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                        <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 64, marginBottom: 12 }}>{raidResult.won ? "🎉" : "💀"}</div>
                            <div style={{ fontSize: 28, fontWeight: 800, color: raidResult.won ? "#10b981" : "#ef4444", marginBottom: 16 }}>
                                {raidResult.won ? "RAID SUCCESS!" : "RAID FAILED!"}
                            </div>
                            <div style={{ background: raidResult.won ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
                                {raidResult.won ? (
                                    <>
                                        <div style={{ fontSize: 12, color: textMuted, marginBottom: 8 }}>You seized</div>
                                        <div style={{ fontSize: 32, fontWeight: 700, color: "#10b981" }}>{raidResult.amount} FCWEED</div>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ fontSize: 12, color: textMuted, marginBottom: 8 }}>Target defended</div>
                                        <div style={{ fontSize: 18, color: "#ef4444" }}>Fee lost: {raidFee} FCWEED</div>
                                    </>
                                )}
                                <div style={{ fontSize: 11, color: textMuted, marginTop: 10 }}>Damage: {raidResult.damage}%</div>
                            </div>
                            <button 
                                onClick={closeResultModal} 
                                style={{ width: "100%", padding: "14px", fontSize: 14, fontWeight: 600, borderRadius: 10, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", cursor: "pointer" }}
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
