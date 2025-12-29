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
    "function deaPerTargetCooldown() view returns (uint256)",
    "function deaLastAttackOnTarget(address,address) view returns (uint256)",
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
    pendingRewardsRaw?: ethers.BigNumber;
    hasShield: boolean;
    totalSold: string;
    canAttack: boolean;
    battlePower?: number;
    lastSellTime?: number;
    expiresAt?: number;
    // Cooldown tracking
    targetImmunityEnds?: number;
    myAttackCooldownEnds?: number;
};

type JeetEntry = { 
    address: string; 
    totalSold: string; 
    totalSoldRaw?: string;
    sellCount: number; 
    lastSellTimestamp?: number;
    lastSellTime?: number; 
    expiresAt: number; 
    canBeRaidedNow: boolean; 
    hasShield: boolean; 
    source: "onchain" | "backend" | "both";
    needsFlagging: boolean;
    plants: number;
    avgHealth?: number;
    battlePower?: number;
    isCluster?: boolean;
    clusterId?: string;
    farms?: FarmInfo[];
    totalPlants?: number;
    bestFarm?: FarmInfo;
    warning?: string;
    // For single-farm cooldown display on main list
    targetImmunityEnds?: number;
    myAttackCooldownEnds?: number;
};

type TargetInfo = { 
    address: string; 
    pendingRewards: string; 
    plants: number; 
    avgHealth: number; 
    battlePower: number; 
    totalSold: string; 
    hasShield: boolean; 
    attackerPower: number; 
    winChance: number; 
    needsFlagging: boolean;
    isCluster?: boolean;
    farms?: FarmInfo[];
    selectedFarm?: FarmInfo;
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
const TARGET_IMMUNITY = 2 * 60 * 60; // 2 hours
const PER_TARGET_COOLDOWN = 6 * 60 * 60; // 6 hours

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
    const activeJeets = jeets.filter(j => j.expiresAt > now);
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

    // Fetch data from BOTH backend (tracked) and on-chain (flagged)
    const fetchDEAData = useCallback(async () => {
        if (fetchingRef.current || !readProvider) return;
        fetchingRef.current = true;
        setLoading(true);
        
        try {
            const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, BATTLES_ABI, readProvider);
            const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
            
            // STEP 1: Get global stats - DEA specific
            try {
                const [enabled, fee, globalStats] = await Promise.all([
                    battlesContract.deaRaidsEnabled(),
                    battlesContract.deaRaidFee(),
                    battlesContract.getGlobalStats()
                ]);
                setDeaEnabled(enabled);
                setRaidFeeRaw(fee);
                setRaidFee(formatLargeNumber(fee));
                // globalStats[1] = totalDeaRaids
                setTotalRaids(globalStats[1].toNumber());
                // For DEA-specific seized, we need to track it separately
                // Using index 4 (totalRewardsRedistributed) for now but this is shared
                setTotalSeized(formatLargeNumber(globalStats[4]));
            } catch (e) {
                console.error("[DEA] Error getting global stats:", e);
            }
            
            // STEP 2: Get user's general cooldown and battle power
            if (userAddress) {
                try {
                    const [stats, power] = await Promise.all([
                        battlesContract.getDeaAttackerStats(userAddress),
                        new ethers.Contract(V5_STAKING_ADDRESS, STAKING_ABI, readProvider).calculateBattlePower(userAddress)
                    ]);
                    setCooldownRemaining(stats.cooldownRemaining.toNumber());
                    setMyBattlePower(power.toNumber());
                } catch (e) {
                    console.error("[DEA] Error getting user stats:", e);
                }
            }
            
            // STEP 3: Get ON-CHAIN suspects (already flagged)
            let onChainSuspects: Map<string, JeetEntry> = new Map();
            try {
                const suspectList = await battlesContract.getSuspectList();
                
                if (suspectList.length > 0) {
                    const infoCalls = suspectList.map((addr: string) => ({
                        target: V5_BATTLES_ADDRESS,
                        callData: battlesInterface.encodeFunctionData("getSuspectInfo", [addr])
                    }));
                    const shieldCalls = suspectList.map((addr: string) => ({
                        target: V5_STAKING_ADDRESS,
                        callData: stakingInterface.encodeFunctionData("hasRaidShield", [addr])
                    }));
                    
                    const [infoResults, shieldResults] = await Promise.all([
                        mc.tryAggregate(false, infoCalls),
                        mc.tryAggregate(false, shieldCalls)
                    ]);
                    
                    for (let i = 0; i < suspectList.length; i++) {
                        const addr = suspectList[i].toLowerCase();
                        try {
                            if (infoResults[i].success) {
                                const info = battlesInterface.decodeFunctionResult("getSuspectInfo", infoResults[i].returnData);
                                let hasShield = false;
                                if (shieldResults[i].success) {
                                    hasShield = stakingInterface.decodeFunctionResult("hasRaidShield", shieldResults[i].returnData)[0];
                                }
                                
                                if (info.isSuspect && info.expiresAt.toNumber() > now) {
                                    onChainSuspects.set(addr, {
                                        address: suspectList[i],
                                        totalSold: info.totalSoldAmount.toString(),
                                        totalSoldRaw: info.totalSoldAmount.toString(),
                                        sellCount: info.sellCount.toNumber(),
                                        lastSellTimestamp: info.lastSellTimestamp.toNumber(),
                                        expiresAt: info.expiresAt.toNumber(),
                                        canBeRaidedNow: info.canCurrentlyBeRaided && !hasShield,
                                        hasShield,
                                        source: "onchain",
                                        needsFlagging: false,
                                        plants: 0,
                                        avgHealth: 0
                                    });
                                }
                            }
                        } catch (e) {}
                    }
                }
            } catch (e) {
                console.error("[DEA] Error getting on-chain suspects:", e);
            }
            
            // STEP 4: Get BACKEND tracked jeets (not yet on-chain)
            let backendJeets: Map<string, any> = new Map();
            try {
                const leaderboardRes = await fetch(`${WARS_BACKEND_URL}/api/dea/leaderboard?limit=200`).catch(() => null);
                
                if (leaderboardRes) {
                    const data = await leaderboardRes.json();
                    
                    if (data.success && Array.isArray(data.jeets)) {
                        for (const j of data.jeets) {
                            const addr = j.address.toLowerCase();
                            const lastSell = j.lastSellTime || j.lastSellTimestamp || 0;
                            const expiresAt = j.expiresAt || (lastSell > 0 ? lastSell + SUSPECT_EXPIRY : 0);
                            
                            if (lastSell === 0 || expiresAt <= now) continue;
                            
                            backendJeets.set(addr, {
                                address: j.address,
                                totalSold: j.totalSold,
                                totalSoldRaw: j.totalSoldRaw,
                                sellCount: j.sellCount || 1,
                                lastSellTimestamp: lastSell,
                                lastSellTime: lastSell,
                                expiresAt,
                                flaggedOnChain: j.flaggedOnChain || false,
                                plants: j.plants || j.totalPlants || 0,
                                avgHealth: j.avgHealth || 0,
                                hasShield: j.hasShield || false,
                                isCluster: j.isCluster || false,
                                clusterId: j.clusterId,
                                farms: j.farms,
                                totalPlants: j.totalPlants,
                                bestFarm: j.bestFarm
                            });
                        }
                    }
                }
            } catch (e) {
                console.error("[DEA] Backend error:", e);
            }
            
            // STEP 5: Merge both sources
            const mergedJeets: JeetEntry[] = [];
            const allAddresses = new Set([...onChainSuspects.keys(), ...backendJeets.keys()]);
            
            // Get shields for backend-only addresses
            const backendOnlyAddrs = [...backendJeets.keys()].filter(a => !onChainSuspects.has(a));
            let backendShields: Map<string, boolean> = new Map();
            
            if (backendOnlyAddrs.length > 0) {
                try {
                    const shieldCalls = backendOnlyAddrs.map(addr => ({
                        target: V5_STAKING_ADDRESS,
                        callData: stakingInterface.encodeFunctionData("hasRaidShield", [addr])
                    }));
                    const results = await mc.tryAggregate(false, shieldCalls);
                    backendOnlyAddrs.forEach((addr, i) => {
                        if (results[i].success) {
                            backendShields.set(addr, stakingInterface.decodeFunctionResult("hasRaidShield", results[i].returnData)[0]);
                        }
                    });
                } catch (e) {}
            }
            
            for (const addr of allAddresses) {
                const onChain = onChainSuspects.get(addr);
                const backend = backendJeets.get(addr);
                
                if (onChain && backend) {
                    mergedJeets.push({
                        ...onChain,
                        totalSold: onChain.totalSold || backend.totalSold,
                        source: "both",
                        needsFlagging: false,
                        plants: backend.totalPlants || backend.plants || 0,
                        avgHealth: backend.avgHealth || 0,
                        isCluster: backend.isCluster,
                        clusterId: backend.clusterId,
                        farms: backend.farms,
                        totalPlants: backend.totalPlants,
                        bestFarm: backend.bestFarm
                    });
                } else if (onChain) {
                    mergedJeets.push({
                        ...onChain,
                        plants: 0,
                        avgHealth: 0
                    });
                } else if (backend) {
                    const hasShield = backendShields.get(addr) || backend.hasShield || false;
                    mergedJeets.push({
                        address: backend.address,
                        totalSold: backend.totalSold,
                        totalSoldRaw: backend.totalSoldRaw,
                        sellCount: backend.sellCount,
                        lastSellTimestamp: backend.lastSellTimestamp,
                        expiresAt: backend.expiresAt,
                        canBeRaidedNow: !hasShield,
                        hasShield,
                        source: "backend",
                        needsFlagging: !backend.flaggedOnChain,
                        plants: backend.totalPlants || backend.plants || 0,
                        avgHealth: backend.avgHealth || 0,
                        isCluster: backend.isCluster,
                        clusterId: backend.clusterId,
                        farms: backend.farms,
                        totalPlants: backend.totalPlants,
                        bestFarm: backend.bestFarm
                    });
                }
            }
            
            // Sort by sold amount
            mergedJeets.sort((a, b) => {
                const aVal = parseFloat(a.totalSold) || 0;
                const bVal = parseFloat(b.totalSold) || 0;
                return bVal - aVal;
            });
            
            setJeets(mergedJeets);
            
        } catch (e) {
            console.error("[DEA] Fetch error:", e);
        }
        
        setLoading(false);
        fetchingRef.current = false;
    }, [readProvider, userAddress, now]);

    // Load target stats with cooldown info for each farm
    const handleSelectTarget = async (jeet: JeetEntry) => {
        if (!userAddress || !readProvider) return;
        
        setSelectedJeet(jeet);
        setLoadingTarget(true);
        setStatus("");
        setShowAttackModal(true);
        setSelectedTarget(null);
        
        try {
            const targetAddress = jeet.bestFarm?.address || jeet.address;
            
            const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
            
            // Get stats for selected target AND refresh attacker power
            const calls = [
                { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("pending", [targetAddress]) },
                { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("getUserBattleStats", [targetAddress]) },
                { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("calculateBattlePower", [targetAddress]) },
                { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("calculateBattlePower", [userAddress]) },
                { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("hasRaidShield", [targetAddress]) }
            ];
            
            const results = await mc.tryAggregate(false, calls);
            
            let pendingRewards = "0", plants = 0, avgHealth = 0, battlePower = 0, attackerPower = myBattlePower, hasShield = false;
            
            if (results[0].success) pendingRewards = formatLargeNumber(stakingInterface.decodeFunctionResult("pending", results[0].returnData)[0]);
            if (results[1].success) {
                const stats = stakingInterface.decodeFunctionResult("getUserBattleStats", results[1].returnData);
                plants = stats[0].toNumber();
                avgHealth = stats[3].toNumber();
            }
            if (results[2].success) battlePower = stakingInterface.decodeFunctionResult("calculateBattlePower", results[2].returnData)[0].toNumber();
            if (results[3].success) {
                attackerPower = stakingInterface.decodeFunctionResult("calculateBattlePower", results[3].returnData)[0].toNumber();
                setMyBattlePower(attackerPower); // Update stored value
            }
            if (results[4].success) hasShield = stakingInterface.decodeFunctionResult("hasRaidShield", results[4].returnData)[0];
            
            // Get cooldowns and fresh stats for each farm if cluster
            let farmsWithCooldowns: FarmInfo[] = [];
            if (jeet.farms && jeet.farms.length > 0) {
                // Build calls for all farms: cooldown + pending + stats + shield
                const farmCalls: any[] = [];
                jeet.farms.forEach((farm: FarmInfo) => {
                    farmCalls.push(
                        { target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("deaLastAttackOnTarget", [userAddress, farm.address]) },
                        { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("pending", [farm.address]) },
                        { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("getUserBattleStats", [farm.address]) },
                        { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("hasRaidShield", [farm.address]) },
                        { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("calculateBattlePower", [farm.address]) }
                    );
                });
                
                try {
                    const farmResults = await mc.tryAggregate(false, farmCalls);
                    
                    farmsWithCooldowns = jeet.farms.map((farm: FarmInfo, idx: number) => {
                        const baseIdx = idx * 5;
                        let myAttackCooldownEnds = 0;
                        let farmPending = "0";
                        let farmPlants = farm.plants || 0;
                        let farmHealth = farm.avgHealth || 0;
                        let farmShield = farm.hasShield || false;
                        let farmPower = 0;
                        
                        // Cooldown
                        if (farmResults[baseIdx]?.success) {
                            const lastAttack = battlesInterface.decodeFunctionResult("deaLastAttackOnTarget", farmResults[baseIdx].returnData)[0].toNumber();
                            if (lastAttack > 0) {
                                myAttackCooldownEnds = lastAttack + PER_TARGET_COOLDOWN;
                            }
                        }
                        
                        // Pending rewards
                        if (farmResults[baseIdx + 1]?.success) {
                            const raw = stakingInterface.decodeFunctionResult("pending", farmResults[baseIdx + 1].returnData)[0];
                            farmPending = formatLargeNumber(raw);
                        }
                        
                        // Battle stats (plants, health)
                        if (farmResults[baseIdx + 2]?.success) {
                            const stats = stakingInterface.decodeFunctionResult("getUserBattleStats", farmResults[baseIdx + 2].returnData);
                            farmPlants = stats[0].toNumber();
                            farmHealth = stats[3].toNumber();
                        }
                        
                        // Shield
                        if (farmResults[baseIdx + 3]?.success) {
                            farmShield = stakingInterface.decodeFunctionResult("hasRaidShield", farmResults[baseIdx + 3].returnData)[0];
                        }
                        
                        // Battle power
                        if (farmResults[baseIdx + 4]?.success) {
                            farmPower = stakingInterface.decodeFunctionResult("calculateBattlePower", farmResults[baseIdx + 4].returnData)[0].toNumber();
                        }
                        
                        return {
                            ...farm,
                            plants: farmPlants,
                            avgHealth: farmHealth,
                            pendingRewards: farmPending,
                            hasShield: farmShield,
                            battlePower: farmPower || Math.floor(farmPlants * 3 * farmHealth / 100),
                            myAttackCooldownEnds,
                            canAttack: farmPlants > 0 && !farmShield && farmHealth > 0
                        };
                    });
                } catch (e) {
                    console.error("[DEA] Error getting farm details:", e);
                    // Fallback to original farms with formatted pending
                    farmsWithCooldowns = jeet.farms.map((farm: FarmInfo) => ({
                        ...farm,
                        pendingRewards: formatLargeNumber(farm.pendingRewards || "0")
                    }));
                }
            }
            
            const winChance = attackerPower > 0 && battlePower > 0 ? Math.min(95, Math.max(5, Math.round((attackerPower / (attackerPower + battlePower)) * 100))) : 50;
            
            setSelectedTarget({ 
                address: targetAddress, 
                pendingRewards, 
                plants, 
                avgHealth, 
                battlePower, 
                totalSold: formatLargeNumber(jeet.totalSold), 
                hasShield, 
                attackerPower, 
                winChance,
                needsFlagging: jeet.needsFlagging,
                isCluster: jeet.isCluster,
                farms: farmsWithCooldowns,
                selectedFarm: jeet.bestFarm
            });
        } catch (e: any) {
            console.error("[DEA] Failed to load target:", e);
            setStatus("Failed to load target stats");
        }
        setLoadingTarget(false);
    };

    // Request backend to flag the suspect
    const requestBackendFlag = async (): Promise<boolean> => {
        if (!selectedTarget) return false;
        
        if (selectedTarget.plants === 0) {
            setStatus("❌ Cannot raid: Target has no plants staked.");
            return false;
        }
        
        setFlagging(true);
        setStatus("Requesting flag from backend...");
        
        try {
            const addressToFlag = selectedJeet?.address || selectedTarget.address;
            const response = await fetch(`${WARS_BACKEND_URL}/api/dea/request-flag`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetAddress: addressToFlag })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                if (response.status === 429) {
                    setStatus("⏳ Rate limited - try again in a few minutes.");
                } else if (response.status === 404) {
                    setStatus("❌ This address is not tracked as a seller.");
                } else if (data.reason === "NO_PLANTS") {
                    setStatus("❌ Cannot raid: Target has no plants staked.");
                } else {
                    setStatus(`❌ ${data.error || "Failed to flag suspect"}`);
                }
                setFlagging(false);
                return false;
            }
            
            if (data.success) {
                if (selectedJeet) {
                    selectedJeet.needsFlagging = false;
                    selectedJeet.source = "onchain";
                }
                if (selectedTarget) {
                    selectedTarget.needsFlagging = false;
                }
                setStatus(data.alreadyFlagged ? "✓ Already flagged! Proceeding..." : "✓ Flagged! Proceeding...");
                setFlagging(false);
                return true;
            } else {
                setStatus(`❌ ${data.error || "Flag request failed"}`);
                setFlagging(false);
                return false;
            }
        } catch (e: any) {
            console.error("[DEA] Flag request error:", e);
            setStatus("❌ Network error - could not reach backend");
            setFlagging(false);
            return false;
        }
    };

    // Execute raid
    const handleRaid = async () => {
        if (!selectedTarget || !userAddress || !readProvider) return;
        if (selectedTarget.hasShield) { setStatus("Target has raid shield!"); return; }
        
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
                setStatus("Approval rejected or failed");
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
            if (receipt && receipt.logs) {
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

    const closeAttackModal = () => { setShowAttackModal(false); setSelectedTarget(null); setSelectedJeet(null); setStatus(""); };
    const closeResultModal = () => { setShowResultModal(false); setRaidResult(null); };

    useEffect(() => { fetchDEAData(); }, [fetchDEAData]);
    useEffect(() => { const interval = setInterval(() => fetchDEAData(), 30000); return () => clearInterval(interval); }, [fetchDEAData]);

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
                <div style={{ textAlign: "center", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 20 }}>🚔</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#dc2626" }}>DEA WATCHLIST</span>
                        {!deaEnabled && <span style={{ fontSize: 9, background: "#374151", color: "#fbbf24", padding: "2px 6px", borderRadius: 4 }}>PAUSED</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#fbbf24", marginBottom: 6 }}>Suspects: <b>{activeJeets.length}</b></div>
                    <div style={{ display: "flex", justifyContent: "center", gap: 16, fontSize: 10 }}>
                        <span style={{ color: textMuted }}>Total Raids: <b style={{ color: "#ef4444" }}>{totalRaids}</b></span>
                        <span style={{ color: textMuted }}>Total Seized: <b style={{ color: "#10b981" }}>{totalSeized}</b></span>
                    </div>
                </div>
                
                {cooldownRemaining > 0 && (
                    <div style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, padding: 8, marginBottom: 12, textAlign: "center" }}>
                        <span style={{ fontSize: 11, color: "#fbbf24" }}>⏳ General Cooldown: <b>{formatCooldown(cooldownRemaining)}</b></span>
                    </div>
                )}

                {/* Jeets Table */}
                {paginatedJeets.length > 0 ? (
                    <>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                <thead><tr style={{ borderBottom: `1px solid ${borderColor}` }}>
                                    <th style={{ padding: "8px 4px", textAlign: "left", color: textMuted, fontWeight: 600 }}>#</th>
                                    <th style={{ padding: "8px 4px", textAlign: "left", color: textMuted, fontWeight: 600 }}>Address</th>
                                    <th style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontWeight: 600 }}>🏠</th>
                                    <th style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontWeight: 600 }}>🌱</th>
                                    <th style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontWeight: 600 }}>❤️</th>
                                    <th style={{ padding: "8px 4px", textAlign: "right", color: textMuted, fontWeight: 600 }}>Sold</th>
                                    <th style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontWeight: 600 }}>⏱️</th>
                                    <th style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontWeight: 600 }}>Status</th>
                                    <th style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontWeight: 600 }}></th>
                                </tr></thead>
                                <tbody>{paginatedJeets.map((jeet, idx) => {
                                    const hasNoPlants = (jeet.totalPlants || jeet.plants || 0) === 0;
                                    const canRaid = !hasNoPlants && (jeet.canBeRaidedNow || jeet.needsFlagging) && !jeet.hasShield;
                                    const health = jeet.avgHealth || 0;
                                    
                                    return (
                                    <tr key={jeet.address} style={{ borderBottom: `1px solid ${theme === "light" ? "#f1f5f9" : "rgba(255,255,255,0.05)"}`, opacity: hasNoPlants ? 0.6 : 1 }}>
                                        <td style={{ padding: "8px 4px", color: textMuted }}>{(currentPage - 1) * ITEMS_PER_PAGE + idx + 1}</td>
                                        <td style={{ padding: "8px 4px", fontFamily: "monospace", fontSize: 10, color: textMain }}>
                                            {jeet.address.slice(0, 4)}..{jeet.address.slice(-4)}
                                            {hasNoPlants && <span style={{ marginLeft: 4, fontSize: 8, color: "#ef4444" }} title="No plants staked">⚠️</span>}
                                        </td>
                                        <td style={{ padding: "8px 4px", textAlign: "center", color: jeet.isCluster ? "#fbbf24" : textMuted, fontWeight: 600 }}>
                                            {jeet.isCluster ? `🔗${jeet.farms?.length || 2}` : "1"}
                                        </td>
                                        <td style={{ padding: "8px 4px", textAlign: "center", color: hasNoPlants ? "#ef4444" : "#10b981", fontWeight: 600 }}>{jeet.totalPlants || jeet.plants || "0"}</td>
                                        <td style={{ padding: "8px 4px", textAlign: "center", color: getHealthColor(health), fontWeight: 600 }}>{health ? `${health}%` : "?"}</td>
                                        <td style={{ padding: "8px 4px", textAlign: "right", color: "#ef4444", fontWeight: 600 }}>{formatLargeNumber(jeet.totalSold)}</td>
                                        <td style={{ padding: "8px 4px", textAlign: "center", color: textMuted, fontSize: 9 }}>{formatTimeRemaining(jeet.expiresAt)}</td>
                                        <td style={{ padding: "8px 4px", textAlign: "center" }}>
                                            {jeet.source === "onchain" || jeet.source === "both" ? (
                                                <span style={{ fontSize: 8, background: "rgba(16,185,129,0.2)", color: "#10b981", padding: "2px 6px", borderRadius: 4 }}>ON-CHAIN</span>
                                            ) : (
                                                <span style={{ fontSize: 8, background: "rgba(251,191,36,0.2)", color: "#fbbf24", padding: "2px 6px", borderRadius: 4 }}>TRACKED</span>
                                            )}
                                        </td>
                                        <td style={{ padding: "8px 4px", textAlign: "center" }}>
                                            {hasNoPlants ? (
                                                <span style={{ fontSize: 8, color: "#ef4444" }} title="Cannot raid - no plants">🚫</span>
                                            ) : jeet.hasShield ? (
                                                <span style={{ fontSize: 12, color: "#3b82f6" }}>🛡️</span>
                                            ) : cooldownRemaining > 0 ? (
                                                <span style={{ fontSize: 9, color: "#fbbf24" }}>⏳</span>
                                            ) : !canRaid ? (
                                                <span style={{ fontSize: 9, color: textMuted }}>—</span>
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
                                                        cursor: deaEnabled ? "pointer" : "not-allowed", 
                                                        fontWeight: 600 
                                                    }}
                                                >
                                                    🚔
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )})}</tbody>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 12 }}>
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ padding: "6px 12px", fontSize: 11, borderRadius: 6, border: `1px solid ${borderColor}`, background: cellBg, color: textMain, cursor: currentPage === 1 ? "not-allowed" : "pointer", opacity: currentPage === 1 ? 0.5 : 1 }}>← Prev</button>
                                <span style={{ fontSize: 11, color: textMuted }}>Page {currentPage} of {totalPages}</span>
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ padding: "6px 12px", fontSize: 11, borderRadius: 6, border: `1px solid ${borderColor}`, background: cellBg, color: textMain, cursor: currentPage === totalPages ? "not-allowed" : "pointer", opacity: currentPage === totalPages ? 0.5 : 1 }}>Next →</button>
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
                        <div style={{ textAlign: "center", marginBottom: 16 }}><div style={{ fontSize: 36, marginBottom: 8 }}>🚔</div><div style={{ fontSize: 18, fontWeight: 800, color: "#dc2626" }}>DEA RAID</div></div>
                        
                        <div style={{ background: "rgba(220,38,38,0.1)", borderRadius: 10, padding: 12, marginBottom: 16 }}>
                            <div style={{ fontSize: 10, color: textMuted, marginBottom: 4 }}>SUSPECT {selectedJeet.isCluster && <span style={{ color: "#fbbf24" }}>({selectedJeet.farms?.length || 1} linked farms)</span>}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: textMain, fontFamily: "monospace" }}>{selectedJeet.address.slice(0, 10)}...{selectedJeet.address.slice(-8)}</div>
                            <div style={{ fontSize: 11, color: "#ef4444", marginTop: 6 }}>Sold: <b>{formatLargeNumber(selectedJeet.totalSold)}</b> FCWEED</div>
                            {selectedJeet.isCluster && <div style={{ fontSize: 10, color: "#10b981", marginTop: 4 }}>Combined: <b>{selectedJeet.totalPlants}</b> plants across {selectedJeet.farms?.length || 2} farms</div>}
                        </div>

                        {/* Farm Selector - Improved UI */}
                        {selectedJeet.farms && selectedJeet.farms.length > 0 && (
                            <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 10, padding: 12, marginBottom: 16 }}>
                                <div style={{ fontSize: 11, color: "#10b981", marginBottom: 8, fontWeight: 600 }}>
                                    {selectedJeet.farms.length > 1 
                                        ? `🎯 SELECT FARM TO RAID (${selectedTarget?.farms?.filter((f: FarmInfo) => f.canAttack && (!f.myAttackCooldownEnds || f.myAttackCooldownEnds <= now)).length || 0} of ${selectedJeet.farms.length} available):`
                                        : "🎯 TARGET FARM:"
                                    }
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
                                    {(selectedTarget?.farms || selectedJeet.farms)
                                        .filter((farm: FarmInfo) => farm.plants > 0)
                                        .map((farm: FarmInfo) => {
                                            const hasMyCooldown = farm.myAttackCooldownEnds && farm.myAttackCooldownEnds > now;
                                            const myCooldownLeft = hasMyCooldown ? farm.myAttackCooldownEnds! - now : 0;
                                            const isDisabled = !farm.canAttack || hasMyCooldown || farm.hasShield;
                                            
                                            return (
                                                <button
                                                    key={farm.address}
                                                    onClick={() => {
                                                        if (!isDisabled && selectedTarget) {
                                                            setSelectedTarget({
                                                                ...selectedTarget,
                                                                address: farm.address,
                                                                plants: farm.plants,
                                                                avgHealth: farm.avgHealth,
                                                                pendingRewards: farm.pendingRewards,
                                                                hasShield: farm.hasShield,
                                                                battlePower: farm.battlePower || Math.floor(farm.plants * 3 * farm.avgHealth / 100),
                                                                selectedFarm: farm
                                                            });
                                                        }
                                                    }}
                                                    disabled={isDisabled}
                                                    style={{
                                                        padding: "12px",
                                                        borderRadius: 10,
                                                        border: selectedTarget?.address === farm.address ? "2px solid #10b981" : "1px solid rgba(107,114,128,0.3)",
                                                        background: selectedTarget?.address === farm.address ? "rgba(16,185,129,0.2)" : "rgba(5,8,20,0.5)",
                                                        cursor: isDisabled ? "not-allowed" : "pointer",
                                                        opacity: isDisabled ? 0.5 : 1,
                                                        textAlign: "left",
                                                        filter: hasMyCooldown ? "blur(0.5px)" : "none",
                                                        position: "relative"
                                                    }}
                                                >
                                                    {/* Cooldown overlay */}
                                                    {hasMyCooldown && (
                                                        <div style={{ 
                                                            position: "absolute", 
                                                            top: 0, 
                                                            left: 0, 
                                                            right: 0, 
                                                            bottom: 0, 
                                                            background: "rgba(0,0,0,0.6)", 
                                                            borderRadius: 10,
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            flexDirection: "column"
                                                        }}>
                                                            <div style={{ fontSize: 10, color: "#fbbf24", fontWeight: 600 }}>⏳ YOUR COOLDOWN</div>
                                                            <div style={{ fontSize: 14, color: "#fbbf24", fontWeight: 700 }}>{formatCooldown(myCooldownLeft)}</div>
                                                        </div>
                                                    )}
                                                    
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                                        <div>
                                                            <div style={{ fontSize: 11, fontFamily: "monospace", color: textMain, fontWeight: 600 }}>{farm.address.slice(0, 6)}..{farm.address.slice(-4)}</div>
                                                            <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                                                                <div>
                                                                    <div style={{ fontSize: 8, color: textMuted }}>PLANTS</div>
                                                                    <div style={{ fontSize: 16, color: "#22c55e", fontWeight: 700 }}>{farm.plants}</div>
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: 8, color: textMuted }}>HEALTH</div>
                                                                    <div style={{ fontSize: 16, color: getHealthColor(farm.avgHealth || 0), fontWeight: 700 }}>{farm.avgHealth || 0}%</div>
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: 8, color: textMuted }}>POWER</div>
                                                                    <div style={{ fontSize: 16, color: "#a78bfa", fontWeight: 700 }}>{farm.battlePower || Math.floor((farm.plants || 0) * 3 * (farm.avgHealth || 0) / 100)}</div>
                                                                </div>
                                                            </div>
                                                            {farm.hasShield && (
                                                                <div style={{ fontSize: 9, color: "#3b82f6", marginTop: 4 }}>🛡️ Shielded</div>
                                                            )}
                                                            {!farm.canAttack && !hasMyCooldown && !farm.hasShield && (
                                                                <div style={{ fontSize: 9, color: "#ef4444", marginTop: 4 }}>
                                                                    {farm.plants === 0 ? "❌ No plants" : farm.avgHealth === 0 ? "❌ 0% health" : "❌ Cannot attack"}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div style={{ textAlign: "right" }}>
                                                            <div style={{ fontSize: 8, color: textMuted }}>LOOT</div>
                                                            <div style={{ fontSize: 18, color: "#10b981", fontWeight: 700 }}>{farm.pendingRewards || "0"}</div>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                </div>
                            </div>
                        )}

                        {loadingTarget ? <div style={{ textAlign: "center", padding: 20, color: textMuted }}>Loading target stats...</div> : selectedTarget ? (
                            <>
                                {selectedTarget.hasShield && (
                                    <div style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.4)", borderRadius: 12, padding: 16, marginBottom: 16, textAlign: "center" }}>
                                        <div style={{ fontSize: 32, marginBottom: 8 }}>🛡️</div>
                                        <div style={{ fontSize: 14, color: "#3b82f6", fontWeight: 700 }}>Target Protected!</div>
                                        <div style={{ fontSize: 11, color: textMuted, marginTop: 4 }}>This farm has an active Raid Shield</div>
                                    </div>
                                )}
                                
                                {selectedTarget.needsFlagging && (
                                    <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, padding: 8, marginBottom: 12, textAlign: "center" }}>
                                        <span style={{ color: "#fbbf24", fontSize: 10 }}>📡 Tracked off-chain • Will be flagged when you raid</span>
                                    </div>
                                )}
                                
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 16 }}>
                                    <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 8, padding: 10, textAlign: "center" }}><div style={{ fontSize: 9, color: textMuted }}>THEIR POWER</div><div style={{ fontSize: 20, fontWeight: 700, color: "#ef4444" }}>{selectedTarget.battlePower}</div></div>
                                    <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 8, padding: 10, textAlign: "center" }}><div style={{ fontSize: 9, color: textMuted }}>PENDING LOOT</div><div style={{ fontSize: 20, fontWeight: 700, color: "#10b981" }}>{selectedTarget.pendingRewards}</div></div>
                                </div>
                                <div style={{ background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.4)", borderRadius: 10, padding: 12, marginBottom: 16, textAlign: "center" }}>
                                    <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 6 }}>⚔️ BATTLE ANALYSIS</div>
                                    <div style={{ display: "flex", justifyContent: "space-around" }}>
                                        <div><div style={{ fontSize: 9, color: textMuted }}>YOUR POWER</div><div style={{ fontSize: 16, fontWeight: 700, color: "#10b981" }}>{selectedTarget.attackerPower || myBattlePower || 0}</div></div>
                                        <div><div style={{ fontSize: 9, color: textMuted }}>WIN CHANCE</div><div style={{ fontSize: 16, fontWeight: 700, color: selectedTarget.winChance >= 50 ? "#10b981" : "#ef4444" }}>{selectedTarget.winChance}%</div></div>
                                    </div>
                                </div>
                                <div style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 10, padding: 10, marginBottom: 16, textAlign: "center" }}>
                                    <div style={{ fontSize: 10, color: "#fbbf24" }}>Raid Fee: <b>{raidFee} FCWEED</b></div>
                                    <div style={{ fontSize: 8, color: textMuted, marginTop: 2 }}>Refunded on win, lost on defeat</div>
                                </div>
                                <div style={{ display: "flex", gap: 10 }}>
                                    <button onClick={closeAttackModal} disabled={raiding || flagging} style={{ flex: 1, padding: "14px", fontSize: 14, fontWeight: 600, borderRadius: 10, border: "1px solid rgba(107,114,128,0.3)", background: "transparent", color: textMuted, cursor: (raiding || flagging) ? "not-allowed" : "pointer" }}>Cancel</button>
                                    <button 
                                        onClick={handleRaid} 
                                        disabled={raiding || flagging || selectedTarget.hasShield} 
                                        style={{ 
                                            flex: 1, 
                                            padding: "14px", 
                                            fontSize: 14, 
                                            fontWeight: 700, 
                                            borderRadius: 10, 
                                            border: "none", 
                                            background: (raiding || flagging || selectedTarget.hasShield) ? "#374151" : "linear-gradient(135deg, #dc2626, #ef4444)", 
                                            color: "#fff", 
                                            cursor: (raiding || flagging || selectedTarget.hasShield) ? "not-allowed" : "pointer" 
                                        }}
                                    >
                                        {flagging ? "📡 FLAGGING..." : raiding ? "🚔 RAIDING..." : selectedTarget.hasShield ? "🛡️ SHIELDED" : "🚔 RAID"}
                                    </button>
                                </div>
                            </>
                        ) : null}
                        {status && <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 12, textAlign: "center" }}>{status}</div>}
                    </div>
                </div>
            )}

            {/* Result Modal */}
            {showResultModal && raidResult && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
                    <div style={{ background: modalBg, borderRadius: 16, padding: 24, maxWidth: 380, width: "100%", border: `2px solid ${raidResult.won ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)"}`, boxShadow: `0 0 40px ${raidResult.won ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                        <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 64, marginBottom: 12 }}>{raidResult.won ? "🎉" : "💀"}</div>
                            <div style={{ fontSize: 28, fontWeight: 800, color: raidResult.won ? "#10b981" : "#ef4444", marginBottom: 16 }}>{raidResult.won ? "RAID SUCCESS!" : "RAID FAILED!"}</div>
                            <div style={{ background: raidResult.won ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
                                {raidResult.won ? <><div style={{ fontSize: 12, color: textMuted, marginBottom: 8 }}>You seized</div><div style={{ fontSize: 32, fontWeight: 700, color: "#10b981" }}>{raidResult.amount} FCWEED</div></> : <><div style={{ fontSize: 12, color: textMuted, marginBottom: 8 }}>Target defended</div><div style={{ fontSize: 18, color: "#ef4444" }}>Fee lost: {raidFee} FCWEED</div></>}
                                <div style={{ fontSize: 11, color: textMuted, marginTop: 10 }}>Damage: {raidResult.damage}%</div>
                            </div>
                            <button onClick={closeResultModal} style={{ width: "100%", padding: "14px", fontSize: 14, fontWeight: 600, borderRadius: 10, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", cursor: "pointer" }}>Continue</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
