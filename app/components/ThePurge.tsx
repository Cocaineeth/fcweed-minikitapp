"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { V5_BATTLES_ADDRESS, WARS_BACKEND_URL, V5_STAKING_ADDRESS, FCWEED_ADDRESS, MULTICALL3_ADDRESS } from "../lib/constants";

const BATTLES_ABI = [
    "function purgeAttack(address target) external",
    "function purgeFee() view returns (uint256)",
    "function purgeCD() view returns (uint256)",
    "function canPurge(address) view returns (bool)",
    "function isPurgeActive() view returns (bool)",
    "function lastPurge(address) view returns (uint256)",
    "function getAtkStats(address) view returns (uint256 wins, uint256 losses, uint256 stolen, uint256 nukes)",
    "function getDefStats(address) view returns (uint256 wins, uint256 losses, uint256 lost, bool hasShield)",
    "function getGlobal() view returns (uint256 cartel, uint256 dea, uint256 purge, uint256 flagged, uint256 redist, uint256 fees, uint256 burned)",
    "function getPower(address) view returns (uint256 base, uint256 atk, uint256 def)",
    "event PurgeResult(address indexed a, address indexed t, bool w, uint256 ap, uint256 dp, uint256 s, uint256 dmg)"
];

const STAKING_ABI = [
    "function getUserBattleStats(address) view returns (uint256 plants, uint256 lands, uint256 superLands, uint256 avgHealth, uint256 pendingRewards)",
    "function calculateBattlePower(address) view returns (uint256)",
    "function pending(address) view returns (uint256)",
    "function getTotalStakers() view returns (uint256)",
    "function getStakerAtIndex(uint256) view returns (address)"
];

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)"
];

const MULTICALL3_ABI = ["function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])"];

const battlesInterface = new ethers.utils.Interface(BATTLES_ABI);
const stakingInterface = new ethers.utils.Interface(STAKING_ABI);
const erc20Interface = new ethers.utils.Interface(ERC20_ABI);

// Farm info for individual wallets within a cluster
type FarmInfo = {
    address: string;
    plants: number;
    lands: number;
    superLands: number;
    avgHealth: number;
    pendingRewards: string;
    pendingRaw: number;
    battlePower: number;
    hasShield: boolean;
    shieldExpiry: number;
};

// Cluster/Target info (can contain multiple farms)
type ClusterInfo = {
    address: string;
    name?: string;
    farms: FarmInfo[];
    totalPlants: number;
    totalLands: number;
    totalSuperLands: number;
    totalPendingRaw: number;
    pendingRewards: string;
    avgHealth: number;
    battlePower: number;
    hasShield: boolean;
    isCluster: boolean;
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

export function ThePurge({ connected, userAddress, theme, readProvider, sendContractTx, ensureAllowance, refreshData }: Props) {
    const [isPurgeActive, setIsPurgeActive] = useState(false);
    const [totalPurged, setTotalPurged] = useState(0);
    const [totalBurned, setTotalBurned] = useState("0");
    const [totalLooted, setTotalLooted] = useState("0");
    const [purgeFee, setPurgeFee] = useState("250K");
    const [purgeFeeRaw, setPurgeFeeRaw] = useState<ethers.BigNumber>(ethers.utils.parseUnits("250000", 18));
    const [purgeCD, setPurgeCD] = useState(1200); // 20 minutes default
    const [canPurge, setCanPurge] = useState(false);
    const [cooldownRemaining, setCooldownRemaining] = useState(0);
    const [myBattlePower, setMyBattlePower] = useState(0);
    const [loading, setLoading] = useState(true);
    const [attacking, setAttacking] = useState(false);
    const [status, setStatus] = useState("");
    const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));
    const [lastRefresh, setLastRefresh] = useState(Date.now());
    
    // Target selection with clusters
    const [clusters, setClusters] = useState<ClusterInfo[]>([]);
    const [selectedCluster, setSelectedCluster] = useState<ClusterInfo | null>(null);
    const [selectedFarm, setSelectedFarm] = useState<FarmInfo | null>(null);
    const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
    const [showAttackModal, setShowAttackModal] = useState(false);
    const [showResultModal, setShowResultModal] = useState(false);
    const [attackResult, setAttackResult] = useState<{ won: boolean; amount: string; damage: number } | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [loadingTargets, setLoadingTargets] = useState(false);

    const fetchingRef = useRef(false);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(Math.floor(Date.now() / 1000)), 1000);
        return () => clearInterval(timer);
    }, []);

    const formatLargeNumber = (num: ethers.BigNumber | number | string): string => {
        let n: number;
        if (typeof num === "number") n = num;
        else if (typeof num === "string") n = parseFloat(num);
        else n = parseFloat(ethers.utils.formatUnits(num, 18));
        if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
        if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
        if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
        return n.toFixed(0);
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

    const getHealthColor = (health: number): string => {
        if (health >= 70) return "#22c55e";
        if (health >= 40) return "#fbbf24";
        if (health >= 20) return "#f97316";
        return "#ef4444";
    };

    const shortAddr = (addr: string) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

    const fetchPurgeData = useCallback(async () => {
        if (fetchingRef.current || !readProvider) return;
        fetchingRef.current = true;

        try {
            const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, BATTLES_ABI, readProvider);

            const [isActive, fee, cd, globalStats] = await Promise.all([
                battlesContract.isPurgeActive(),
                battlesContract.purgeFee(),
                battlesContract.purgeCD(),
                battlesContract.getGlobal()
            ]);

            setIsPurgeActive(isActive);
            setPurgeFeeRaw(fee);
            setPurgeFee(formatLargeNumber(fee));
            setPurgeCD(cd.toNumber());
            setTotalPurged(globalStats[2].toNumber()); // purge is index 2
            setTotalLooted(formatLargeNumber(globalStats[4])); // redist is index 4
            setTotalBurned(formatLargeNumber(globalStats[6])); // burned is index 6

            if (userAddress) {
                try {
                    const [canAttack, lastAttack, userPower] = await Promise.all([
                        battlesContract.canPurge(userAddress),
                        battlesContract.lastPurge(userAddress),
                        battlesContract.getPower(userAddress)
                    ]);
                    
                    setCanPurge(canAttack);
                    setMyBattlePower(userPower[1].toNumber()); // ATK power
                    
                    // Calculate cooldown
                    const cooldownEnds = lastAttack.toNumber() + cd.toNumber();
                    const now = Math.floor(Date.now() / 1000);
                    setCooldownRemaining(cooldownEnds > now ? cooldownEnds - now : 0);
                } catch (e) {
                    console.error("[Purge] User stats error:", e);
                }
            }

            setLastRefresh(Date.now());
        } catch (e) {
            console.error("[Purge] Fetch error:", e);
        }

        setLoading(false);
        fetchingRef.current = false;
    }, [readProvider, userAddress]);

    const fetchTargets = useCallback(async () => {
        if (!readProvider || !isPurgeActive) return;
        setLoadingTargets(true);
        
        try {
            // Try backend first (has clustering)
            let backendData: ClusterInfo[] = [];
            let useOnChain = false;
            let backendTotalStakers = 0;
            
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);
                const res = await fetch(`${WARS_BACKEND_URL}/api/purge/targets`, { signal: controller.signal });
                clearTimeout(timeoutId);
                const data = await res.json();
                
                if (data.success && Array.isArray(data.targets)) {
                    backendTotalStakers = data.totalStakers || 0;
                    console.log("[Purge] Backend returned", data.targets.length, "clusters from", backendTotalStakers, "total stakers");
                    
                    backendData = data.targets.filter((t: any) => 
                        t.address.toLowerCase() !== userAddress?.toLowerCase() &&
                        !t.farms?.every((f: FarmInfo) => f.address.toLowerCase() === userAddress?.toLowerCase())
                    );
                    console.log("[Purge] After self-filter:", backendData.length, "clusters");
                    
                    // If backend says there are many stakers but returned few targets, something's wrong
                    // Fall back to on-chain to get complete data
                    if (backendTotalStakers > 20 && backendData.length < backendTotalStakers * 0.5) {
                        console.log("[Purge] Backend returned too few targets, falling back to on-chain");
                        useOnChain = true;
                        backendData = [];
                    }
                }
            } catch (e: any) {
                if (e.name !== 'AbortError') {
                    console.log("[Purge] Backend unavailable, fetching on-chain:", e.message);
                }
                useOnChain = true;
            }
            
            // If no backend data or forced on-chain, fetch on-chain (without clustering)
            if (backendData.length === 0 || useOnChain) {
                console.log("[Purge] Fetching all stakers on-chain...");
                backendData = []; // Reset to ensure clean data
                try {
                    const stakingContract = new ethers.Contract(V5_STAKING_ADDRESS, STAKING_ABI, readProvider);
                    const totalStakers = await stakingContract.getTotalStakers();
                    const totalCount = totalStakers.toNumber();
                    console.log("[Purge] Total stakers on-chain:", totalCount);
                    
                    const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
                    const addresses: string[] = [];
                    
                    // Batch fetch addresses - increased batch size
                    const BATCH_SIZE = 200;
                    for (let batchStart = 0; batchStart < totalCount; batchStart += BATCH_SIZE) {
                        const batchEnd = Math.min(batchStart + BATCH_SIZE, totalCount);
                        const calls: any[] = [];
                        
                        for (let i = batchStart; i < batchEnd; i++) {
                            calls.push({ target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("getStakerAtIndex", [i]) });
                        }
                        
                        try {
                            const results = await mc.tryAggregate(false, calls);
                            let successCount = 0;
                            for (const r of results) {
                                if (r.success) {
                                    try {
                                        const addr = stakingInterface.decodeFunctionResult("getStakerAtIndex", r.returnData)[0];
                                        if (addr && addr !== ethers.constants.AddressZero && addr.toLowerCase() !== userAddress?.toLowerCase()) {
                                            addresses.push(addr);
                                            successCount++;
                                        }
                                    } catch {}
                                }
                            }
                            console.log(`[Purge] Batch ${batchStart}-${batchEnd}: ${successCount} valid addresses`);
                        } catch (batchErr) {
                            console.warn("[Purge] Batch fetch error at", batchStart, batchErr);
                        }
                    }
                    
                    console.log("[Purge] Found", addresses.length, "valid addresses out of", totalCount, "total");
                    
                    // Fetch stats in batches - increased batch size
                    const STATS_BATCH_SIZE = 50;
                    let stakersWithPlants = 0;
                    
                    for (let batchStart = 0; batchStart < addresses.length; batchStart += STATS_BATCH_SIZE) {
                        const batchAddresses = addresses.slice(batchStart, batchStart + STATS_BATCH_SIZE);
                        const statsCalls: any[] = [];
                        
                        for (const addr of batchAddresses) {
                            statsCalls.push(
                                { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("getUserBattleStats", [addr]) },
                                { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("pending", [addr]) },
                                { target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("getPower", [addr]) }
                            );
                        }
                        
                        try {
                            const statsResults = await mc.tryAggregate(false, statsCalls);
                            
                            for (let i = 0; i < batchAddresses.length; i++) {
                                const baseIdx = i * 3;
                                let plants = 0, lands = 0, superLands = 0, avgHealth = 0, pendingRaw = 0, power = 0;
                                
                                if (statsResults[baseIdx]?.success) {
                                    const stats = stakingInterface.decodeFunctionResult("getUserBattleStats", statsResults[baseIdx].returnData);
                                    plants = stats[0].toNumber();
                                    lands = stats[1].toNumber();
                                    superLands = stats[2].toNumber();
                                    avgHealth = stats[3].toNumber();
                                }
                                
                                if (statsResults[baseIdx + 1]?.success) {
                                    const pending = stakingInterface.decodeFunctionResult("pending", statsResults[baseIdx + 1].returnData)[0];
                                    pendingRaw = parseFloat(ethers.utils.formatUnits(pending, 18));
                                }
                                
                                if (statsResults[baseIdx + 2]?.success) {
                                    const powerResult = battlesInterface.decodeFunctionResult("getPower", statsResults[baseIdx + 2].returnData);
                                    power = powerResult[2].toNumber(); // DEF power
                                }
                                
                                if (plants > 0) {
                                    stakersWithPlants++;
                                    // Create single-farm cluster for on-chain fallback
                                    const farm: FarmInfo = {
                                        address: batchAddresses[i],
                                        plants,
                                        lands,
                                        superLands,
                                        avgHealth,
                                        pendingRewards: formatLargeNumber(pendingRaw),
                                        pendingRaw,
                                        battlePower: power,
                                        hasShield: false,
                                        shieldExpiry: 0
                                    };
                                    
                                    backendData.push({
                                        address: batchAddresses[i],
                                        farms: [farm],
                                        totalPlants: plants,
                                        totalLands: lands,
                                        totalSuperLands: superLands,
                                        totalPendingRaw: pendingRaw,
                                        pendingRewards: formatLargeNumber(pendingRaw),
                                        avgHealth,
                                        battlePower: power,
                                        hasShield: false,
                                        isCluster: false
                                    });
                                }
                            }
                        } catch (statsBatchErr) {
                            console.warn("[Purge] Stats batch error at", batchStart, statsBatchErr);
                        }
                    }
                    console.log("[Purge] On-chain fetch complete:", stakersWithPlants, "stakers with plants out of", addresses.length, "addresses");
                } catch (e) {
                    console.error("[Purge] On-chain fetch error:", e);
                }
            }
            
            // Sort by total pending rewards (highest first)
            // Sort by total plants (highest first)
            backendData.sort((a, b) => (b.totalPlants || b.plants || 0) - (a.totalPlants || a.plants || 0));
            
            // Smart update: Only update state if data actually changed (prevents UI flashing)
            const createFingerprint = (list: ClusterInfo[]) => list.map(c => 
                `${c.address}:${c.totalPlants}:${c.hasShield}:${Math.floor(c.totalPendingRaw)}:${c.farms.length}`
            ).join('|');
            
            const newFingerprint = createFingerprint(backendData);
            
            setClusters(prev => {
                const oldFingerprint = createFingerprint(prev);
                if (oldFingerprint === newFingerprint && prev.length === backendData.length) {
                    // Data unchanged, keep old reference to prevent re-render/flash
                    return prev;
                }
                console.log("[Purge] Data changed, updating list. Clusters:", backendData.length);
                return backendData;
            });
            
        } catch (e) {
            console.error("[Purge] Fetch targets error:", e);
        }
        
        setLoadingTargets(false);
    }, [readProvider, isPurgeActive, userAddress]);

    useEffect(() => {
        if (!readProvider) return;
        fetchPurgeData();
        // 15 second background refresh - BattleEventToast provides instant live updates when battles happen
        const refreshInterval = setInterval(fetchPurgeData, 15000);
        return () => clearInterval(refreshInterval);
    }, [fetchPurgeData, readProvider]);

    useEffect(() => {
        if (isPurgeActive) fetchTargets();
    }, [isPurgeActive, fetchTargets]);

    // Cooldown timer
    useEffect(() => {
        if (cooldownRemaining > 0) {
            const timer = setInterval(() => {
                setCooldownRemaining(prev => Math.max(0, prev - 1));
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [cooldownRemaining]);

    const handleSelectCluster = (cluster: ClusterInfo) => {
        if (cluster.isCluster) {
            // Toggle dropdown for clusters
            setExpandedCluster(expandedCluster === cluster.address ? null : cluster.address);
        } else {
            // Single farm - select directly
            setSelectedCluster(cluster);
            setSelectedFarm(cluster.farms[0]);
            setShowAttackModal(true);
        }
    };

    const handleSelectFarm = (cluster: ClusterInfo, farm: FarmInfo) => {
        setSelectedCluster(cluster);
        setSelectedFarm(farm);
        setShowAttackModal(true);
    };

    const handlePurgeAttack = async () => {
        if (!connected || !selectedFarm || cooldownRemaining > 0) return;
        
        setAttacking(true);
        setStatus("Checking allowance...");

        try {
            // Ensure allowance
            const hasAllowance = await ensureAllowance(V5_BATTLES_ADDRESS, purgeFeeRaw);
            if (!hasAllowance) {
                setStatus("Approval needed");
                setAttacking(false);
                return;
            }

            setStatus("Confirm in wallet...");
            
            const attackData = battlesInterface.encodeFunctionData("purgeAttack", [selectedFarm.address]);
            const tx = await sendContractTx(V5_BATTLES_ADDRESS, attackData, "0x1E8480"); // 2M gas

            if (!tx) {
                setStatus("Transaction rejected");
                setAttacking(false);
                return;
            }

            setStatus("Purging...");
            
            // Wait for transaction with timeout (2 minutes max for mobile)
            const purgeReceiptPromise = tx.wait();
            const purgeTimeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Transaction timeout")), 120000)
            );
            
            let receipt;
            try {
                receipt = await Promise.race([purgeReceiptPromise, purgeTimeoutPromise]) as any;
            } catch (waitErr: any) {
                if (waitErr?.message?.includes("timeout")) {
                    setStatus("Transaction timed out. Check your wallet for result.");
                    // Try to get receipt from provider
                    if (tx.hash && readProvider) {
                        try {
                            receipt = await readProvider.getTransactionReceipt(tx.hash);
                        } catch {}
                    }
                    if (!receipt) {
                        setAttacking(false);
                        return;
                    }
                } else {
                    throw waitErr;
                }
            }
            
            // Check if transaction actually succeeded
            if (receipt.status === 0) {
                console.error("[Purge] Transaction reverted on-chain");
                setStatus("Transaction failed - check cooldown or allowance");
                setAttacking(false);
                return;
            }
            
            // Parse PurgeResult event
            let won = false;
            let stolenAmount = "0";
            let damage = 0;
            let foundEvent = false;

            // First try parsing from receipt.logs
            for (const log of receipt.logs) {
                try {
                    const parsed = battlesInterface.parseLog(log);
                    if (parsed.name === "PurgeResult") {
                        won = parsed.args.w;
                        stolenAmount = formatLargeNumber(parsed.args.s);
                        damage = parsed.args.dmg.toNumber();
                        foundEvent = true;
                        console.log("[Purge] Event found:", { won, stolenAmount, damage });
                        break;
                    }
                } catch {}
            }
            
            // If not found, try fetching receipt from provider (some wallets don't return full logs)
            if (!foundEvent && readProvider && tx.hash) {
                try {
                    console.log("[Purge] Fetching receipt from provider for tx:", tx.hash);
                    const fullReceipt = await readProvider.getTransactionReceipt(tx.hash);
                    if (fullReceipt && fullReceipt.logs) {
                        for (const log of fullReceipt.logs) {
                            try {
                                const parsed = battlesInterface.parseLog(log);
                                if (parsed.name === "PurgeResult") {
                                    won = parsed.args.w;
                                    stolenAmount = formatLargeNumber(parsed.args.s);
                                    damage = parsed.args.dmg.toNumber();
                                    foundEvent = true;
                                    console.log("[Purge] Event found from provider:", { won, stolenAmount, damage });
                                    break;
                                }
                            } catch {}
                        }
                    }
                } catch (e) {
                    console.error("[Purge] Failed to fetch receipt from provider:", e);
                }
            }
            
            if (!foundEvent) {
                console.warn("[Purge] PurgeResult event not found in logs!");
            }

            setAttackResult({ won, amount: stolenAmount, damage });
            setShowAttackModal(false);
            setShowResultModal(true);
            setStatus("");
            
            // Refresh data
            fetchPurgeData();
            fetchTargets();
            refreshData();

        } catch (err: any) {
            console.error("[Purge] Attack error:", err);
            const msg = err?.reason || err?.message || "Attack failed";
            if (msg.includes("!cd")) {
                setStatus("Still on cooldown!");
            } else if (msg.includes("rejected") || msg.includes("denied")) {
                setStatus("Transaction rejected");
            } else {
                setStatus(msg.slice(0, 50));
            }
        }

        setAttacking(false);
    };

    const closeResultModal = () => {
        setShowResultModal(false);
        setAttackResult(null);
        setSelectedCluster(null);
        setSelectedFarm(null);
    };

    // Theme colors
    const isDark = theme === "dark";
    const bgMain = isDark ? "#0a0e1a" : "#f3f4f6";
    const cardBg = isDark ? "rgba(30,34,52,0.95)" : "rgba(255,255,255,0.95)";
    const textPrimary = isDark ? "#e2e8f0" : "#1e293b";
    const textMuted = isDark ? "#94a3b8" : "#64748b";
    const borderColor = isDark ? "rgba(100,116,139,0.3)" : "rgba(100,116,139,0.2)";
    const modalBg = isDark ? "#1e2235" : "#ffffff";

    const paginatedClusters = clusters.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    const totalPages = Math.ceil(clusters.length / ITEMS_PER_PAGE);

    return (
        <div style={{ padding: 16 }}>
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#dc2626", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <span>🔪 THE PURGE</span>
                    {loading ? (
                        <span style={{ 
                            fontSize: 11, 
                            fontWeight: 600, 
                            color: textMuted, 
                            background: cardBg, 
                            padding: "4px 12px", 
                            borderRadius: 6,
                            border: `1px solid ${borderColor}`
                        }}>
                            ⏳ LOADING...
                        </span>
                    ) : !isPurgeActive ? (
                        <span style={{ 
                            fontSize: 11, 
                            fontWeight: 600, 
                            color: "#6b7280", 
                            background: "rgba(107,114,128,0.15)", 
                            padding: "4px 12px", 
                            borderRadius: 6,
                            border: "1px solid rgba(107,114,128,0.3)"
                        }}>
                            🔒 INACTIVE
                        </span>
                    ) : (
                        <span style={{ 
                            fontSize: 11, 
                            fontWeight: 700, 
                            color: "#fff", 
                            background: "linear-gradient(135deg, #dc2626, #991b1b)", 
                            padding: "4px 12px", 
                            borderRadius: 6,
                            animation: "activePulse 1.5s ease-in-out infinite",
                            boxShadow: "0 0 12px rgba(220,38,38,0.6)"
                        }}>
                            🔴 ACTIVE
                        </span>
                    )}
                </div>
                <div style={{ fontSize: 11, color: textMuted }}>No shields. No mercy. Attack anyone.</div>
            </div>

            {/* Stats - Unified box like DEA Raids */}
            <div style={{ background: cardBg, borderRadius: 10, padding: 12, marginBottom: 16, border: `1px solid ${borderColor}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: textMuted }}>TOTAL PURGES</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#dc2626" }}>{totalPurged}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: textMuted }}>BURNED 🔥</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#f97316" }}>{totalBurned}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: textMuted }}>YOUR COOLDOWN</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: cooldownRemaining > 0 ? "#fbbf24" : "#10b981" }}>
                            {cooldownRemaining > 0 ? formatCooldown(cooldownRemaining) : "Ready"}
                        </div>
                    </div>
                </div>
            </div>

            {/* Targets List */}
            {loading ? (
                <div style={{ textAlign: "center", padding: 40, color: textMuted }}>Loading...</div>
            ) : !isPurgeActive ? (
                <div style={{ textAlign: "center", padding: 20, color: textMuted }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
                    <div style={{ fontSize: 12 }}>The Purge is not currently active.</div>
                    <div style={{ fontSize: 10, marginTop: 4 }}>Check back during chaos events!</div>
                </div>
            ) : (
                <>
                    {/* Ranked By Note */}
                    <div style={{ textAlign: "center", marginBottom: 10, fontSize: 10, color: textMuted, fontStyle: "italic" }}>
                        (RANKED BY NUMBER OF PLANTS)
                    </div>
                    
                    {/* Cluster/Target List */}
                    {loadingTargets ? (
                        <div style={{ textAlign: "center", padding: 40, color: textMuted }}>Loading targets...</div>
                    ) : clusters.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 40, color: textMuted }}>No targets found</div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {paginatedClusters.map((cluster) => (
                                <div key={cluster.address}>
                                    {/* Cluster/Target Row */}
                                    <div
                                        onClick={() => handleSelectCluster(cluster)}
                                        style={{
                                            background: cardBg,
                                            borderRadius: cluster.isCluster && expandedCluster === cluster.address ? "10px 10px 0 0" : 10,
                                            padding: "12px 14px",
                                            border: `1px solid ${borderColor}`,
                                            borderBottom: cluster.isCluster && expandedCluster === cluster.address ? "none" : `1px solid ${borderColor}`,
                                            cursor: "pointer"
                                        }}
                                    >
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                                    <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: textPrimary }}>
                                                        {cluster.name || shortAddr(cluster.address)}
                                                    </span>
                                                    {cluster.isCluster && (
                                                        <span style={{ fontSize: 9, background: "rgba(139,92,246,0.2)", color: "#a78bfa", padding: "2px 6px", borderRadius: 4 }}>
                                                            {cluster.farms.length} farms {expandedCluster === cluster.address ? "▲" : "▼"}
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: textMuted }}>
                                                    <span>{cluster.totalPlants} 🌿</span>
                                                    <span style={{ color: getHealthColor(cluster.avgHealth) }}>{cluster.avgHealth}% ❤️</span>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: "right" }}>
                                                <div style={{ fontSize: 10, color: textMuted }}>⚔️ {cluster.battlePower}</div>
                                                <div style={{ padding: "3px 8px", background: "rgba(251,191,36,0.15)", borderRadius: 6, marginTop: 4 }}>
                                                    <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700 }}>💎 {cluster.pendingRewards}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded Farm List for Clusters */}
                                    {cluster.isCluster && expandedCluster === cluster.address && (
                                        <div style={{ 
                                            background: isDark ? "rgba(20,24,36,0.95)" : "rgba(240,240,240,0.95)", 
                                            borderRadius: "0 0 10px 10px",
                                            border: `1px solid ${borderColor}`,
                                            borderTop: "none",
                                            padding: "8px"
                                        }}>
                                            {cluster.farms.map((farm, idx) => (
                                                <button
                                                    key={farm.address}
                                                    onClick={(e) => { e.stopPropagation(); handleSelectFarm(cluster, farm); }}
                                                    style={{
                                                        width: "100%",
                                                        display: "flex",
                                                        justifyContent: "space-between",
                                                        alignItems: "center",
                                                        padding: "10px 12px",
                                                        background: idx % 2 === 0 ? "rgba(100,116,139,0.1)" : "transparent",
                                                        border: "none",
                                                        borderRadius: 6,
                                                        cursor: "pointer",
                                                        marginBottom: idx < cluster.farms.length - 1 ? 4 : 0
                                                    }}
                                                >
                                                    <div style={{ textAlign: "left" }}>
                                                        <div style={{ fontFamily: "monospace", fontSize: 11, color: textPrimary }}>
                                                            {shortAddr(farm.address)}
                                                        </div>
                                                        <div style={{ fontSize: 10, color: textMuted }}>
                                                            {farm.plants} 🌿 • <span style={{ color: getHealthColor(farm.avgHealth) }}>{farm.avgHealth}%</span>
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: "right" }}>
                                                        <div style={{ fontSize: 10, color: textMuted }}>⚔️ {farm.battlePower}</div>
                                                        <div style={{ fontSize: 11, color: "#fbbf24", fontWeight: 600 }}>💎 {farm.pendingRewards}</div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ padding: "6px 12px", fontSize: 11, borderRadius: 6, border: `1px solid ${borderColor}`, background: "transparent", color: textMuted, cursor: currentPage === 1 ? "not-allowed" : "pointer" }}>Prev</button>
                            <span style={{ padding: "6px 12px", fontSize: 11, color: textMuted }}>{currentPage} / {totalPages}</span>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ padding: "6px 12px", fontSize: 11, borderRadius: 6, border: `1px solid ${borderColor}`, background: "transparent", color: textMuted, cursor: currentPage === totalPages ? "not-allowed" : "pointer" }}>Next</button>
                        </div>
                    )}
                </>
            )}

            {status && (
                <div style={{ fontSize: 10, color: "#fbbf24", textAlign: "center", marginTop: 12 }}>{status}</div>
            )}

            {/* Attack Modal */}
            {showAttackModal && selectedFarm && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
                    <div style={{ background: modalBg, borderRadius: 16, padding: 20, maxWidth: 380, width: "100%", border: `1px solid ${borderColor}` }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#dc2626", marginBottom: 16, textAlign: "center" }}>🔪 PURGE ATTACK</div>
                        
                        {/* Cluster info if applicable */}
                        {selectedCluster?.isCluster && (
                            <div style={{ fontSize: 10, color: "#a78bfa", textAlign: "center", marginBottom: 8 }}>
                                Attacking farm from {selectedCluster.name || shortAddr(selectedCluster.address)}'s cluster
                            </div>
                        )}
                        
                        <div style={{ background: "rgba(220,38,38,0.1)", borderRadius: 8, padding: 12, marginBottom: 16, textAlign: "center" }}>
                            <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 600, color: textPrimary }}>{shortAddr(selectedFarm.address)}</div>
                            <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>
                                {selectedFarm.plants} 🌿 • {selectedFarm.avgHealth}% ❤️ • {selectedFarm.pendingRewards} pending
                            </div>
                        </div>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                            <div style={{ background: "rgba(16,185,129,0.1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: textMuted }}>YOUR POWER</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: "#10b981" }}>{myBattlePower}</div>
                            </div>
                            <div style={{ background: "rgba(239,68,68,0.1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: textMuted }}>THEIR POWER</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: "#ef4444" }}>{selectedFarm.battlePower}</div>
                            </div>
                        </div>
                        
                        <div style={{ background: "rgba(251,191,36,0.1)", borderRadius: 8, padding: 8, marginBottom: 16, textAlign: "center" }}>
                            <span style={{ fontSize: 10, color: "#fbbf24" }}>Fee: <b>{purgeFee}</b> (100% BURNED 🔥)</span>
                        </div>
                        
                        <div style={{ display: "flex", gap: 10 }}>
                            <button onClick={() => { setShowAttackModal(false); setSelectedFarm(null); setSelectedCluster(null); }} disabled={attacking} style={{ flex: 1, padding: "12px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: `1px solid ${borderColor}`, background: "transparent", color: textMuted, cursor: "pointer" }}>Cancel</button>
                            <button onClick={handlePurgeAttack} disabled={attacking || cooldownRemaining > 0 || myBattlePower === 0} style={{ flex: 2, padding: "12px", fontSize: 13, fontWeight: 700, borderRadius: 8, border: "none", background: (attacking || cooldownRemaining > 0 || myBattlePower === 0) ? "#374151" : "linear-gradient(135deg, #dc2626, #991b1b)", color: "#fff", cursor: (attacking || cooldownRemaining > 0 || myBattlePower === 0) ? "not-allowed" : "pointer" }}>
                                {attacking ? "Attacking..." : cooldownRemaining > 0 ? `⏳ ${formatCooldown(cooldownRemaining)}` : myBattlePower === 0 ? "⚠️ No Power" : "🔪 PURGE"}
                            </button>
                        </div>
                        
                        {status && <div style={{ fontSize: 10, color: "#fbbf24", marginTop: 10, textAlign: "center" }}>{status}</div>}
                    </div>
                </div>
            )}

            {/* Result Modal */}
            {showResultModal && attackResult && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
                    <div style={{ background: modalBg, borderRadius: 16, padding: 24, maxWidth: 340, width: "100%", border: `2px solid ${attackResult.won ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)"}`, textAlign: "center" }}>
                        <div style={{ fontSize: 56, marginBottom: 12 }}>{attackResult.won ? "🔥" : "💀"}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: attackResult.won ? "#10b981" : "#ef4444", marginBottom: 16 }}>{attackResult.won ? "PURGED!" : "DEFEATED"}</div>
                        {attackResult.won ? (
                            <div style={{ background: "rgba(16,185,129,0.1)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                                <div style={{ fontSize: 11, color: textMuted }}>Looted</div>
                                <div style={{ fontSize: 28, fontWeight: 700, color: "#10b981" }}>{attackResult.amount}</div>
                                <div style={{ fontSize: 10, color: textMuted, marginTop: 8 }}>Damage dealt: {attackResult.damage}%</div>
                            </div>
                        ) : (
                            <div style={{ background: "rgba(239,68,68,0.1)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                                <div style={{ fontSize: 11, color: textMuted }}>They looted YOU</div>
                                <div style={{ fontSize: 28, fontWeight: 700, color: "#ef4444" }}>{attackResult.amount}</div>
                                <div style={{ fontSize: 10, color: textMuted, marginTop: 8 }}>Damage taken: {attackResult.damage}%</div>
                            </div>
                        )}
                        <button onClick={closeResultModal} style={{ width: "100%", padding: "12px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "linear-gradient(135deg, #dc2626, #991b1b)", color: "#fff", cursor: "pointer" }}>Continue</button>
                    </div>
                </div>
            )}
            
            <style>{`
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                @keyframes activePulse { 
                    0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 10px rgba(220,38,38,0.5); } 
                    50% { opacity: 0.8; transform: scale(1.05); box-shadow: 0 0 20px rgba(220,38,38,0.8); } 
                }
            `}</style>
        </div>
    );
}
