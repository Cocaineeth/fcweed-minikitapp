"use client";

import { useState, useMemo } from "react";
import { ethers } from "ethers";

// NFT Image paths
const PLANT_IMAGE = "/hero.png";
const LAND_IMAGE = "/land.png";
const SUPERLAND_IMAGE = "/superland.png";

// Types
interface PlantData {
    id: number;
    health: number;
    waterNeeded: number;
    hasBoost: boolean;
}

interface FarmStats {
    plants: number;
    lands: number;
    superLands: number;
    capacity: number;
    boostPct: number;
    avgHealth: number;
    dailyRewards: string;
    water: string;
    pendingRaw: ethers.BigNumber;
    pendingFormatted: number;
}

interface IsometricFarmProps {
    isOpen: boolean;
    onClose: () => void;
    stats: FarmStats | null;
    stakedPlants: number[];
    stakedLands: number[];
    stakedSuperLands: number[];
    availablePlants: number[];
    availableLands: number[];
    availableSuperLands: number[];
    plantHealths: Record<number, number>;
    waterNeeded: Record<number, number>;
    realTimePending: string;
    claimCooldown: number;
    actionStatus: string;
    loading: boolean;
    actionLoading: boolean;
    onStakePlants: (ids: number[]) => void;
    onUnstakePlants: (ids: number[]) => void;
    onStakeLands: (ids: number[]) => void;
    onUnstakeLands: (ids: number[]) => void;
    onStakeSuperLands: (ids: number[]) => void;
    onUnstakeSuperLands: (ids: number[]) => void;
    onClaim: () => void;
    onWaterPlants: (ids: number[]) => void;
    onShare: () => void;
}

// Plant slot with water amount controls
function PlantSlot({ 
    plant, 
    isSelected, 
    isWatering,
    waterAmount,
    onWaterAmountChange,
    onClick 
}: { 
    plant: PlantData | null;
    isSelected: boolean;
    isWatering: boolean;
    waterAmount?: number;
    onWaterAmountChange?: (delta: number) => void;
    onClick: () => void;
}) {
    const healthColor = plant 
        ? (plant.health >= 80 ? "#22c55e" : plant.health >= 50 ? "#eab308" : "#ef4444")
        : "#1e293b";
    
    return (
        <div
            onClick={plant ? onClick : undefined}
            style={{
                width: "100%",
                aspectRatio: "1",
                background: plant 
                    ? isSelected
                        ? "linear-gradient(135deg, rgba(34,197,94,0.3), rgba(22,163,74,0.2))"
                        : "linear-gradient(135deg, rgba(30,41,59,0.6), rgba(15,23,42,0.8))"
                    : "rgba(30,41,59,0.3)",
                border: `2px solid ${
                    isSelected ? "#22c55e" : 
                    plant ? (plant.health < 100 ? `${healthColor}80` : "rgba(34,197,94,0.3)") : 
                    "rgba(71,85,105,0.2)"
                }`,
                borderRadius: 8,
                cursor: plant ? "pointer" : "default",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 3,
                transition: "all 0.2s ease",
                transform: isSelected ? "scale(1.02)" : "scale(1)",
                boxShadow: isSelected 
                    ? "0 0 15px rgba(34,197,94,0.4)" 
                    : isWatering 
                        ? "0 0 15px rgba(59,130,246,0.4)"
                        : "none",
                position: "relative",
                overflow: "hidden"
            }}
        >
            {isWatering && (
                <div style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(180deg, rgba(59,130,246,0.3) 0%, transparent 50%)",
                    animation: "waterShimmer 1s ease-in-out infinite"
                }} />
            )}
            
            {plant ? (
                <>
                    <div style={{
                        position: "relative",
                        width: "50%",
                        aspectRatio: "1",
                        animation: isWatering ? "plantBounce 0.5s ease-in-out infinite" : "none"
                    }}>
                        <img 
                            src={PLANT_IMAGE}
                            alt={`Plant #${plant.id}`}
                            style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                                filter: isWatering ? "drop-shadow(0 0 8px #3b82f6)" : "none"
                            }}
                        />
                        
                        {isWatering && (
                            <div style={{ 
                                position: "absolute", 
                                top: -8, 
                                left: "50%", 
                                transform: "translateX(-50%)",
                                display: "flex",
                                gap: 4
                            }}>
                                <span style={{ animation: "dropFall 0.6s ease-in infinite", fontSize: 10 }}>💧</span>
                            </div>
                        )}
                        
                        {isSelected && (
                            <div style={{
                                position: "absolute",
                                top: -2,
                                right: -2,
                                width: 12,
                                height: 12,
                                background: "#22c55e",
                                borderRadius: "50%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 7,
                                color: "#fff",
                                border: "1px solid #fff"
                            }}>✓</div>
                        )}
                    </div>
                    
                    <div style={{ fontSize: 7, color: "#9ca3af", fontWeight: 600 }}>#{plant.id}</div>
                    
                    <div style={{
                        width: "90%",
                        height: 3,
                        background: "rgba(0,0,0,0.5)",
                        borderRadius: 2,
                        marginTop: 1,
                        overflow: "hidden"
                    }}>
                        <div style={{ width: `${plant.health}%`, height: "100%", background: healthColor }} />
                    </div>
                    
                    {/* Water controls when selected and needs water */}
                    {isSelected && plant.health < 100 && onWaterAmountChange ? (
                        <div 
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 2,
                                marginTop: 2,
                                background: "rgba(59,130,246,0.2)",
                                borderRadius: 4,
                                padding: "1px 3px"
                            }}
                        >
                            <button
                                onClick={(e) => { e.stopPropagation(); onWaterAmountChange(-0.5); }}
                                style={{
                                    width: 12, height: 12,
                                    background: "rgba(59,130,246,0.3)",
                                    border: "1px solid #3b82f6",
                                    borderRadius: 2,
                                    color: "#3b82f6",
                                    fontSize: 9,
                                    cursor: "pointer",
                                    padding: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center"
                                }}
                            >-</button>
                            <span style={{ fontSize: 7, color: "#3b82f6", fontWeight: 700, minWidth: 20, textAlign: "center" }}>
                                {(waterAmount || 0).toFixed(1)}L
                            </span>
                            <button
                                onClick={(e) => { e.stopPropagation(); onWaterAmountChange(0.5); }}
                                style={{
                                    width: 12, height: 12,
                                    background: "rgba(59,130,246,0.3)",
                                    border: "1px solid #3b82f6",
                                    borderRadius: 2,
                                    color: "#3b82f6",
                                    fontSize: 9,
                                    cursor: "pointer",
                                    padding: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center"
                                }}
                            >+</button>
                        </div>
                    ) : (
                        <div style={{ fontSize: 7, color: healthColor, fontWeight: 600 }}>{plant.health}%</div>
                    )}
                </>
            ) : (
                <div style={{ color: "rgba(71,85,105,0.4)", fontSize: 18 }}>+</div>
            )}
        </div>
    );
}

// Small NFT card for inventory
function NFTCard({ id, type, isSelected, health, onClick }: {
    id: number;
    type: "plant" | "land" | "superland";
    isSelected: boolean;
    health?: number;
    onClick: () => void;
}) {
    const images = { plant: PLANT_IMAGE, land: LAND_IMAGE, superland: SUPERLAND_IMAGE };
    const colors = { plant: "#22c55e", land: "#8b5cf6", superland: "#f59e0b" };
    const healthColor = health !== undefined ? (health >= 80 ? "#22c55e" : health >= 50 ? "#eab308" : "#ef4444") : null;
    
    return (
        <div onClick={onClick} style={{
            width: 50, padding: 4,
            background: isSelected ? `linear-gradient(135deg, ${colors[type]}30, ${colors[type]}15)` : "linear-gradient(135deg, #1e293b, #0f172a)",
            border: `2px solid ${isSelected ? colors[type] : health !== undefined && health < 100 ? "#ef4444" : "#334155"}`,
            borderRadius: 6, cursor: "pointer",
            transform: isSelected ? "scale(1.02)" : "scale(1)",
            position: "relative"
        }}>
            {isSelected && (
                <div style={{
                    position: "absolute", top: 2, right: 2, width: 10, height: 10,
                    background: colors[type], borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 6, color: "#fff"
                }}>✓</div>
            )}
            <img src={images[type]} alt={`${type} #${id}`} style={{ width: "100%", height: 30, objectFit: "contain", borderRadius: 3 }} />
            <div style={{ fontSize: 7, color: "#9ca3af", textAlign: "center", marginTop: 2 }}>#{id}</div>
            {health !== undefined && (
                <div style={{ width: "100%", height: 2, background: "rgba(0,0,0,0.5)", borderRadius: 1, marginTop: 2, overflow: "hidden" }}>
                    <div style={{ width: `${health}%`, height: "100%", background: healthColor }} />
                </div>
            )}
        </div>
    );
}

// Main component
export default function IsometricFarm({
    isOpen, onClose, stats, stakedPlants, stakedLands, stakedSuperLands,
    availablePlants, availableLands, availableSuperLands,
    plantHealths, waterNeeded, realTimePending, claimCooldown,
    actionStatus, loading, actionLoading,
    onStakePlants, onUnstakePlants, onStakeLands, onUnstakeLands,
    onStakeSuperLands, onUnstakeSuperLands, onClaim, onWaterPlants, onShare,
}: IsometricFarmProps) {
    const [selectedStakedPlants, setSelectedStakedPlants] = useState<number[]>([]);
    const [selectedAvailablePlants, setSelectedAvailablePlants] = useState<number[]>([]);
    const [selectedAvailableLands, setSelectedAvailableLands] = useState<number[]>([]);
    const [selectedAvailableSuperLands, setSelectedAvailableSuperLands] = useState<number[]>([]);
    const [wateringPlants, setWateringPlants] = useState<number[]>([]);
    const [showStats, setShowStats] = useState(false);
    const [showInventory, setShowInventory] = useState(false);
    const [activeTab, setActiveTab] = useState<"staked" | "available">("staked");
    const [waterAmounts, setWaterAmounts] = useState<Record<number, number>>({});
    
    // Build plant data sorted by health
    const allPlantData: PlantData[] = useMemo(() => {
        return stakedPlants.map(id => ({
            id,
            health: plantHealths[id] ?? 100,
            waterNeeded: waterNeeded[id] ?? 0,
            hasBoost: false
        })).sort((a, b) => b.health - a.health);
    }, [stakedPlants, plantHealths, waterNeeded]);
    
    // Top 20 for display
    const displayPlants = allPlantData.slice(0, 20);
    const gridCols = displayPlants.length <= 4 ? 2 : displayPlants.length <= 9 ? 3 : displayPlants.length <= 16 ? 4 : 5;
    
    // Water balance
    const waterBalance = stats?.water 
        ? parseFloat(ethers.utils.formatUnits(ethers.BigNumber.from(stats.water.toString()), 18)).toFixed(1)
        : "0";
    
    const plantsNeedingWater = allPlantData.filter(p => p.health < 100);
    
    // Toggle plant selection with water amount init
    const toggleStakedPlant = (id: number) => {
        setSelectedStakedPlants(prev => {
            if (prev.includes(id)) {
                setWaterAmounts(wa => { const n = { ...wa }; delete n[id]; return n; });
                return prev.filter(p => p !== id);
            } else {
                const plant = allPlantData.find(p => p.id === id);
                const maxNeeded = plant ? Math.max(0, (100 - plant.health) / 10) : 0;
                setWaterAmounts(wa => ({ ...wa, [id]: Math.min(maxNeeded, parseFloat(waterBalance)) }));
                return [...prev, id];
            }
        });
    };
    
    const handleWaterAmountChange = (plantId: number, delta: number) => {
        const plant = allPlantData.find(p => p.id === plantId);
        const maxNeeded = plant ? Math.max(0, (100 - plant.health) / 10) : 0;
        setWaterAmounts(prev => {
            const current = prev[plantId] || 0;
            return { ...prev, [plantId]: Math.max(0, Math.min(maxNeeded, current + delta)) };
        });
    };
    
    const totalWaterToUse = Object.values(waterAmounts).reduce((sum, amt) => sum + amt, 0);
    
    const toggleAvailablePlant = (id: number) => setSelectedAvailablePlants(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
    const toggleAvailableLand = (id: number) => setSelectedAvailableLands(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
    const toggleAvailableSuperLand = (id: number) => setSelectedAvailableSuperLands(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
    
    const handleWaterSelected = async () => {
        if (selectedStakedPlants.length > 0) {
            setWateringPlants(selectedStakedPlants);
            await onWaterPlants(selectedStakedPlants);
            setTimeout(() => {
                setWateringPlants([]);
                setSelectedStakedPlants([]);
                setWaterAmounts({});
            }, 2000);
        }
    };
    
    const handleStakeSelected = () => {
        if (selectedAvailablePlants.length > 0) { onStakePlants(selectedAvailablePlants); setSelectedAvailablePlants([]); }
        if (selectedAvailableLands.length > 0) { onStakeLands(selectedAvailableLands); setSelectedAvailableLands([]); }
        if (selectedAvailableSuperLands.length > 0) { onStakeSuperLands(selectedAvailableSuperLands); setSelectedAvailableSuperLands([]); }
    };
    
    const totalSelectedForStaking = selectedAvailablePlants.length + selectedAvailableLands.length + selectedAvailableSuperLands.length;
    
    if (!isOpen) return null;
    
    return (
        <div style={{
            position: "fixed", inset: 0, background: "#050810", zIndex: 1000,
            overflow: "hidden", fontFamily: "system-ui, -apple-system, sans-serif",
            display: "flex", flexDirection: "column"
        }}>
            <style>{`
                @keyframes plantBounce { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
                @keyframes dropFall { 0% { transform: translateY(-5px); opacity: 1; } 100% { transform: translateY(25px); opacity: 0; } }
                @keyframes waterShimmer { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.6; } }
            `}</style>
            
            {/* HEADER */}
            <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px", background: "linear-gradient(180deg, #0a1f0a 0%, #050810 100%)",
                borderBottom: "2px solid #22c55e", flexShrink: 0
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <img src={PLANT_IMAGE} alt="FCWEED" style={{ width: 32, height: 32, borderRadius: 6 }} />
                    <div>
                        <h1 style={{ color: "#22c55e", fontSize: 16, margin: 0, fontWeight: 800 }}>FCWEED FARM</h1>
                        <span style={{ fontSize: 10, color: "#4ade80" }}>GROW ROOM V5</span>
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={onShare} style={{ padding: "8px 12px", background: "rgba(29,161,242,0.15)", border: "1px solid #1da1f2", borderRadius: 6, color: "#1da1f2", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>📸 Share</button>
                    <button onClick={onClose} style={{ width: 34, height: 34, background: "rgba(239,68,68,0.15)", border: "1px solid #ef4444", borderRadius: 6, color: "#ef4444", fontSize: 14, cursor: "pointer" }}>✕</button>
                </div>
            </div>
            
            {/* MAIN CONTENT */}
            <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                {/* ISOMETRIC ROOM SVG */}
                <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
                    <defs>
                        <linearGradient id="backWall" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#1a1a2e" /><stop offset="100%" stopColor="#0f0f1a" /></linearGradient>
                        <linearGradient id="leftWall" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stopColor="#12121f" /><stop offset="100%" stopColor="#0a0a12" /></linearGradient>
                        <linearGradient id="rightWall" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#12121f" /><stop offset="100%" stopColor="#0a0a12" /></linearGradient>
                        <linearGradient id="floor" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#141420" /><stop offset="100%" stopColor="#0a0a10" /></linearGradient>
                        <filter id="purpleGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                    </defs>
                    
                    <rect x="0" y="0" width="800" height="600" fill="#050810" />
                    <polygon points="100,80 700,80 650,180 150,180" fill="url(#backWall)" stroke="#1a472a" strokeWidth="2" />
                    <polygon points="100,80 150,180 150,480 100,400" fill="url(#leftWall)" stroke="#1a472a" strokeWidth="2" />
                    <polygon points="700,80 650,180 650,480 700,400" fill="url(#rightWall)" stroke="#1a472a" strokeWidth="2" />
                    <polygon points="150,180 650,180 650,480 150,480" fill="url(#floor)" stroke="#1a472a" strokeWidth="1" />
                    
                    {[...Array(7)].map((_, i) => <line key={`fh${i}`} x1="150" y1={180 + i * 50} x2="650" y2={180 + i * 50} stroke="rgba(34,197,94,0.08)" strokeWidth="1" />)}
                    {[...Array(11)].map((_, i) => <line key={`fv${i}`} x1={150 + i * 50} y1="180" x2={150 + i * 50} y2="480" stroke="rgba(34,197,94,0.08)" strokeWidth="1" />)}
                    
                    <rect x="180" y="100" width="440" height="10" rx="3" fill="#1a1a1a" />
                    {[...Array(7)].map((_, i) => (
                        <g key={`led${i}`}>
                            <rect x={200 + i * 60} y="102" width="35" height="6" rx="2" fill="#a855f7" filter="url(#purpleGlow)" />
                            <polygon points={`${217 + i * 60},108 ${200 + i * 60},280 ${235 + i * 60},280`} fill="rgba(168,85,247,0.06)" />
                        </g>
                    ))}
                    
                    <rect x="110" y="120" width="30" height="20" rx="2" fill="#2a2a2a" stroke="#333" />
                    <rect x="550" y="110" width="80" height="8" fill="#3d3d3d" />
                </svg>
                
                {/* STATS PANEL - TOP */}
                {showStats && (
                    <div style={{
                        position: "absolute", top: 5, left: 10, right: 10, height: 110,
                        background: "rgba(10,15,25,0.98)", border: "2px solid #22c55e",
                        borderRadius: 12, zIndex: 200, display: "flex", flexDirection: "column"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderBottom: "1px solid #22c55e40", background: "#22c55e15" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span>📊</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e" }}>STATS</span>
                            </div>
                            <button onClick={() => setShowStats(false)} style={{ width: 20, height: 20, background: "rgba(239,68,68,0.2)", border: "1px solid #ef4444", borderRadius: 4, color: "#ef4444", fontSize: 10, cursor: "pointer" }}>✕</button>
                        </div>
                        <div style={{ display: "flex", gap: 8, padding: 8, flex: 1, alignItems: "center" }}>
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 8, color: "#9ca3af" }}>🌿 Plants</span><span style={{ fontSize: 9, color: "#22c55e", fontWeight: 600 }}>{stats?.plants || 0}</span></div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 8, color: "#9ca3af" }}>🏠 Lands</span><span style={{ fontSize: 9, color: "#8b5cf6", fontWeight: 600 }}>{stats?.lands || 0}</span></div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 8, color: "#9ca3af" }}>🔥 Super</span><span style={{ fontSize: 9, color: "#f59e0b", fontWeight: 600 }}>{stats?.superLands || 0}</span></div>
                            </div>
                            <div style={{ width: 1, height: "80%", background: "#22c55e30" }} />
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 8, color: "#9ca3af" }}>💧 Water</span><span style={{ fontSize: 9, color: "#3b82f6", fontWeight: 600 }}>{waterBalance}L</span></div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 8, color: "#9ca3af" }}>⚡ Boost</span><span style={{ fontSize: 9, color: "#10b981", fontWeight: 600 }}>+{stats?.boostPct?.toFixed(1) || 0}%</span></div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 8, color: "#9ca3af" }}>❤️ Health</span><span style={{ fontSize: 9, color: "#22c55e", fontWeight: 600 }}>{stats?.avgHealth || 100}%</span></div>
                            </div>
                            <div style={{ width: 1, height: "80%", background: "#22c55e30" }} />
                            <div style={{ flex: 1.2, display: "flex", flexDirection: "column", gap: 4, justifyContent: "center" }}>
                                <div style={{ background: "linear-gradient(135deg, #0a2f0a, #1a472a)", border: "1px solid #22c55e", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                    <div style={{ fontSize: 7, color: "#4ade80" }}>💎 PENDING</div>
                                    <div style={{ fontSize: 12, color: "#22c55e", fontWeight: "bold" }}>{realTimePending}</div>
                                </div>
                                {claimCooldown > 0 && <div style={{ fontSize: 7, color: "#fbbf24", textAlign: "center" }}>⏳ {Math.floor(claimCooldown / 3600)}h {Math.floor((claimCooldown % 3600) / 60)}m</div>}
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Quick stats bar */}
                <div style={{
                    position: "absolute", top: showStats ? "25%" : "18%", left: "50%", transform: "translateX(-50%)",
                    display: "flex", gap: 16, padding: "8px 16px", background: "rgba(10,20,15,0.95)",
                    borderRadius: 20, border: "1px solid rgba(34,197,94,0.3)", boxShadow: "0 4px 20px rgba(0,0,0,0.5)", zIndex: 100,
                    transition: "top 0.3s ease"
                }}>
                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e" }}>{stats?.plants || 0}</div><div style={{ fontSize: 8, color: "#9ca3af" }}>PLANTS</div></div>
                    <div style={{ width: 1, background: "rgba(34,197,94,0.3)" }} />
                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: "#8b5cf6" }}>{stats?.lands || 0}</div><div style={{ fontSize: 8, color: "#9ca3af" }}>LANDS</div></div>
                    <div style={{ width: 1, background: "rgba(34,197,94,0.3)" }} />
                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: "#f59e0b" }}>{stats?.superLands || 0}</div><div style={{ fontSize: 8, color: "#9ca3af" }}>SUPER</div></div>
                    <div style={{ width: 1, background: "rgba(34,197,94,0.3)" }} />
                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e" }}>{realTimePending}</div><div style={{ fontSize: 8, color: "#9ca3af" }}>PENDING</div></div>
                </div>
                
                {/* PLANT GRID */}
                <div style={{
                    position: "absolute", top: showStats ? "35%" : "28%", left: "50%", transform: "translateX(-50%)",
                    width: "75%", maxWidth: 420, display: "grid", gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                    gap: 5, padding: 8, background: "rgba(10,15,20,0.5)", borderRadius: 10,
                    border: "1px solid rgba(34,197,94,0.2)", transition: "top 0.3s ease",
                    maxHeight: showInventory ? "25%" : "55%", overflowY: "auto"
                }}>
                    {displayPlants.map(plant => (
                        <PlantSlot
                            key={plant.id}
                            plant={plant}
                            isSelected={selectedStakedPlants.includes(plant.id)}
                            isWatering={wateringPlants.includes(plant.id)}
                            waterAmount={waterAmounts[plant.id]}
                            onWaterAmountChange={(delta) => handleWaterAmountChange(plant.id, delta)}
                            onClick={() => toggleStakedPlant(plant.id)}
                        />
                    ))}
                </div>
                
                {/* INVENTORY PANEL - BOTTOM */}
                {showInventory && (
                    <div style={{
                        position: "absolute", bottom: 5, left: 10, right: 10, height: 160,
                        background: "rgba(10,15,25,0.98)", border: "2px solid #22c55e",
                        borderRadius: 12, zIndex: 200, display: "flex", flexDirection: "column"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderBottom: "1px solid #22c55e40", background: "#22c55e15" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span>📦</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e" }}>INVENTORY</span>
                            </div>
                            <div style={{ display: "flex", gap: 4 }}>
                                <button onClick={() => setActiveTab("staked")} style={{ padding: "4px 8px", background: activeTab === "staked" ? "#22c55e30" : "transparent", border: `1px solid ${activeTab === "staked" ? "#22c55e" : "#334155"}`, borderRadius: 4, color: activeTab === "staked" ? "#22c55e" : "#6b7280", fontSize: 9, cursor: "pointer" }}>STAKED</button>
                                <button onClick={() => setActiveTab("available")} style={{ padding: "4px 8px", background: activeTab === "available" ? "#22c55e30" : "transparent", border: `1px solid ${activeTab === "available" ? "#22c55e" : "#334155"}`, borderRadius: 4, color: activeTab === "available" ? "#22c55e" : "#6b7280", fontSize: 9, cursor: "pointer" }}>AVAILABLE</button>
                            </div>
                            <button onClick={() => setShowInventory(false)} style={{ width: 20, height: 20, background: "rgba(239,68,68,0.2)", border: "1px solid #ef4444", borderRadius: 4, color: "#ef4444", fontSize: 10, cursor: "pointer" }}>✕</button>
                        </div>
                        <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
                            {activeTab === "staked" ? (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                    {allPlantData.map(p => <NFTCard key={p.id} id={p.id} type="plant" isSelected={selectedStakedPlants.includes(p.id)} health={p.health} onClick={() => toggleStakedPlant(p.id)} />)}
                                    {stakedLands.map(id => <NFTCard key={`l${id}`} id={id} type="land" isSelected={false} onClick={() => {}} />)}
                                    {stakedSuperLands.map(id => <NFTCard key={`s${id}`} id={id} type="superland" isSelected={false} onClick={() => {}} />)}
                                </div>
                            ) : (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                    {availablePlants.map(id => <NFTCard key={id} id={id} type="plant" isSelected={selectedAvailablePlants.includes(id)} onClick={() => toggleAvailablePlant(id)} />)}
                                    {availableLands.map(id => <NFTCard key={`l${id}`} id={id} type="land" isSelected={selectedAvailableLands.includes(id)} onClick={() => toggleAvailableLand(id)} />)}
                                    {availableSuperLands.map(id => <NFTCard key={`s${id}`} id={id} type="superland" isSelected={selectedAvailableSuperLands.includes(id)} onClick={() => toggleAvailableSuperLand(id)} />)}
                                    {availablePlants.length === 0 && availableLands.length === 0 && availableSuperLands.length === 0 && (
                                        <div style={{ width: "100%", textAlign: "center", color: "#6b7280", fontSize: 10, padding: 10 }}>No NFTs available</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            
            {/* FOOTER */}
            <div style={{
                display: "flex", flexDirection: "column", gap: 6, padding: "8px 14px",
                background: "linear-gradient(180deg, #050810 0%, #0a1f0a 100%)",
                borderTop: "2px solid #22c55e", flexShrink: 0
            }}>
                {/* Water row when selected */}
                {selectedStakedPlants.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "6px", background: "rgba(59,130,246,0.1)", borderRadius: 6, border: "1px solid rgba(59,130,246,0.3)" }}>
                        <span style={{ fontSize: 10, color: "#3b82f6" }}>{selectedStakedPlants.length} selected • {totalWaterToUse.toFixed(1)}L total</span>
                        <button onClick={handleWaterSelected} disabled={actionLoading || totalWaterToUse <= 0} style={{ padding: "6px 16px", background: actionLoading || totalWaterToUse <= 0 ? "#374151" : "linear-gradient(135deg, #3b82f6, #2563eb)", border: "none", borderRadius: 6, color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>💧 WATER</button>
                        <button onClick={() => { setSelectedStakedPlants([]); setWaterAmounts({}); }} style={{ padding: "6px 10px", background: "transparent", border: "1px solid #6b7280", borderRadius: 4, color: "#9ca3af", fontSize: 9, cursor: "pointer" }}>Clear</button>
                    </div>
                )}
                
                {/* Stake row when available selected */}
                {totalSelectedForStaking > 0 && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "6px", background: "rgba(34,197,94,0.1)", borderRadius: 6, border: "1px solid rgba(34,197,94,0.3)" }}>
                        <span style={{ fontSize: 10, color: "#22c55e" }}>{totalSelectedForStaking} to stake</span>
                        <button onClick={handleStakeSelected} disabled={actionLoading} style={{ padding: "6px 16px", background: "linear-gradient(135deg, #22c55e, #16a34a)", border: "none", borderRadius: 6, color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>🌱 STAKE</button>
                    </div>
                )}
                
                {/* Main buttons */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button onClick={() => { setShowStats(!showStats); setShowInventory(false); }} style={{ padding: "10px 20px", background: showStats ? "#22c55e30" : "#22c55e15", border: `2px solid ${showStats ? "#22c55e" : "#22c55e80"}`, borderRadius: 8, color: "#22c55e", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>📊 STATS</button>
                    <button onClick={onClaim} disabled={actionLoading || claimCooldown > 0 || !stats || stats.pendingFormatted <= 0} style={{ padding: "10px 24px", background: actionLoading || claimCooldown > 0 || !stats || stats.pendingFormatted <= 0 ? "#374151" : "linear-gradient(135deg, #22c55e, #16a34a)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 0 20px rgba(34,197,94,0.3)" }}>🌾 HARVEST</button>
                    <button onClick={() => { setShowInventory(!showInventory); setShowStats(false); }} style={{ padding: "10px 20px", background: showInventory ? "#22c55e30" : "#22c55e15", border: `2px solid ${showInventory ? "#22c55e" : "#22c55e80"}`, borderRadius: 8, color: "#22c55e", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>📦 INVENTORY</button>
                </div>
            </div>
            
            {/* Status toast */}
            {actionStatus && (
                <div style={{ position: "absolute", bottom: 100, left: "50%", transform: "translateX(-50%)", background: actionStatus.includes("✅") ? "rgba(34,197,94,0.95)" : "rgba(251,191,36,0.95)", padding: "10px 20px", borderRadius: 8, color: "#fff", fontSize: 11, fontWeight: 600, zIndex: 300 }}>{actionStatus}</div>
            )}
            
            {/* Loading */}
            {loading && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1001 }}>
                    <div style={{ textAlign: "center" }}>
                        <img src={PLANT_IMAGE} alt="Loading" style={{ width: 60, height: 60, animation: "plantBounce 1s infinite" }} />
                        <div style={{ color: "#22c55e", fontSize: 12, fontWeight: 600, marginTop: 10 }}>Loading...</div>
                    </div>
                </div>
            )}
        </div>
    );
}
