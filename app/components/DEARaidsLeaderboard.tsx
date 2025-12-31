"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { V5_BATTLES_ADDRESS, WARS_BACKEND_URL, MULTICALL3_ADDRESS, V5_STAKING_ADDRESS, V5_ITEMSHOP_ADDRESS } from "../lib/constants";

const MULTICALL3_ABI = ["function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])"];

// V3 BATTLES ABI (SLIM CONTRACT)
const BATTLES_ABI = [
    "function deaRaid(address target) external",
    "function flagWithSig(address suspect, uint256 soldAmount, uint256 deadline, bytes signature) external",
    "function deaFee() view returns (uint256)",
    "function deaOn() view returns (bool)",
    "function deaTargetImm() view returns (uint256)",
    "function deaTargetCD() view returns (uint256)",
    "function getAtkStats(address) view returns (uint256 wins, uint256 losses, uint256 stolen, uint256 nukes)",
    "function getDefStats(address) view returns (uint256 wins, uint256 losses, uint256 lost, bool hasShield)",
    "function getGlobal() view returns (uint256 cartel, uint256 dea, uint256 purge, uint256 flagged, uint256 redist, uint256 fees, uint256 burned)",
    "function getSuspect(address) view returns (bool isSuspect, uint256 expiresAt, uint256 raids, uint256 lost, uint256 sold, uint256 cnt)",
    "function suspects(address) view returns (bool is_, uint256 flagAt, uint256 sellAt, uint256 raidAt, uint256 raids, uint256 lost, uint256 sold, uint256 cnt)",
    "function canDea(address) view returns (bool)",
    "function canDeaTarget(address,address) view returns (bool)",
    "function canRaid(address) view returns (bool)",
    "function lastDea(address) view returns (uint256)",
    "function lastDeaOn(address,address) view returns (uint256)",
    "function getPower(address) view returns (uint256 base, uint256 atk, uint256 def)",
    "event DeaResult(address indexed a, address indexed t, bool w, uint256 ap, uint256 dp, uint256 s, uint256 dmg)"
];

const STAKING_ABI = [
    "function hasRaidShield(address) view returns (bool)",
    "function getUserBattleStats(address) view returns (uint256 plants, uint256 lands, uint256 superLands, uint256 avgHealth, uint256 pendingRewards)",
    "function calculateBattlePower(address) view returns (uint256)",
    "function pending(address) view returns (uint256)"
];

// ItemShop ABI for Nuke and Shield check
const ITEMSHOP_ABI = [
    "function hasActiveNukeReady(address) view returns (bool)",
    "function nukeExpiry(address) view returns (uint256)",
    "function shieldExpiry(address) view returns (uint256)"
];

const battlesInterface = new ethers.utils.Interface(BATTLES_ABI);
const stakingInterface = new ethers.utils.Interface(STAKING_ABI);
const itemShopInterface = new ethers.utils.Interface(ITEMSHOP_ABI);

type FarmInfo = { address: string; plants: number; avgHealth: number; pendingRewards: string; pendingRaw: number; hasShield: boolean; hasImmunity: boolean; canAttack: boolean; battlePower: number; targetImmunityEnds: number; immunityEndsAt: number; myAttackCooldownEnds: number; shieldExpiryTime: number; };
type JeetEntry = { address: string; totalSold: string; sellCount: number; lastSellTimestamp: number; expiresAt: number; hasShield: boolean; source: "onchain" | "backend" | "both"; needsFlagging: boolean; plants: number; avgHealth: number; battlePower: number; isCluster: boolean; farms: FarmInfo[]; totalPlants: number; totalPendingRaw: number; targetImmunityEnds: number; immunityEndsAt: number; myAttackCooldownEnds: number; hasRaidableFarm: boolean; hasImmunity: boolean; shieldExpiryTime: number; };
type TargetInfo = { address: string; pendingRewards: string; plants: number; avgHealth: number; battlePower: number; hasShield: boolean; hasImmunity: boolean; immunityEndsAt: number; attackerPower: number; winChance: number; needsFlagging: boolean; farms: FarmInfo[]; shieldExpiryTime: number; };
type ActiveTargeting = { targetAddress: string; attackerAddress: string; farmAddress?: string; timestamp: number; isAttacking: boolean; };
type Props = { connected: boolean; userAddress: string | null; theme: "light" | "dark"; readProvider: ethers.providers.Provider | null; sendContractTx: (to: string, data: string, gasLimit?: string) => Promise<ethers.providers.TransactionResponse | null>; ensureAllowance: (spender: string, amount: ethers.BigNumber) => Promise<boolean>; refreshData: () => void; };

const ITEMS_PER_PAGE = 10;
const SUSPECT_EXPIRY = 24 * 60 * 60;
const TARGET_IMMUNITY = 2 * 60 * 60; // 2 hour immunity after being raided
const PER_TARGET_COOLDOWN = 21600; // 6 hour per-target cooldown (matches contract deaTargetCD)
const TARGETING_POLL_INTERVAL = 3000;
const TARGETING_TIMEOUT = 120000;

export function DEARaidsLeaderboard({ connected, userAddress, theme, readProvider, sendContractTx, ensureAllowance, refreshData }: Props) {
    const [jeets, setJeets] = useState<JeetEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalRaids, setTotalRaids] = useState(0);
    const [totalSeized, setTotalSeized] = useState("0");
    const [raidFee, setRaidFee] = useState("100K");
    const [raidFeeRaw, setRaidFeeRaw] = useState<ethers.BigNumber>(ethers.utils.parseUnits("100000", 18));
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
    const [lastRefresh, setLastRefresh] = useState(Math.floor(Date.now() / 1000));
    const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
    const [activeTargetings, setActiveTargetings] = useState<ActiveTargeting[]>([]);
    const [playerStats, setPlayerStats] = useState<{ wins: number; losses: number; stolen: string } | null>(null);
    const [canUserRaid, setCanUserRaid] = useState(false);
    
    const fetchingRef = useRef(false);
    const targetingPollRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => { const timer = setInterval(() => setCurrentTime(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(timer); }, []);

    const pollActiveTargetings = useCallback(async () => {
        try {
            const response = await fetch(`${WARS_BACKEND_URL}/api/dea/targeting/active`);
            if (response.ok) { const data = await response.json(); if (data.success && Array.isArray(data.targetings)) { const now = Date.now(); setActiveTargetings(data.targetings.filter((t: ActiveTargeting) => now - t.timestamp < TARGETING_TIMEOUT)); } }
        } catch {}
    }, []);

    const registerTargeting = useCallback(async (jeetAddress: string, farmAddress?: string, isAttacking: boolean = false) => {
        if (!userAddress) return;
        try { await fetch(`${WARS_BACKEND_URL}/api/dea/targeting/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetAddress: jeetAddress, attackerAddress: userAddress, farmAddress, isAttacking, timestamp: Date.now() }) }); } catch {}
    }, [userAddress]);

    const clearTargeting = useCallback(async (jeetAddress: string) => {
        if (!userAddress) return;
        try { await fetch(`${WARS_BACKEND_URL}/api/dea/targeting/clear`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetAddress: jeetAddress, attackerAddress: userAddress }) }); } catch {}
    }, [userAddress]);

    useEffect(() => { pollActiveTargetings(); targetingPollRef.current = setInterval(pollActiveTargetings, TARGETING_POLL_INTERVAL); return () => { if (targetingPollRef.current) clearInterval(targetingPollRef.current); }; }, [pollActiveTargetings]);

    const getTargetingInfo = useCallback((jeetAddress: string) => {
        const addr = jeetAddress.toLowerCase();
        const targeters = activeTargetings.filter(t => t.targetAddress.toLowerCase() === addr && t.attackerAddress.toLowerCase() !== userAddress?.toLowerCase());
        const uniqueAttackers = [...new Set(targeters.map(t => t.attackerAddress))];
        return { count: uniqueAttackers.length, attackers: uniqueAttackers, hasActiveAttack: targeters.some(t => t.isAttacking) };
    }, [activeTargetings, userAddress]);

    const now = currentTime;
    // Show jeets that have plants - they can always be flagged/raided if they have pending rewards
    const activeJeets = jeets.filter(j => j.totalPlants > 0 && j.totalPendingRaw > 0);
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

    const parseFormattedNumber = (str: string): number => {
        if (!str || str === "0") return 0;
        const num = parseFloat(str.replace(/,/g, ''));
        if (str.endsWith('B')) return num * 1e9;
        if (str.endsWith('M')) return num * 1e6;
        if (str.endsWith('K')) return num * 1e3;
        return num;
    };

    const formatTimeRemaining = (expiresAt: number, needsFlagging?: boolean): string => {
        if (needsFlagging) return "Pending Flag";
        if (expiresAt === 0) return "—";
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
    
    // Format shield timer - more detailed for shield display
    const formatShieldTimer = (expiryTimestamp: number): string => {
        const remaining = expiryTimestamp - now;
        if (remaining <= 0) return "";
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
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
        
        // Safety timeout - reset fetchingRef after 8 seconds max
        const safetyTimeout = setTimeout(() => {
            fetchingRef.current = false;
            setIsAutoRefreshing(false);
        }, 8000);
        
        try {
            const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, BATTLES_ABI, readProvider);
            const stakingContract = new ethers.Contract(V5_STAKING_ADDRESS, STAKING_ABI, readProvider);
            
            try {
                // V3: deaFee() and getGlobal()
                const [fee, globalStats] = await Promise.all([battlesContract.deaFee(), battlesContract.getGlobal()]);
                setRaidFeeRaw(fee); setRaidFee(formatLargeNumber(fee)); setTotalRaids(globalStats[1].toNumber()); // dea is index 1
                setTotalSeized(formatLargeNumber(globalStats[4])); // redist is index 4
            } catch (e) { console.error("[DEA] Stats error:", e); }
            
            if (userAddress) {
                try {
                    // V3: getAtkStats() for unified attack stats, canDea() for cooldown check
                    // Use getPower from Battles contract - it includes ItemShop boosts!
                    const itemShopContract = new ethers.Contract(V5_ITEMSHOP_ADDRESS, ITEMSHOP_ABI, readProvider);
                    const [atkStats, fullPower, canAttack, lastAttack, hasNuke] = await Promise.all([
                        battlesContract.getAtkStats(userAddress), 
                        battlesContract.getPower(userAddress), // Returns (base, atk, def) - atk includes boosts!
                        battlesContract.canDea(userAddress),
                        battlesContract.lastDea(userAddress),
                        itemShopContract.hasActiveNukeReady(userAddress).catch(() => false) // Check for active Nuke
                    ]);
                    
                    // Store whether user can raid
                    setCanUserRaid(canAttack);
                    console.log("[DEA] canDea check:", canAttack, "for user:", userAddress);
                    
                    // Calculate cooldown remaining
                    const deaCD = 7200; // 2 hour general cooldown between any DEA raid
                    const cooldownEnds = lastAttack.toNumber() + deaCD;
                    const remaining = cooldownEnds > now ? cooldownEnds - now : 0;
                    setCooldownRemaining(remaining);
                    
                    // Use ATK power (index 1) which includes boosts from ItemShop
                    // BUT: getPower doesn't include Nuke boost! Nuke = 101x multiplier
                    let power = fullPower[1].toNumber();
                    if (hasNuke) {
                        power = Math.floor(power * 101); // Nuke gives +10000% = 101x
                        console.log("[DEA] Nuke active! Power boosted to:", power);
                    }
                    setMyBattlePower(power);
                    
                    setPlayerStats({
                        wins: atkStats[0].toNumber(),
                        losses: atkStats[1].toNumber(),
                        stolen: formatLargeNumber(atkStats[2])
                    });
                } catch (e) { console.error("[DEA] User stats error:", e); }
            }
            
            let backendData: any[] = [];
            try { 
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
                const res = await fetch(`${WARS_BACKEND_URL}/api/dea/jeets`, { signal: controller.signal }); 
                clearTimeout(timeoutId);
                const data = await res.json(); 
                console.log("[DEA] Backend response:", { success: data.success, jeetsCount: data.jeets?.length, immunities: Object.keys(data.immunities || {}).length });
                // Log any farms with immunity
                if (data.jeets) {
                    const farmsWithImmunity = data.jeets.flatMap((j: any) => (j.farms || []).filter((f: any) => f.hasImmunity || f.immunityEndsAt > 0));
                    if (farmsWithImmunity.length > 0) {
                        console.log("[DEA] Farms with immunity from backend:", farmsWithImmunity.map((f: any) => ({ addr: f.address?.slice(0,10), immunityEndsAt: f.immunityEndsAt })));
                    }
                }
                if (data.success && Array.isArray(data.jeets)) backendData = data.jeets; 
            } catch (e: any) { 
                if (e.name !== 'AbortError') console.error("[DEA] Backend error:", e); 
            }
            
            // Fetch shield expiry times for all unique addresses via multicall
            const allAddresses = new Set<string>();
            for (const j of backendData) {
                allAddresses.add(j.address);
                if (j.farms && Array.isArray(j.farms)) {
                    j.farms.forEach((f: any) => allAddresses.add(f.address));
                }
            }
            
            const shieldExpiryMap: { [addr: string]: number } = {};
            if (allAddresses.size > 0) {
                try {
                    const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
                    const addressArray = Array.from(allAddresses);
                    const shieldCalls = addressArray.map(addr => ({
                        target: V5_ITEMSHOP_ADDRESS,
                        callData: itemShopInterface.encodeFunctionData("shieldExpiry", [addr])
                    }));
                    
                    const shieldResults = await mc.tryAggregate(false, shieldCalls);
                    
                    addressArray.forEach((addr, i) => {
                        if (shieldResults[i]?.success) {
                            try {
                                const expiry = ethers.BigNumber.from(shieldResults[i].returnData).toNumber();
                                shieldExpiryMap[addr.toLowerCase()] = expiry;
                            } catch {}
                        }
                    });
                } catch (e) { console.error("[DEA] Shield expiry fetch error:", e); }
            }
            
            const processedJeets: JeetEntry[] = [];
            for (const j of backendData) {
                const expiresAt = j.expiresAt || 0;
                // Show both flagged (expiresAt > now) AND unflagged jeets with pending rewards
                const hasPendingRewards = parseFloat(j.pendingRewards || "0") > 0;
                const hasPlants = (j.plants || 0) > 0;
                if (!hasPlants) continue; // Skip if no plants
                
                let farms: FarmInfo[] = [];
                let totalPlants = 0, avgHealthSum = 0;
                
                // Get shield expiry for this jeet's main address
                const jeetShieldExpiry = shieldExpiryMap[j.address.toLowerCase()] || 0;
                
                if (j.farms && Array.isArray(j.farms) && j.farms.length > 0) {
                    farms = j.farms.map((f: any) => {
                        const pendingRaw = parseFloat(f.pendingRewards || "0");
                        const hasPlants = (f.plants || 0) > 0;
                        const hasPending = pendingRaw > 0;
                        const noShield = !f.hasShield;
                        const hasImmunity = f.hasImmunity || false;
                        const immunityEndsAt = f.immunityEndsAt || 0;
                        // Get shield expiry for this farm
                        const farmShieldExpiry = shieldExpiryMap[f.address.toLowerCase()] || 0;
                        // Allow attack if: has plants, has pending, no shield, no immunity
                        const canAttackCalc = hasPlants && hasPending && noShield && !hasImmunity;
                        return { 
                            address: f.address, 
                            plants: f.plants || 0, 
                            avgHealth: f.avgHealth || 0, 
                            pendingRewards: f.pendingRewards || "0", 
                            pendingRaw,
                            hasShield: f.hasShield || false,
                            hasImmunity,
                            immunityEndsAt,
                            canAttack: canAttackCalc, 
                            battlePower: f.battlePower || 0, 
                            targetImmunityEnds: immunityEndsAt, 
                            myAttackCooldownEnds: 0,
                            shieldExpiryTime: farmShieldExpiry
                        };
                    });
                    for (const f of farms) { totalPlants += f.plants; avgHealthSum += f.avgHealth; }
                } else {
                    const pendingRaw = parseFloat(j.pendingRewards || "0");
                    const hasPlants = (j.plants || 0) > 0;
                    const hasPending = pendingRaw > 0;
                    const noShield = !j.hasShield;
                    const hasImmunity = j.hasImmunity || false;
                    const immunityEndsAt = j.immunityEndsAt || 0;
                    const canAttackCalc = hasPlants && hasPending && noShield && !hasImmunity;
                    farms = [{ 
                        address: j.address, 
                        plants: j.plants || 0, 
                        avgHealth: j.avgHealth || 0, 
                        pendingRewards: j.pendingRewards || "0", 
                        pendingRaw,
                        hasShield: j.hasShield || false,
                        hasImmunity,
                        immunityEndsAt,
                        canAttack: canAttackCalc, 
                        battlePower: 0, 
                        targetImmunityEnds: immunityEndsAt, 
                        myAttackCooldownEnds: 0,
                        shieldExpiryTime: jeetShieldExpiry
                    }];
                    totalPlants = farms[0].plants; avgHealthSum = farms[0].avgHealth;
                }
                
                // Calculate total pending from all farms
                const totalPendingRaw = farms.reduce((sum, f) => sum + (f.pendingRaw || 0), 0);
                
                // Get max immunity time from all farms in cluster
                const clusterImmunityEndsAt = j.immunityEndsAt || Math.max(...farms.map(f => f.immunityEndsAt || 0), 0);
                
                // Get max shield expiry from all farms in cluster
                const clusterShieldExpiry = Math.max(jeetShieldExpiry, ...farms.map(f => f.shieldExpiryTime || 0));
                
                processedJeets.push({ 
                    address: j.address, 
                    totalSold: j.totalSold || "0", 
                    sellCount: j.sellCount || 1, 
                    lastSellTimestamp: j.lastSellTimestamp || 0, 
                    expiresAt, 
                    hasShield: j.hasShield || false, 
                    hasImmunity: j.hasImmunity || farms.some(f => f.hasImmunity),
                    immunityEndsAt: clusterImmunityEndsAt,
                    source: j.isFlagged ? "onchain" : "backend", 
                    needsFlagging: !j.isFlagged, 
                    plants: totalPlants, 
                    avgHealth: farms.length > 0 ? Math.round(avgHealthSum / farms.length) : 0, 
                    battlePower: 0, 
                    isCluster: farms.length > 1, 
                    farms, 
                    totalPlants,
                    totalPendingRaw: j.totalPendingRaw || totalPendingRaw,
                    targetImmunityEnds: clusterImmunityEndsAt, 
                    myAttackCooldownEnds: 0, 
                    hasRaidableFarm: farms.some(f => f.plants > 0 && !f.hasShield && f.canAttack),
                    shieldExpiryTime: clusterShieldExpiry
                });
            }
            
            // Sort by TOTAL PENDING REWARDS (highest loot first!)
            processedJeets.sort((a, b) => (b.totalPendingRaw || 0) - (a.totalPendingRaw || 0));
            console.log("[DEA] Processed jeets:", processedJeets.length, "from backend:", backendData.length);
            setJeets(processedJeets);
            setLastRefresh(Math.floor(Date.now() / 1000));
        } catch (e) { console.error("[DEA] Fetch error:", e); }
        
        clearTimeout(safetyTimeout);
        setLoading(false);
        setIsAutoRefreshing(false);
        fetchingRef.current = false;
    }, [readProvider, userAddress, now]);

    useEffect(() => {
        if (!readProvider) return;
        fetchDEAData();
        // 2 second refresh for near-live activity display
        const refreshInterval = setInterval(fetchDEAData, 2000);
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
            
            // First call: get the immunity duration from contract
            calls.push({ target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("deaTargetImm", []) });
            
            farmAddresses.forEach(addr => {
                calls.push(
                    { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("pending", [addr]) },
                    { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("getUserBattleStats", [addr]) },
                    { target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("getPower", [addr]) },
                    { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("hasRaidShield", [addr]) },
                    { target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("canRaid", [addr]) },
                    { target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("getSuspect", [addr]) },
                    { target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("suspects", [addr]) },
                    { target: V5_ITEMSHOP_ADDRESS, callData: itemShopInterface.encodeFunctionData("shieldExpiry", [addr]) }
                );
                if (userAddress) calls.push({ target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("lastDeaOn", [userAddress, addr]) });
            });
            if (userAddress) {
                calls.push({ target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("getPower", [userAddress]) });
                calls.push({ target: V5_ITEMSHOP_ADDRESS, callData: itemShopInterface.encodeFunctionData("hasActiveNukeReady", [userAddress]) });
                // Add canDea check for the user
                calls.push({ target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("canDea", [userAddress]) });
            }
            
            const results = await mc.tryAggregate(false, calls);
            
            // Get immunity duration from first call result
            let TARGET_IMMUNITY = 3600; // Default 1 hour
            if (results[0]?.success) {
                try {
                    const immDuration = ethers.BigNumber.from(results[0].returnData).toNumber();
                    TARGET_IMMUNITY = immDuration;
                    console.log("[DEA] Target immunity duration from contract:", immDuration, "seconds");
                } catch {}
            }
            
            // Parse multicall results for each farm
            // Each farm has 8 calls now (added shieldExpiry): pending, getUserBattleStats, getPower, hasRaidShield, canRaid, getSuspect, suspects, shieldExpiry
            // Plus optional lastDeaOn if userAddress exists
            const callsPerFarm = userAddress ? 9 : 8;
            const updatedFarms: FarmInfo[] = [];
            
            for (let i = 0; i < farmAddresses.length; i++) {
                const baseIndex = 1 + (i * callsPerFarm);
                const farm = jeet.farms[i];
                
                let pending = 0, plants = farm.plants, avgHealth = farm.avgHealth, battlePower = farm.battlePower;
                let hasShield = farm.hasShield, canRaid = false, hasImmunity = farm.hasImmunity;
                let immunityEndsAt = farm.immunityEndsAt || 0;
                let myAttackCooldownEnds = 0;
                let shieldExpiryTime = farm.shieldExpiryTime || 0;
                
                // Parse pending
                if (results[baseIndex]?.success) {
                    try { pending = parseFloat(ethers.utils.formatUnits(ethers.BigNumber.from(results[baseIndex].returnData), 18)); } catch {}
                }
                
                // Parse getUserBattleStats
                if (results[baseIndex + 1]?.success) {
                    try {
                        const decoded = stakingInterface.decodeFunctionResult("getUserBattleStats", results[baseIndex + 1].returnData);
                        plants = decoded[0].toNumber();
                        avgHealth = decoded[3].toNumber();
                    } catch {}
                }
                
                // Parse getPower
                if (results[baseIndex + 2]?.success) {
                    try {
                        const decoded = battlesInterface.decodeFunctionResult("getPower", results[baseIndex + 2].returnData);
                        battlePower = decoded[2].toNumber(); // DEF power for target
                    } catch {}
                }
                
                // Parse hasRaidShield
                if (results[baseIndex + 3]?.success) {
                    try { hasShield = ethers.BigNumber.from(results[baseIndex + 3].returnData).toNumber() === 1; } catch {}
                }
                
                // Parse canRaid
                if (results[baseIndex + 4]?.success) {
                    try { canRaid = ethers.BigNumber.from(results[baseIndex + 4].returnData).toNumber() === 1; } catch {}
                }
                
                // Parse getSuspect - check for immunity
                // Returns: (bool isSuspect, uint256 expiresAt, uint256 raids, uint256 lost, uint256 sold, uint256 cnt)
                if (results[baseIndex + 6]?.success) {
                    try {
                        const decoded = battlesInterface.decodeFunctionResult("suspects", results[baseIndex + 6].returnData);
                        // suspects returns: (is_, flagAt, sellAt, raidAt, raids, lost, sold, cnt)
                        const raidAt = decoded[3].toNumber();
                        if (raidAt > 0) {
                            const immEnds = raidAt + TARGET_IMMUNITY;
                            if (immEnds > now) {
                                hasImmunity = true;
                                immunityEndsAt = immEnds;
                                console.log("[DEA] Farm", farm.address.slice(0,10), "has immunity until", new Date(immEnds * 1000).toLocaleTimeString());
                            }
                        }
                    } catch {}
                }
                
                // Parse shieldExpiry
                if (results[baseIndex + 7]?.success) {
                    try {
                        const expiry = ethers.BigNumber.from(results[baseIndex + 7].returnData).toNumber();
                        shieldExpiryTime = expiry;
                        // Also update hasShield based on expiry
                        if (expiry > now) {
                            hasShield = true;
                        }
                    } catch {}
                }
                
                // Parse lastDeaOn (per-target cooldown)
                if (userAddress && results[baseIndex + 8]?.success) {
                    try {
                        const lastAttackTime = ethers.BigNumber.from(results[baseIndex + 8].returnData).toNumber();
                        myAttackCooldownEnds = lastAttackTime + PER_TARGET_COOLDOWN;
                    } catch {}
                }
                
                updatedFarms.push({
                    ...farm,
                    plants,
                    avgHealth,
                    pendingRewards: formatLargeNumber(pending),
                    pendingRaw: pending,
                    battlePower,
                    hasShield,
                    hasImmunity,
                    immunityEndsAt,
                    canAttack: plants > 0 && pending > 0 && !hasShield && !hasImmunity && canRaid,
                    myAttackCooldownEnds,
                    shieldExpiryTime
                });
            }
            
            // Get user's attack power
            let attackerPower = myBattlePower;
            let hasNuke = false;
            let canUserDea = false;
            if (userAddress) {
                const userPowerIndex = 1 + (farmAddresses.length * callsPerFarm);
                const nukeIndex = userPowerIndex + 1;
                const canDeaIndex = nukeIndex + 1;
                
                if (results[userPowerIndex]?.success) {
                    try {
                        const decoded = battlesInterface.decodeFunctionResult("getPower", results[userPowerIndex].returnData);
                        attackerPower = decoded[1].toNumber(); // ATK power
                    } catch {}
                }
                if (results[nukeIndex]?.success) {
                    try {
                        hasNuke = ethers.BigNumber.from(results[nukeIndex].returnData).toNumber() === 1;
                        if (hasNuke) attackerPower = Math.floor(attackerPower * 101);
                    } catch {}
                }
                if (results[canDeaIndex]?.success) {
                    try {
                        canUserDea = ethers.BigNumber.from(results[canDeaIndex].returnData).toNumber() === 1;
                        setCanUserRaid(canUserDea);
                    } catch {}
                }
            }
            
            // Select best available farm or first if none available
            const bestFarm = updatedFarms.find(f => f.canAttack && f.plants > 0 && !f.hasShield && !f.hasImmunity) || updatedFarms[0];
            
            // Calculate win chance
            const winChance = bestFarm.battlePower > 0 
                ? Math.min(99, Math.max(1, Math.round((attackerPower / (attackerPower + bestFarm.battlePower)) * 100)))
                : attackerPower > 0 ? 99 : 50;
            
            setSelectedTarget({
                address: bestFarm.address,
                pendingRewards: bestFarm.pendingRewards,
                plants: bestFarm.plants,
                avgHealth: bestFarm.avgHealth,
                battlePower: bestFarm.battlePower,
                hasShield: bestFarm.hasShield,
                hasImmunity: bestFarm.hasImmunity,
                immunityEndsAt: bestFarm.immunityEndsAt,
                attackerPower,
                winChance,
                needsFlagging: jeet.needsFlagging,
                farms: updatedFarms,
                shieldExpiryTime: bestFarm.shieldExpiryTime
            });
        } catch (e) { console.error("[DEA] Target selection error:", e); setStatus("Failed to load target data"); }
        setLoadingTarget(false);
    };

    const selectFarm = (farm: FarmInfo) => {
        if (!selectedTarget) return;
        const attackerPower = selectedTarget.attackerPower;
        const winChance = farm.battlePower > 0 
            ? Math.min(99, Math.max(1, Math.round((attackerPower / (attackerPower + farm.battlePower)) * 100)))
            : attackerPower > 0 ? 99 : 50;
        
        setSelectedTarget({
            ...selectedTarget,
            address: farm.address,
            pendingRewards: farm.pendingRewards,
            plants: farm.plants,
            avgHealth: farm.avgHealth,
            battlePower: farm.battlePower,
            hasShield: farm.hasShield,
            hasImmunity: farm.hasImmunity,
            immunityEndsAt: farm.immunityEndsAt,
            winChance,
            shieldExpiryTime: farm.shieldExpiryTime
        });
        setShowFarmDropdown(false);
    };

    const closeAttackModal = () => { setShowAttackModal(false); setSelectedTarget(null); setSelectedJeet(null); setStatus(""); if (selectedJeet) clearTargeting(selectedJeet.address); };
    const closeResultModal = () => { setShowResultModal(false); setRaidResult(null); refreshData(); };

    const handleRaid = async () => {
        if (!connected || !userAddress || !selectedTarget || !selectedJeet || !readProvider) return;
        setRaiding(true); setStatus("");
        
        await registerTargeting(selectedJeet.address, selectedTarget.address, true);
        
        try {
            const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, BATTLES_ABI, readProvider);
            const nowTs = Math.floor(Date.now() / 1000);
            
            // ==================== PRE-FLIGHT CHECKS ====================
            
            // Check 1: Can user DEA raid at all?
            const canDea = await battlesContract.canDea(userAddress);
            console.log("[DEA] Pre-flight canDea:", canDea);
            if (!canDea) {
                // Check why
                const lastDeaTs = await battlesContract.lastDea(userAddress);
                const deaCD = 7200; // 2 hour cooldown
                const cooldownEnds = lastDeaTs.toNumber() + deaCD;
                if (cooldownEnds > nowTs) {
                    const remaining = cooldownEnds - nowTs;
                    setStatus(`Global cooldown: ${formatCooldown(remaining)} remaining`);
                } else {
                    setStatus("You cannot DEA raid (check staked NFTs)");
                }
                setRaiding(false);
                return;
            }
            
            // Check 2: Is target flagged? If not, try to flag them first
            const suspectInfo = await battlesContract.getSuspect(selectedTarget.address);
            console.log("[DEA] Pre-flight getSuspect:", { isSuspect: suspectInfo[0], expiresAt: suspectInfo[1].toNumber() });
            
            if (!suspectInfo[0] || suspectInfo[1].toNumber() <= nowTs) {
                // Target needs to be flagged first
                setStatus("Flagging target as suspect...");
                try {
                    // Get signature from backend
                    const sigRes = await fetch(`${WARS_BACKEND_URL}/api/flag/signature`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ suspect: selectedTarget.address, caller: userAddress })
                    });
                    const sigData = await sigRes.json();
                    if (!sigData.success) throw new Error(sigData.error || "Failed to get flag signature");
                    
                    const flagData = battlesInterface.encodeFunctionData("flagWithSig", [
                        selectedTarget.address,
                        sigData.soldAmount,
                        sigData.deadline,
                        sigData.signature
                    ]);
                    const flagTx = await sendContractTx(V5_BATTLES_ADDRESS, flagData, "0x186A0");
                    if (!flagTx) throw new Error("Flag transaction rejected");
                    await flagTx.wait();
                    
                    // Verify flag was successful
                    const newSuspectInfo = await battlesContract.getSuspect(selectedTarget.address);
                    if (!newSuspectInfo[0]) {
                        setStatus("Flag failed to register. Try again.");
                        setRaiding(false);
                        return;
                    }
                    setStatus("Target flagged! Proceeding to raid...");
                } catch (flagErr: any) {
                    console.error("[DEA] Flagging failed:", flagErr);
                    // If flagging fails with "already flagged" or similar, continue to raid
                    if (!flagErr?.message?.includes("already") && !flagErr?.reason?.includes("already")) {
                        setStatus(`Flagging failed: ${flagErr?.reason || flagErr?.message || "Unknown error"}`);
                        setRaiding(false);
                        return;
                    }
                }
            }
            
            // Check 3: Can this specific target be raided?
            const canRaidTarget = await battlesContract.canRaid(selectedTarget.address);
            console.log("[DEA] Pre-flight canRaid:", canRaidTarget);
            if (!canRaidTarget) {
                // Check why
                const targetSuspect = await battlesContract.getSuspect(selectedTarget.address);
                if (!targetSuspect[0]) {
                    setStatus("Target is not flagged as a suspect");
                } else if (targetSuspect[1].toNumber() <= nowTs) {
                    setStatus("Target's suspect status has expired");
                } else {
                    setStatus("Target cannot be raided (may have immunity or shield)");
                }
                setRaiding(false);
                return;
            }
            
            // Check 4: Per-target cooldown
            const lastDeaOnTarget = await battlesContract.lastDeaOn(userAddress, selectedTarget.address);
            const perTargetCD = 21600; // 6 hours
            const targetCooldownEnds = lastDeaOnTarget.toNumber() + perTargetCD;
            if (targetCooldownEnds > nowTs) {
                const remaining = targetCooldownEnds - nowTs;
                setStatus(`Per-target cooldown: ${formatCooldown(remaining)} remaining`);
                setRaiding(false);
                return;
            }
            
            // ==================== EXECUTE RAID ====================
            
            // Step 2: Ensure allowance for raid fee
            setStatus("Checking allowance...");
            const approved = await ensureAllowance(V5_BATTLES_ADDRESS, raidFeeRaw);
            if (!approved) { setStatus("Approval failed"); setRaiding(false); return; }
            
            // Step 3: Execute the raid
            setStatus("Initiating DEA Raid...");
            const data = battlesInterface.encodeFunctionData("deaRaid", [selectedTarget.address]);
            // Increased gas limit to 2M - DEA raids do multiple cross-contract calls
            const tx = await sendContractTx(V5_BATTLES_ADDRESS, data, "0x1E8480");
            if (!tx) { setStatus("Transaction rejected"); setRaiding(false); return; }
            setStatus("Raid in progress...");
            const receipt = await tx.wait();
            
            // Check if transaction succeeded
            if (receipt.status === 0) {
                setStatus("Transaction failed - check gas and try again");
                setRaiding(false);
                return;
            }
            
            let won = false, amount = "0", damage = 0;
            let foundEvent = false;
            for (const log of receipt.logs) { 
                try { 
                    const parsed = battlesInterface.parseLog(log); 
                    if (parsed.name === "DeaResult") { 
                        // V3 event: DeaResult(a, t, w, ap, dp, s, dmg)
                        won = parsed.args.w; 
                        amount = formatLargeNumber(parsed.args.s); 
                        damage = parsed.args.dmg.toNumber();
                        foundEvent = true;
                        break; 
                    } 
                } catch {} 
            }
            
            // If no event found, transaction likely failed silently
            if (!foundEvent) {
                setStatus("Raid completed but no result event found");
            }
            
            // Record raid to backend for immunity tracking (fire and forget)
            try {
                fetch(`${WARS_BACKEND_URL}/api/dea/record-raid`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ target: selectedTarget.address, txHash: tx.hash })
                }).catch(console.error);
            } catch {}
            
            await clearTargeting(selectedJeet.address);
            setRaidResult({ won, amount, damage }); setShowAttackModal(false); setShowResultModal(true); fetchDEAData();
        } catch (e: any) { 
            console.error("[DEA] Raid failed:", e); 
            // Parse the error message for better feedback
            const reason = e?.reason || e?.message || "Raid failed";
            if (reason.includes("Not authorized")) {
                setStatus("Not authorized - check your staked NFTs and cooldowns");
            } else if (reason.includes("cooldown")) {
                setStatus("Cooldown active - wait before raiding again");
            } else if (reason.includes("suspect")) {
                setStatus("Target is not a valid suspect");
            } else {
                setStatus(reason);
            }
            await clearTargeting(selectedJeet.address); 
        }
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
                {/* Header with title and refresh indicator */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 700, color: textPrimary, margin: 0 }}>🚔 DEA Raids</h2>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {isAutoRefreshing && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", animation: "pulse 1s infinite" }} />}
                            <span style={{ fontSize: 10, color: textMuted }}>Updated {Math.max(0, currentTime - lastRefresh)}s ago</span>
                        </div>
                    </div>
                </div>

                {/* User authorization warning */}
                {connected && userAddress && !canUserRaid && myBattlePower === 0 && (
                    <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 10, padding: 12, marginBottom: 12, textAlign: "center" }}>
                        <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>⚠️ You need staked NFTs to raid</div>
                        <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>Stake plants or lands to gain battle power</div>
                    </div>
                )}

                {/* Stats Box with total raids and cooldown */}
                <div style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 10, padding: 12, marginBottom: 16 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, textAlign: "center" }}>
                        <div>
                            <div style={{ fontSize: 10, color: textMuted, marginBottom: 4 }}>TOTAL RAIDS</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: "#ef4444" }}>{totalRaids}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 10, color: textMuted, marginBottom: 4 }}>YOUR COOLDOWN</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: cooldownRemaining > 0 ? "#fbbf24" : "#10b981" }}>
                                {cooldownRemaining > 0 ? formatCooldown(cooldownRemaining) : "Ready"}
                            </div>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div style={{ textAlign: "center", padding: 40, color: textMuted }}>Loading suspects...</div>
                ) : activeJeets.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 40, color: textMuted }}>No suspects found</div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {paginatedJeets.map((jeet) => {
                            const targetingInfo = getTargetingInfo(jeet.address);
                            const isBeingTargeted = targetingInfo.count > 0;
                            
                            // Calculate farm stats for the card
                            const totalFarms = jeet.farms.length;
                            const farmsAvailable = jeet.farms.filter(f => f.canAttack && f.plants > 0 && !f.hasShield && !f.hasImmunity).length;
                            const farmsShielded = jeet.farms.filter(f => f.hasShield).length;
                            const farmsImmune = jeet.farms.filter(f => f.hasImmunity && !f.hasShield).length;
                            const totalPending = jeet.farms.reduce((sum, f) => sum + (f.pendingRaw || parseFormattedNumber(f.pendingRewards)), 0);
                            
                            // Check if any farm has active shield with timer
                            const activeShieldExpiry = Math.max(jeet.shieldExpiryTime, ...jeet.farms.map(f => f.shieldExpiryTime || 0));
                            const hasActiveShieldTimer = activeShieldExpiry > now;
                            
                            return (
                                <div key={jeet.address} onClick={() => handleSelectTarget(jeet)} style={{ background: cardBg, borderRadius: 10, padding: "12px 14px", border: `1px solid ${isBeingTargeted ? "rgba(239,68,68,0.5)" : borderColor}`, cursor: "pointer", position: "relative" }}>
                                    {/* Targeting indicator badge */}
                                    {isBeingTargeted && (
                                        <div style={{ position: "absolute", top: -8, left: 8, background: targetingInfo.hasActiveAttack ? "#dc2626" : "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 10, display: "flex", alignItems: "center", gap: 4, animation: targetingInfo.hasActiveAttack ? "pulse 0.5s infinite" : "pulse 1.5s infinite", boxShadow: "0 2px 4px rgba(0,0,0,0.3)" }}>
                                            <span>{targetingInfo.hasActiveAttack ? "⚔️" : "🎯"}</span>
                                            {targetingInfo.count === 1 ? (targetingInfo.hasActiveAttack ? "Under Attack!" : "1 Targeting") : `${targetingInfo.count} Targeting`}
                                        </div>
                                    )}
                                    
                                    {/* Main content wrapper */}
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                        {/* Left side: Address, timer, stats */}
                                        <div style={{ flex: 1 }}>
                                            {/* Address line with shield timer */}
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                                                <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: textPrimary }}>{shortAddr(jeet.address)}</span>
                                                {/* Shield Timer Badge - Blue box with countdown */}
                                                {hasActiveShieldTimer && (
                                                    <div style={{ 
                                                        display: "inline-flex", 
                                                        alignItems: "center", 
                                                        gap: 4, 
                                                        background: "rgba(59,130,246,0.2)", 
                                                        border: "1px solid rgba(59,130,246,0.5)", 
                                                        borderRadius: 6, 
                                                        padding: "2px 6px",
                                                        fontSize: 10,
                                                        color: "#3b82f6",
                                                        fontWeight: 600
                                                    }}>
                                                        <span>🛡️</span>
                                                        <span>RAID SHIELD</span>
                                                        <span style={{ 
                                                            background: "rgba(59,130,246,0.3)", 
                                                            padding: "1px 4px", 
                                                            borderRadius: 4,
                                                            fontFamily: "monospace",
                                                            fontSize: 9
                                                        }}>
                                                            {formatShieldTimer(activeShieldExpiry)}
                                                        </span>
                                                    </div>
                                                )}
                                                {/* Simple shield icon if hasShield but no timer data */}
                                                {jeet.hasShield && !hasActiveShieldTimer && <span style={{ fontSize: 10, color: "#3b82f6" }}>🛡️</span>}
                                            </div>
                                            
                                            {/* Timer below address - show flag status or countdown */}
                                            <div style={{ fontSize: 10, color: jeet.needsFlagging || jeet.expiresAt <= now ? "#f59e0b" : "#fbbf24", display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                                                <span>{jeet.needsFlagging || jeet.expiresAt <= now ? "🏴" : "⏱️"}</span>
                                                <span>{jeet.needsFlagging ? "Needs Flag" : jeet.expiresAt <= now ? "Flag Expired" : formatTimeRemaining(jeet.expiresAt, false)}</span>
                                            </div>
                                            
                                            {/* Bottom stats row */}
                                            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: textMuted }}>
                                                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                                    <span>💰</span>
                                                    <span style={{ color: "#fbbf24", fontWeight: 600 }}>{formatLargeNumber(jeet.totalSold)}</span>
                                                </span>
                                                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                                    <span style={{ color: "#10b981", fontWeight: 600 }}>{jeet.totalPlants}</span>
                                                    <span>🌿</span>
                                                </span>
                                                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                                    <span style={{ color: getHealthColor(jeet.avgHealth), fontWeight: 600 }}>{jeet.avgHealth}%</span>
                                                    <span>❤️</span>
                                                </span>
                                            </div>
                                        </div>
                                        
                                        {/* Right side: Farm status & Total pending */}
                                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, minWidth: 95 }}>
                                            {/* Total Farms */}
                                            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                                                <span style={{ color: textMuted }}>📦</span>
                                                <span style={{ color: textMuted, fontWeight: 500 }}>
                                                    {totalFarms} Farm{totalFarms !== 1 ? "s" : ""}
                                                </span>
                                            </div>
                                            
                                            {/* Farms Available / Shielded / Immune */}
                                            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                                                {farmsShielded > 0 ? (
                                                    <>
                                                        <span style={{ color: "#3b82f6" }}>🛡️</span>
                                                        <span style={{ color: "#3b82f6", fontWeight: 600 }}>
                                                            {farmsShielded} Protected
                                                        </span>
                                                    </>
                                                ) : farmsImmune > 0 ? (
                                                    <>
                                                        <span style={{ color: "#f59e0b" }}>🛡️</span>
                                                        <span style={{ color: "#f59e0b", fontWeight: 600 }}>
                                                            {farmsImmune} Immune
                                                        </span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span style={{ color: farmsAvailable > 0 ? "#10b981" : "#ef4444" }}>⚔️</span>
                                                        <span style={{ color: farmsAvailable > 0 ? "#10b981" : "#ef4444", fontWeight: 600 }}>
                                                            {farmsAvailable} Available
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                            
                                            {/* Total Pending */}
                                            <div style={{ 
                                                marginTop: 2, 
                                                padding: "3px 8px", 
                                                background: "rgba(251,191,36,0.15)", 
                                                borderRadius: 6, 
                                                display: "flex", 
                                                alignItems: "center", 
                                                gap: 4 
                                            }}>
                                                <span style={{ fontSize: 10 }}>💎</span>
                                                <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700 }}>
                                                    {formatLargeNumber(totalPending)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${borderColor}`, background: "transparent", color: textMuted, cursor: currentPage === 1 ? "not-allowed" : "pointer", opacity: currentPage === 1 ? 0.5 : 1 }}>←</button>
                        <span style={{ padding: "6px 12px", color: textMuted, fontSize: 12 }}>{currentPage} / {totalPages}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${borderColor}`, background: "transparent", color: textMuted, cursor: currentPage === totalPages ? "not-allowed" : "pointer", opacity: currentPage === totalPages ? 0.5 : 1 }}>→</button>
                    </div>
                )}
            </div>

            {/* Attack Modal */}
            {showAttackModal && selectedJeet && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }} onClick={(e) => { if (e.target === e.currentTarget && !raiding) closeAttackModal(); }}>
                    <div style={{ background: modalBg, borderRadius: 16, padding: 20, maxWidth: 380, width: "100%", border: `1px solid ${borderColor}`, maxHeight: "85vh", overflow: "auto" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, color: textPrimary, margin: 0 }}>🚔 DEA Raid</h3>
                            <button onClick={closeAttackModal} disabled={raiding} style={{ background: "transparent", border: "none", fontSize: 18, color: textMuted, cursor: raiding ? "not-allowed" : "pointer" }}>✕</button>
                        </div>

                        {/* Cluster farm selector */}
                        {selectedJeet.isCluster && selectedTarget && (
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 10, color: textMuted, marginBottom: 6 }}>SELECT FARM TO RAID</div>
                                <button onClick={() => setShowFarmDropdown(!showFarmDropdown)} style={{ width: "100%", padding: "10px 12px", background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 8, color: textPrimary, fontSize: 12, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ fontFamily: "monospace" }}>{shortAddr(selectedTarget.address)}</span>
                                    <span style={{ fontSize: 10, color: textMuted }}>{showFarmDropdown ? "▲" : "▼"} {selectedTarget.farms.length} farms</span>
                                </button>
                                {showFarmDropdown && (
                                    <div style={{ marginTop: 4, border: `1px solid ${borderColor}`, borderRadius: 8, overflow: "hidden", maxHeight: 200, overflowY: "auto" }}>
                                        {selectedTarget.farms.map((farm, i) => {
                                            const isSelected = farm.address === selectedTarget.address;
                                            const cooldownLeft = farm.myAttackCooldownEnds > now ? farm.myAttackCooldownEnds - now : 0;
                                            const immunityLeft = farm.immunityEndsAt > now ? farm.immunityEndsAt - now : 0;
                                            const isDisabled = farm.hasShield || farm.plants === 0 || cooldownLeft > 0 || immunityLeft > 0;
                                            const shieldTimeLeft = farm.shieldExpiryTime > now ? farm.shieldExpiryTime - now : 0;
                                            
                                            return (
                                                <button key={farm.address} onClick={() => selectFarm(farm)} disabled={isDisabled} style={{ width: "100%", padding: "10px 12px", border: "none", borderBottom: i < selectedTarget.farms.length - 1 ? `1px solid ${borderColor}` : "none", background: isSelected ? "rgba(16,185,129,0.15)" : "transparent", color: isDisabled ? textMuted : textPrimary, cursor: isDisabled ? "not-allowed" : "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                                                    <div><div style={{ fontWeight: 600, fontFamily: "monospace" }}>{shortAddr(farm.address)}</div><div style={{ fontSize: 9, color: textMuted }}>{farm.plants} 🌿 • {farm.avgHealth}% ❤️ • {farm.pendingRewards} pending</div></div>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                        {farm.hasShield ? (
                                                            <span style={{ fontSize: 10, color: "#3b82f6", display: "flex", alignItems: "center", gap: 2 }}>
                                                                🛡️ <span style={{ fontSize: 9 }}>{shieldTimeLeft > 0 ? formatShieldTimer(farm.shieldExpiryTime) : "Shield"}</span>
                                                            </span>
                                                        ) : cooldownLeft > 0 ? (
                                                            <span style={{ fontSize: 9, color: "#fbbf24" }}>⏳ {formatCooldown(cooldownLeft)}</span>
                                                        ) : immunityLeft > 0 ? (
                                                            <span style={{ fontSize: 10, color: "#f59e0b", display: "flex", alignItems: "center", gap: 2 }}>🛡️ <span style={{ fontSize: 9 }}>{formatCooldown(immunityLeft)}</span></span>
                                                        ) : isSelected ? (
                                                            <span style={{ fontSize: 10, color: "#10b981" }}>✓</span>
                                                        ) : null}
                                                    </div>
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
                                {/* Shield with timer display */}
                                {selectedTarget.hasShield && (
                                    <div style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.4)", borderRadius: 10, padding: 16, marginBottom: 16, textAlign: "center" }}>
                                        <div style={{ fontSize: 28, marginBottom: 4 }}>🛡️</div>
                                        <div style={{ fontSize: 12, color: "#3b82f6", fontWeight: 600 }}>Target Protected</div>
                                        {selectedTarget.shieldExpiryTime > now && (
                                            <div style={{ fontSize: 11, color: "#60a5fa", marginTop: 4 }}>
                                                Shield expires in: {formatShieldTimer(selectedTarget.shieldExpiryTime)}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {selectedTarget.hasImmunity && !selectedTarget.hasShield && (() => {
                                    const immunityLeft = selectedTarget.immunityEndsAt > now ? selectedTarget.immunityEndsAt - now : 0;
                                    return <div style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 10, padding: 16, marginBottom: 16, textAlign: "center" }}><div style={{ fontSize: 28, marginBottom: 4 }}>🛡️</div><div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>Target Immune ({immunityLeft > 0 ? formatCooldown(immunityLeft) : "<2h"})</div><div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>Recently raided - try another farm</div></div>;
                                })()}
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
                                    <button onClick={handleRaid} disabled={raiding || selectedTarget.hasShield || selectedTarget.hasImmunity || selectedTarget.plants === 0 || cooldownRemaining > 0 || (!canUserRaid && myBattlePower === 0)} style={{ flex: 2, padding: "12px", fontSize: 13, fontWeight: 700, borderRadius: 8, border: "none", background: (raiding || selectedTarget.hasShield || selectedTarget.hasImmunity || cooldownRemaining > 0 || (!canUserRaid && myBattlePower === 0)) ? "#374151" : "linear-gradient(135deg, #dc2626, #ef4444)", color: "#fff", cursor: (raiding || selectedTarget.hasShield || selectedTarget.hasImmunity || cooldownRemaining > 0 || (!canUserRaid && myBattlePower === 0)) ? "not-allowed" : "pointer" }}>
                                        {raiding ? "Raiding..." : (!canUserRaid && myBattlePower === 0) ? "⚠️ No Battle Power" : selectedTarget.hasShield ? "🛡️ Shielded" : selectedTarget.hasImmunity ? `🛡️ Immune (${selectedTarget.immunityEndsAt > now ? formatCooldown(selectedTarget.immunityEndsAt - now) : "<2h"})` : cooldownRemaining > 0 ? `⏳ ${formatCooldown(cooldownRemaining)}` : "🚔 RAID"}
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
                        <div style={{ fontSize: 22, fontWeight: 800, color: raidResult.won ? "#10b981" : "#ef4444", marginBottom: 16 }}>{raidResult.won ? "SUCCESS!" : "DEFEATED"}</div>
                        {raidResult.won && (
                            <div style={{ background: "rgba(16,185,129,0.1)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                                <div style={{ fontSize: 11, color: textMuted }}>Seized</div>
                                <div style={{ fontSize: 28, fontWeight: 700, color: "#10b981" }}>{raidResult.amount}</div>
                                <div style={{ fontSize: 10, color: textMuted, marginTop: 8 }}>Damage dealt: {raidResult.damage}%</div>
                            </div>
                        )}
                        <button onClick={closeResultModal} style={{ width: "100%", padding: "12px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", cursor: "pointer" }}>Continue</button>
                    </div>
                </div>
            )}
            
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
        </>
    );
}
