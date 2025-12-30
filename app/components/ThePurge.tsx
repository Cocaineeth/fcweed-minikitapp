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

type TargetInfo = {
    address: string;
    plants: number;
    lands: number;
    superLands: number;
    avgHealth: number;
    pendingRewards: string;
    pendingRaw: number;
    battlePower: number;
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
    
    // Target selection
    const [targets, setTargets] = useState<TargetInfo[]>([]);
    const [selectedTarget, setSelectedTarget] = useState<TargetInfo | null>(null);
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
            // Fetch targets from backend or on-chain
            let backendTargets: any[] = [];
            try {
                const res = await fetch(`${WARS_BACKEND_URL}/api/purge/targets`);
                const data = await res.json();
                if (data.success && Array.isArray(data.targets)) {
                    backendTargets = data.targets;
                }
            } catch {
                // Fallback: fetch from staking contract
                console.log("[Purge] Backend unavailable, fetching on-chain");
            }
            
            // If no backend data, try fetching stakers directly
            if (backendTargets.length === 0) {
                try {
                    const stakingContract = new ethers.Contract(V5_STAKING_ADDRESS, STAKING_ABI, readProvider);
                    const totalStakers = await stakingContract.getTotalStakers();
                    const count = Math.min(totalStakers.toNumber(), 50); // Limit to 50
                    
                    const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
                    const calls: any[] = [];
                    
                    for (let i = 0; i < count; i++) {
                        calls.push({ target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("getStakerAtIndex", [i]) });
                    }
                    
                    const results = await mc.tryAggregate(false, calls);
                    const addresses: string[] = [];
                    
                    for (const r of results) {
                        if (r.success) {
                            try {
                                const addr = stakingInterface.decodeFunctionResult("getStakerAtIndex", r.returnData)[0];
                                if (addr && addr !== ethers.constants.AddressZero && addr.toLowerCase() !== userAddress?.toLowerCase()) {
                                    addresses.push(addr);
                                }
                            } catch {}
                        }
                    }
                    
                    // Fetch stats for each address
                    const statsCalls: any[] = [];
                    const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, BATTLES_ABI, readProvider);
                    
                    for (const addr of addresses) {
                        statsCalls.push(
                            { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("getUserBattleStats", [addr]) },
                            { target: V5_STAKING_ADDRESS, callData: stakingInterface.encodeFunctionData("pending", [addr]) },
                            { target: V5_BATTLES_ADDRESS, callData: battlesInterface.encodeFunctionData("getPower", [addr]) }
                        );
                    }
                    
                    const statsResults = await mc.tryAggregate(false, statsCalls);
                    
                    for (let i = 0; i < addresses.length; i++) {
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
                            backendTargets.push({
                                address: addresses[i],
                                plants,
                                lands,
                                superLands,
                                avgHealth,
                                pendingRewards: formatLargeNumber(pendingRaw),
                                pendingRaw,
                                battlePower: power
                            });
                        }
                    }
                } catch (e) {
                    console.error("[Purge] On-chain fetch error:", e);
                }
            }
            
            // Sort by pending rewards (highest first)
            backendTargets.sort((a, b) => (b.pendingRaw || 0) - (a.pendingRaw || 0));
            setTargets(backendTargets);
            
        } catch (e) {
            console.error("[Purge] Fetch targets error:", e);
        }
        
        setLoadingTargets(false);
    }, [readProvider, isPurgeActive, userAddress]);

    useEffect(() => {
        if (!readProvider) return;
        fetchPurgeData();
        const refreshInterval = setInterval(fetchPurgeData, 10000);
        return () => clearInterval(refreshInterval);
    }, [readProvider, userAddress, fetchPurgeData]);

    useEffect(() => {
        if (isPurgeActive) {
            fetchTargets();
        }
    }, [isPurgeActive, fetchTargets]);

    const handleSelectTarget = (target: TargetInfo) => {
        setSelectedTarget(target);
        setShowAttackModal(true);
        setStatus("");
    };

    const handlePurgeAttack = async () => {
        if (!selectedTarget || !userAddress || attacking || !readProvider) return;
        setAttacking(true);
        setStatus("Preparing purge attack...");

        try {
            const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, BATTLES_ABI, readProvider);
            
            // ==================== PRE-FLIGHT CHECKS ====================
            setStatus("Checking authorization...");
            
            // Check 1: Is Purge active?
            const isActive = await battlesContract.isPurgeActive();
            if (!isActive) {
                setStatus("The Purge is not currently active!");
                setAttacking(false);
                return;
            }
            
            // Check 2: Can user purge?
            const canAttack = await battlesContract.canPurge(userAddress);
            if (!canAttack) {
                const [lastAttack, userPower, cd] = await Promise.all([
                    battlesContract.lastPurge(userAddress),
                    battlesContract.getPower(userAddress),
                    battlesContract.purgeCD()
                ]);
                
                const cooldownEnds = lastAttack.toNumber() + cd.toNumber();
                const now = Math.floor(Date.now() / 1000);
                
                if (cooldownEnds > now) {
                    setStatus(`Cooldown: ${formatCooldown(cooldownEnds - now)} remaining`);
                } else if (userPower[1].toNumber() === 0) {
                    setStatus("You need staked NFTs to attack!");
                } else {
                    setStatus("Not authorized - check staked NFTs");
                }
                setAttacking(false);
                return;
            }
            
            // Check 3: Verify target has plants
            const stakingContract = new ethers.Contract(V5_STAKING_ADDRESS, STAKING_ABI, readProvider);
            const targetStats = await stakingContract.getUserBattleStats(selectedTarget.address);
            if (targetStats[0].toNumber() === 0) {
                setStatus("Target has no staked plants!");
                setAttacking(false);
                return;
            }
            
            // ==================== EXECUTE ATTACK ====================
            
            // Check FCWEED balance and approval
            const tokenContract = new ethers.Contract(FCWEED_ADDRESS, ERC20_ABI, readProvider);
            const [balance, allowance] = await Promise.all([
                tokenContract.balanceOf(userAddress),
                tokenContract.allowance(userAddress, V5_BATTLES_ADDRESS)
            ]);
            
            if (balance.lt(purgeFeeRaw)) {
                setStatus(`Insufficient FCWEED! Need ${purgeFee}`);
                setAttacking(false);
                return;
            }
            
            if (allowance.lt(purgeFeeRaw)) {
                setStatus("Approving FCWEED...");
                const approveTx = await sendContractTx(
                    FCWEED_ADDRESS,
                    erc20Interface.encodeFunctionData("approve", [V5_BATTLES_ADDRESS, ethers.constants.MaxUint256])
                );
                if (!approveTx) {
                    setStatus("Approval rejected");
                    setAttacking(false);
                    return;
                }
                await approveTx.wait();
            }
            
            setStatus("Executing Purge attack...");
            const tx = await sendContractTx(
                V5_BATTLES_ADDRESS,
                battlesInterface.encodeFunctionData("purgeAttack", [selectedTarget.address]),
                "0x1E8480" // 2M gas - battles do multiple cross-contract calls
            );
            
            if (!tx) {
                setStatus("Transaction rejected");
                setAttacking(false);
                return;
            }
            
            setStatus("Attack in progress...");
            const receipt = await tx.wait();
            
            if (receipt.status === 0) {
                setStatus("Transaction failed");
                setAttacking(false);
                return;
            }
            
            // Parse result
            let won = false, amount = "0", damage = 0;
            for (const log of receipt.logs) {
                try {
                    const parsed = battlesInterface.parseLog(log);
                    if (parsed.name === "PurgeResult") {
                        won = parsed.args.w;
                        amount = formatLargeNumber(parsed.args.s);
                        damage = parsed.args.dmg.toNumber();
                        break;
                    }
                } catch {}
            }
            
            setAttackResult({ won, amount, damage });
            setShowAttackModal(false);
            setShowResultModal(true);
            fetchPurgeData();
            fetchTargets();
            refreshData();
            
        } catch (e: any) {
            console.error("[Purge] Attack failed:", e);
            const reason = e?.reason || e?.message || "Attack failed";
            if (reason.includes("!cd")) {
                setStatus("Cooldown active - wait before attacking again");
            } else if (reason.includes("!p")) {
                setStatus("You or target needs staked plants");
            } else if (reason.includes("!on")) {
                setStatus("The Purge is not active");
            } else {
                setStatus(reason.slice(0, 100));
            }
        }
        
        setAttacking(false);
    };

    const closeResultModal = () => {
        setShowResultModal(false);
        setAttackResult(null);
    };

    const totalPages = Math.ceil(targets.length / ITEMS_PER_PAGE);
    const paginatedTargets = targets.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const cardBg = theme === "light" ? "rgba(241,245,249,0.8)" : "rgba(15,23,42,0.6)";
    const modalBg = theme === "light" ? "#ffffff" : "#1a1f2e";
    const borderColor = theme === "light" ? "rgba(148,163,184,0.3)" : "rgba(51,65,85,0.5)";
    const textPrimary = theme === "light" ? "#1e293b" : "#ffffff";
    const textMuted = theme === "light" ? "#64748b" : "#94a3b8";
    const shortAddr = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

    return (
        <div style={{ padding: 16 }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: "#dc2626", margin: 0 }}>🔪 THE PURGE</h2>
                    {isPurgeActive ? (
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "rgba(220,38,38,0.2)", color: "#dc2626", fontWeight: 600, animation: "pulse 1s infinite" }}>ACTIVE</span>
                    ) : (
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "rgba(100,116,139,0.2)", color: textMuted, fontWeight: 600 }}>INACTIVE</span>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div style={{ background: cardBg, border: `1px solid ${borderColor}`, borderRadius: 10, padding: 12, marginBottom: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
                    <div>
                        <div style={{ fontSize: 9, color: textMuted, marginBottom: 2 }}>PURGED</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#dc2626" }}>{totalPurged}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 9, color: textMuted, marginBottom: 2 }}>BURNED</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#f97316" }}>{totalBurned}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 9, color: textMuted, marginBottom: 2 }}>COOLDOWN</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: cooldownRemaining > 0 ? "#fbbf24" : "#10b981" }}>
                            {cooldownRemaining > 0 ? formatCooldown(cooldownRemaining) : "Ready"}
                        </div>
                    </div>
                </div>
            </div>

            {/* Purge Info Box */}
            <div style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#fca5a5", textAlign: "center", lineHeight: 1.6 }}>
                    <strong style={{ color: "#dc2626" }}>⚠️ CHAOS MODE</strong><br/>
                    During The Purge, <strong>ALL shields are bypassed</strong>.<br/>
                    Attack anyone regardless of protection!<br/>
                    <span style={{ fontSize: 10, color: textMuted }}>Fee: {purgeFee} $FCWEED (100% burned) • Cooldown only on WIN</span>
                </div>
            </div>

            {/* No battle power warning */}
            {connected && myBattlePower === 0 && (
                <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 10, padding: 12, marginBottom: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>⚠️ No Battle Power</div>
                    <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>Stake plants or lands to participate</div>
                </div>
            )}

            {/* Status */}
            {!isPurgeActive ? (
                <div style={{ textAlign: "center", padding: 20, color: textMuted }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
                    <div style={{ fontSize: 12 }}>The Purge is not currently active.</div>
                    <div style={{ fontSize: 10, marginTop: 4 }}>Check back during chaos events!</div>
                </div>
            ) : (
                <>
                    {/* Target List */}
                    {loadingTargets ? (
                        <div style={{ textAlign: "center", padding: 40, color: textMuted }}>Loading targets...</div>
                    ) : targets.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 40, color: textMuted }}>No targets found</div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {paginatedTargets.map((target) => (
                                <div
                                    key={target.address}
                                    onClick={() => handleSelectTarget(target)}
                                    style={{
                                        background: cardBg,
                                        borderRadius: 10,
                                        padding: "12px 14px",
                                        border: `1px solid ${borderColor}`,
                                        cursor: "pointer"
                                    }}
                                >
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div>
                                            <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: textPrimary, marginBottom: 4 }}>
                                                {shortAddr(target.address)}
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: textMuted }}>
                                                <span>{target.plants} 🌿</span>
                                                <span>{target.lands} 🏞️</span>
                                                <span style={{ color: getHealthColor(target.avgHealth) }}>{target.avgHealth}% ❤️</span>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: "right" }}>
                                            <div style={{ fontSize: 10, color: textMuted }}>⚔️ {target.battlePower}</div>
                                            <div style={{ padding: "3px 8px", background: "rgba(251,191,36,0.15)", borderRadius: 6, marginTop: 4 }}>
                                                <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700 }}>💎 {target.pendingRewards}</span>
                                            </div>
                                        </div>
                                    </div>
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
            {showAttackModal && selectedTarget && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
                    <div style={{ background: modalBg, borderRadius: 16, padding: 20, maxWidth: 380, width: "100%", border: `1px solid ${borderColor}` }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#dc2626", marginBottom: 16, textAlign: "center" }}>🔪 PURGE ATTACK</div>
                        
                        <div style={{ background: "rgba(220,38,38,0.1)", borderRadius: 8, padding: 12, marginBottom: 16, textAlign: "center" }}>
                            <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 600, color: textPrimary }}>{shortAddr(selectedTarget.address)}</div>
                            <div style={{ fontSize: 10, color: textMuted, marginTop: 4 }}>
                                {selectedTarget.plants} 🌿 • {selectedTarget.avgHealth}% ❤️ • {selectedTarget.pendingRewards} pending
                            </div>
                        </div>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                            <div style={{ background: "rgba(16,185,129,0.1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: textMuted }}>YOUR POWER</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: "#10b981" }}>{myBattlePower}</div>
                            </div>
                            <div style={{ background: "rgba(239,68,68,0.1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: textMuted }}>THEIR POWER</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: "#ef4444" }}>{selectedTarget.battlePower}</div>
                            </div>
                        </div>
                        
                        <div style={{ background: "rgba(251,191,36,0.1)", borderRadius: 8, padding: 8, marginBottom: 16, textAlign: "center" }}>
                            <span style={{ fontSize: 10, color: "#fbbf24" }}>Fee: <b>{purgeFee}</b> (100% BURNED 🔥)</span>
                        </div>
                        
                        <div style={{ display: "flex", gap: 10 }}>
                            <button onClick={() => setShowAttackModal(false)} disabled={attacking} style={{ flex: 1, padding: "12px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: `1px solid ${borderColor}`, background: "transparent", color: textMuted, cursor: "pointer" }}>Cancel</button>
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
                        {attackResult.won && (
                            <div style={{ background: "rgba(16,185,129,0.1)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                                <div style={{ fontSize: 11, color: textMuted }}>Looted</div>
                                <div style={{ fontSize: 28, fontWeight: 700, color: "#10b981" }}>{attackResult.amount}</div>
                                <div style={{ fontSize: 10, color: textMuted, marginTop: 8 }}>Damage dealt: {attackResult.damage}%</div>
                            </div>
                        )}
                        <button onClick={closeResultModal} style={{ width: "100%", padding: "12px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "linear-gradient(135deg, #dc2626, #991b1b)", color: "#fff", cursor: "pointer" }}>Continue</button>
                    </div>
                </div>
            )}
            
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
        </div>
    );
}
