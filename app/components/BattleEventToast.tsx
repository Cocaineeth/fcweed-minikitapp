"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";

// Battle contract address (same as V5_BATTLES_ADDRESS)
const BATTLE_CONTRACT = "0x7001478C4D924bf2cB48E5F4e0d66BeC56098a00";

// ABI for battle events
const BATTLE_ABI = [
    "event CartelResult(address indexed attacker, address indexed defender, bool won, uint256 attackPower, uint256 defendPower, uint256 stolen, uint256 damage)",
    "event DeaResult(address indexed attacker, address indexed target, bool won, uint256 attackPower, uint256 defendPower, uint256 stolen, uint256 damage)",
    "event PurgeResult(address indexed attacker, address indexed target, bool won, uint256 attackPower, uint256 defendPower, uint256 stolen, uint256 damage)",
    "event NukeUsed(address indexed attacker, address indexed target)"
];

interface BattleEvent {
    id: string;
    type: "cartel" | "dea" | "purge";
    attacker: string;
    defender: string;
    won: boolean;
    stolen: string;
    damage: number;
    nukeUsed?: boolean;
    timestamp: number;
}

interface Props {
    theme: "light" | "dark";
    readProvider: ethers.providers.Provider | null;
    enabled?: boolean;
    onBattleEvent?: () => void; // Callback when any battle event is detected (for live refresh)
}

// Shorten address: 0x1234...5678
const shortenAddress = (addr: string): string => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

// Format token amount
const formatTokens = (amount: string): string => {
    const num = parseFloat(ethers.utils.formatEther(amount));
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(0);
};

// Individual toast component
const Toast: React.FC<{
    event: BattleEvent;
    onRemove: () => void;
    theme: "light" | "dark";
}> = ({ event, onRemove, theme }) => {
    const [isExiting, setIsExiting] = useState(false);
    const [progress, setProgress] = useState(100);
    const onRemoveRef = useRef(onRemove);
    const hasRemovedRef = useRef(false);

    // Keep ref updated
    useEffect(() => {
        onRemoveRef.current = onRemove;
    }, [onRemove]);

    // Theme colors matching FCWeed app
    const cardBg = theme === "light" ? "#ffffff" : "rgba(20,25,35,0.98)";
    const textPrimary = theme === "light" ? "#1e293b" : "#ffffff";
    const textMuted = theme === "light" ? "#64748b" : "#94a3b8";

    // FIXED: Use ref for callback and empty dependency array so timer only runs once
    useEffect(() => {
        // Progress bar countdown - 10 seconds
        const interval = setInterval(() => {
            setProgress((prev) => Math.max(0, prev - 1));
        }, 100); // 10 seconds = 100 steps * 100ms

        // Auto-remove after 10 seconds
        const timer = setTimeout(() => {
            if (!hasRemovedRef.current) {
                hasRemovedRef.current = true;
                setIsExiting(true);
                setTimeout(() => onRemoveRef.current(), 300);
            }
        }, 10000);

        return () => {
            clearTimeout(timer);
            clearInterval(interval);
        };
    }, []); // Empty deps - only run once on mount

    const handleClose = () => {
        if (!hasRemovedRef.current) {
            hasRemovedRef.current = true;
            setIsExiting(true);
            setTimeout(() => onRemoveRef.current(), 300);
        }
    };

    const getBattleIcon = () => {
        switch (event.type) {
            case "cartel": return "⚔️";
            case "dea": return "🚔";
            case "purge": return "💀";
        }
    };

    const getBattleName = () => {
        switch (event.type) {
            case "cartel": return "CARTEL WAR";
            case "dea": return "DEA RAID";
            case "purge": return "THE PURGE";
        }
    };

    const getAccentColor = () => {
        if (event.nukeUsed) return "#f97316"; // Orange for nuke
        return event.won ? "#10b981" : "#ef4444"; // Green win, Red loss
    };

    const getGradient = () => {
        if (event.nukeUsed) return "linear-gradient(135deg, rgba(249,115,22,0.15), rgba(234,88,12,0.25))";
        if (event.won) {
            switch (event.type) {
                case "cartel": return "linear-gradient(135deg, rgba(16,185,129,0.1), rgba(5,150,105,0.2))";
                case "dea": return "linear-gradient(135deg, rgba(59,130,246,0.1), rgba(37,99,235,0.2))";
                case "purge": return "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(124,58,237,0.2))";
            }
        }
        return "linear-gradient(135deg, rgba(239,68,68,0.1), rgba(220,38,38,0.2))";
    };

    const getBorderGlow = () => {
        if (event.nukeUsed) return "rgba(249,115,22,0.5)";
        if (event.won) {
            switch (event.type) {
                case "cartel": return "rgba(16,185,129,0.4)";
                case "dea": return "rgba(59,130,246,0.4)";
                case "purge": return "rgba(139,92,246,0.4)";
            }
        }
        return "rgba(239,68,68,0.4)";
    };

    return (
        <div
            style={{
                position: "relative",
                overflow: "hidden",
                borderRadius: 12,
                marginBottom: 12,
                background: cardBg,
                border: `1px solid ${getBorderGlow()}`,
                boxShadow: `0 4px 20px ${getBorderGlow()}, 0 0 40px ${getBorderGlow()}`,
                minWidth: 320,
                maxWidth: 380,
                transform: isExiting ? "translateX(120%)" : "translateX(0)",
                opacity: isExiting ? 0 : 1,
                transition: "all 0.3s ease-out",
                animation: "battleToastSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)"
            }}
        >
            {/* Background gradient */}
            <div style={{
                position: "absolute",
                inset: 0,
                background: getGradient(),
                pointerEvents: "none"
            }} />

            {/* Nuke pulse effect */}
            {event.nukeUsed && (
                <div style={{
                    position: "absolute",
                    inset: -2,
                    background: "rgba(249,115,22,0.2)",
                    animation: "nukePulse 1s ease-in-out infinite",
                    borderRadius: 14,
                    pointerEvents: "none"
                }} />
            )}

            {/* Progress bar */}
            <div style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                height: 3,
                width: `${progress}%`,
                background: getAccentColor(),
                transition: "width 0.1s linear",
                borderRadius: "0 0 0 12px"
            }} />

            {/* Close button */}
            <button
                onClick={handleClose}
                style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    border: "none",
                    background: "rgba(255,255,255,0.1)",
                    color: textMuted,
                    fontSize: 14,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s",
                    zIndex: 10
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.2)";
                    e.currentTarget.style.color = textPrimary;
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                    e.currentTarget.style.color = textMuted;
                }}
            >
                ✕
            </button>

            {/* Toast content */}
            <div style={{ position: "relative", padding: 16, paddingRight: 40 }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 28 }}>{getBattleIcon()}</span>
                    <div style={{ flex: 1 }}>
                        <div style={{ 
                            fontSize: 12, 
                            fontWeight: 800, 
                            color: textPrimary, 
                            letterSpacing: "0.5px",
                            textTransform: "uppercase"
                        }}>
                            {getBattleName()}
                        </div>
                        <div style={{ 
                            fontSize: 10, 
                            color: textMuted, 
                            marginTop: 2 
                        }}>
                            Live Battle Result
                        </div>
                    </div>
                    <div style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        background: event.won ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                        border: `1px solid ${event.won ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`,
                        fontSize: 10,
                        fontWeight: 700,
                        color: event.won ? "#10b981" : "#ef4444"
                    }}>
                        {event.won ? "🏆 VICTORY" : "💀 DEFEATED"}
                    </div>
                </div>

                {/* Nuke badge */}
                {event.nukeUsed && (
                    <div style={{
                        background: "rgba(249,115,22,0.2)",
                        border: "1px solid rgba(249,115,22,0.5)",
                        borderRadius: 6,
                        padding: "4px 8px",
                        marginBottom: 10,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6
                    }}>
                        <span style={{ fontSize: 14 }}>☢️</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#f97316" }}>NUKE DEPLOYED</span>
                    </div>
                )}

                {/* Battle details */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 10, color: textMuted, textTransform: "uppercase" }}>Attacker</span>
                        <span style={{ 
                            fontFamily: "monospace", 
                            fontSize: 12, 
                            fontWeight: 600, 
                            color: textPrimary,
                            background: "rgba(255,255,255,0.1)",
                            padding: "2px 6px",
                            borderRadius: 4
                        }}>
                            {shortenAddress(event.attacker)}
                        </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 10, color: textMuted, textTransform: "uppercase" }}>Target</span>
                        <span style={{ 
                            fontFamily: "monospace", 
                            fontSize: 12, 
                            fontWeight: 600, 
                            color: textPrimary,
                            background: "rgba(255,255,255,0.1)",
                            padding: "2px 6px",
                            borderRadius: 4
                        }}>
                            {shortenAddress(event.defender)}
                        </span>
                    </div>

                    {/* Stolen/Lost amount */}
                    {parseFloat(event.stolen) > 0 && (
                        <div style={{ 
                            display: "flex", 
                            justifyContent: "space-between", 
                            alignItems: "center",
                            marginTop: 4,
                            paddingTop: 6,
                            borderTop: "1px solid rgba(255,255,255,0.1)"
                        }}>
                            <span style={{ fontSize: 10, color: textMuted }}>
                                {event.won ? "💰 Looted" : "💸 Lost"}
                            </span>
                            <span style={{ 
                                fontSize: 14, 
                                fontWeight: 700, 
                                color: event.won ? "#fbbf24" : "#ef4444"
                            }}>
                                {formatTokens(event.stolen)} FCWEED
                            </span>
                        </div>
                    )}

                    {/* Damage */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 10, color: textMuted }}>💥 Damage</span>
                        <span style={{ fontSize: 11, color: textMuted, fontWeight: 500 }}>{event.damage}%</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Main component
export function BattleEventToast({ theme, readProvider, enabled = true, onBattleEvent }: Props) {
    const [events, setEvents] = useState<BattleEvent[]>([]);
    const nukeTargetsRef = useRef<Set<string>>(new Set());
    const contractRef = useRef<ethers.Contract | null>(null);
    const onBattleEventRef = useRef(onBattleEvent);
    const refreshDebounceRef = useRef<NodeJS.Timeout | null>(null);

    // Keep callback ref updated
    useEffect(() => {
        onBattleEventRef.current = onBattleEvent;
    }, [onBattleEvent]);

    // Debounced refresh - waits 2 seconds after last event before triggering refresh
    // This prevents spam if multiple battles happen quickly
    const triggerRefresh = useCallback(() => {
        if (refreshDebounceRef.current) {
            clearTimeout(refreshDebounceRef.current);
        }
        refreshDebounceRef.current = setTimeout(() => {
            if (onBattleEventRef.current) {
                console.log("[BattleToast] 🔄 Triggering live data refresh");
                onBattleEventRef.current();
            }
        }, 2000); // 2 second debounce
    }, []);

    const addEvent = useCallback((event: BattleEvent) => {
        setEvents((prev) => [event, ...prev].slice(0, 5)); // Max 5 toasts
    }, []);

    const removeEvent = useCallback((id: string) => {
        setEvents((prev) => prev.filter((e) => e.id !== id));
    }, []);

    useEffect(() => {
        if (!enabled || !readProvider) return;

        const setupListener = async () => {
            try {
                const contract = new ethers.Contract(BATTLE_CONTRACT, BATTLE_ABI, readProvider);
                contractRef.current = contract;

                // Listen for NukeUsed
                contract.on("NukeUsed", (attacker: string, target: string) => {
                    const key = `${attacker.toLowerCase()}-${target.toLowerCase()}`;
                    nukeTargetsRef.current.add(key);
                    setTimeout(() => nukeTargetsRef.current.delete(key), 5000);
                });

                // Listen for CartelResult
                contract.on("CartelResult", (
                    attacker: string, defender: string, won: boolean,
                    _ap: ethers.BigNumber, _dp: ethers.BigNumber,
                    stolen: ethers.BigNumber, damage: ethers.BigNumber
                ) => {
                    const nukeKey = `${attacker.toLowerCase()}-${defender.toLowerCase()}`;
                    addEvent({
                        id: `cartel-${Date.now()}-${Math.random()}`,
                        type: "cartel",
                        attacker, defender, won,
                        stolen: stolen.toString(),
                        damage: damage.toNumber(),
                        nukeUsed: nukeTargetsRef.current.has(nukeKey),
                        timestamp: Date.now()
                    });
                    triggerRefresh(); // Live update for all players
                });

                // Listen for DeaResult
                contract.on("DeaResult", (
                    attacker: string, target: string, won: boolean,
                    _ap: ethers.BigNumber, _dp: ethers.BigNumber,
                    stolen: ethers.BigNumber, damage: ethers.BigNumber
                ) => {
                    const nukeKey = `${attacker.toLowerCase()}-${target.toLowerCase()}`;
                    addEvent({
                        id: `dea-${Date.now()}-${Math.random()}`,
                        type: "dea",
                        attacker, defender: target, won,
                        stolen: stolen.toString(),
                        damage: damage.toNumber(),
                        nukeUsed: nukeTargetsRef.current.has(nukeKey),
                        timestamp: Date.now()
                    });
                    triggerRefresh(); // Live update for all players
                });

                // Listen for PurgeResult
                contract.on("PurgeResult", (
                    attacker: string, target: string, won: boolean,
                    _ap: ethers.BigNumber, _dp: ethers.BigNumber,
                    stolen: ethers.BigNumber, damage: ethers.BigNumber
                ) => {
                    const nukeKey = `${attacker.toLowerCase()}-${target.toLowerCase()}`;
                    addEvent({
                        id: `purge-${Date.now()}-${Math.random()}`,
                        type: "purge",
                        attacker, defender: target, won,
                        stolen: stolen.toString(),
                        damage: damage.toNumber(),
                        nukeUsed: nukeTargetsRef.current.has(nukeKey),
                        timestamp: Date.now()
                    });
                    triggerRefresh(); // Live update for all players
                });

                console.log("[BattleToast] 🎮 Event listeners active");
            } catch (error) {
                console.error("[BattleToast] Setup failed:", error);
            }
        };

        setupListener();

        return () => {
            if (contractRef.current) {
                contractRef.current.removeAllListeners();
                console.log("[BattleToast] 🎮 Event listeners stopped");
            }
            // Clean up debounce timeout
            if (refreshDebounceRef.current) {
                clearTimeout(refreshDebounceRef.current);
            }
        };
    }, [enabled, readProvider, addEvent, triggerRefresh]);

    if (!enabled) return null;

    return (
        <>
            {/* CSS animations */}
            <style>{`
                @keyframes battleToastSlideIn {
                    0% {
                        opacity: 0;
                        transform: translateX(120%);
                    }
                    60% {
                        transform: translateX(-8px);
                    }
                    100% {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }
                
                @keyframes nukePulse {
                    0%, 100% { opacity: 0.3; }
                    50% { opacity: 0.8; }
                }
            `}</style>

            {/* Toast container - fixed bottom right */}
            {/* z-index 5000 to stay below wallet modals (usually 10000+) */}
            <div
                style={{
                    position: "fixed",
                    bottom: 20,
                    right: 20,
                    zIndex: 5000,
                    display: "flex",
                    flexDirection: "column-reverse",
                    pointerEvents: "none"
                }}
            >
                {events.map((event) => (
                    <div key={event.id} style={{ pointerEvents: "auto" }}>
                        <Toast
                            event={event}
                            onRemove={() => removeEvent(event.id)}
                            theme={theme}
                        />
                    </div>
                ))}
            </div>
        </>
    );
}

export default BattleEventToast;
