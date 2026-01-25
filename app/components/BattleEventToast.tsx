"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";

// Battle contract address (same as V5_BATTLES_ADDRESS)
const BATTLE_CONTRACT = "0x7001478C4D924bf2cB48E5F4e0d66BeC56098a00";

// WebSocket RPC for reliable real-time events (free)
const WSS_RPC_URL = "wss://base.publicnode.com";

// Fallback HTTP for polling (if WS fails)
const HTTP_RPC_URL = "https://base.publicnode.com";

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
    const wsProviderRef = useRef<ethers.providers.WebSocketProvider | null>(null);
    const contractRef = useRef<ethers.Contract | null>(null);
    const onBattleEventRef = useRef(onBattleEvent);
    const refreshDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const lastBlockRef = useRef<number>(0);
    const seenEventsRef = useRef<Set<string>>(new Set());
    const pollingIntervalRef = useRef<NodeJS.Timer | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Keep callback ref updated
    useEffect(() => {
        onBattleEventRef.current = onBattleEvent;
    }, [onBattleEvent]);

    // Debounced refresh - waits 2 seconds after last event before triggering refresh
    const triggerRefresh = useCallback(() => {
        if (refreshDebounceRef.current) {
            clearTimeout(refreshDebounceRef.current);
        }
        refreshDebounceRef.current = setTimeout(() => {
            if (onBattleEventRef.current) {
                console.log("[BattleToast] 🔄 Triggering live data refresh");
                onBattleEventRef.current();
            }
        }, 2000);
    }, []);

    const addEvent = useCallback((event: BattleEvent) => {
        // Deduplicate events using unique ID
        if (seenEventsRef.current.has(event.id)) return;
        seenEventsRef.current.add(event.id);
        // Keep only last 100 seen IDs to prevent memory leak
        if (seenEventsRef.current.size > 100) {
            const arr = Array.from(seenEventsRef.current);
            seenEventsRef.current = new Set(arr.slice(-50));
        }
        setEvents((prev) => [event, ...prev].slice(0, 5)); // Max 5 toasts
    }, []);

    const removeEvent = useCallback((id: string) => {
        setEvents((prev) => prev.filter((e) => e.id !== id));
    }, []);

    useEffect(() => {
        if (!enabled || !readProvider) return;

        let isMounted = true;
        let wsProvider: ethers.providers.WebSocketProvider | null = null;
        const iface = new ethers.utils.Interface(BATTLE_ABI);

        // Setup event handlers for a contract
        const setupContractListeners = (contract: ethers.Contract, providerType: string) => {
            contract.on("NukeUsed", (attacker: string, target: string) => {
                const key = `${attacker.toLowerCase()}-${target.toLowerCase()}`;
                nukeTargetsRef.current.add(key);
                setTimeout(() => nukeTargetsRef.current.delete(key), 5000);
            });

            contract.on("CartelResult", (attacker, defender, won, _ap, _dp, stolen, damage, event) => {
                const eventId = `cartel-${event.transactionHash}-${event.logIndex}`;
                const nukeKey = `${attacker.toLowerCase()}-${defender.toLowerCase()}`;
                addEvent({
                    id: eventId,
                    type: "cartel",
                    attacker, defender, won,
                    stolen: stolen.toString(),
                    damage: damage.toNumber(),
                    nukeUsed: nukeTargetsRef.current.has(nukeKey),
                    timestamp: Date.now()
                });
                triggerRefresh();
            });

            contract.on("DeaResult", (attacker, target, won, _ap, _dp, stolen, damage, event) => {
                const eventId = `dea-${event.transactionHash}-${event.logIndex}`;
                const nukeKey = `${attacker.toLowerCase()}-${target.toLowerCase()}`;
                addEvent({
                    id: eventId,
                    type: "dea",
                    attacker, defender: target, won,
                    stolen: stolen.toString(),
                    damage: damage.toNumber(),
                    nukeUsed: nukeTargetsRef.current.has(nukeKey),
                    timestamp: Date.now()
                });
                triggerRefresh();
            });

            contract.on("PurgeResult", (attacker, target, won, _ap, _dp, stolen, damage, event) => {
                const eventId = `purge-${event.transactionHash}-${event.logIndex}`;
                const nukeKey = `${attacker.toLowerCase()}-${target.toLowerCase()}`;
                addEvent({
                    id: eventId,
                    type: "purge",
                    attacker, defender: target, won,
                    stolen: stolen.toString(),
                    damage: damage.toNumber(),
                    nukeUsed: nukeTargetsRef.current.has(nukeKey),
                    timestamp: Date.now()
                });
                triggerRefresh();
            });

            console.log(`[BattleToast] 🎮 Event listeners active (${providerType})`);
        };

        // Try to connect via WebSocket for real-time events
        const connectWebSocket = () => {
            if (!isMounted) return;
            
            try {
                console.log("[BattleToast] 🔌 Connecting WebSocket...");
                wsProvider = new ethers.providers.WebSocketProvider(WSS_RPC_URL);
                wsProviderRef.current = wsProvider;

                wsProvider.on("error", (error) => {
                    console.warn("[BattleToast] WebSocket error:", error.message);
                });

                // Handle WebSocket close/disconnect
                const ws = (wsProvider as any)._websocket;
                if (ws) {
                    ws.onclose = () => {
                        console.warn("[BattleToast] WebSocket closed, will reconnect...");
                        if (isMounted && !reconnectTimeoutRef.current) {
                            reconnectTimeoutRef.current = setTimeout(() => {
                                reconnectTimeoutRef.current = null;
                                connectWebSocket();
                            }, 5000);
                        }
                    };
                }

                const wsContract = new ethers.Contract(BATTLE_CONTRACT, BATTLE_ABI, wsProvider);
                setupContractListeners(wsContract, "WebSocket");
                
            } catch (e) {
                console.warn("[BattleToast] WebSocket connection failed, using HTTP polling:", e);
            }
        };

        // HTTP polling fallback - checks recent blocks for events
        const pollForEvents = async () => {
            if (!isMounted) return;
            
            try {
                const currentBlock = await readProvider.getBlockNumber();
                
                // On first poll, just set the block number
                if (lastBlockRef.current === 0) {
                    lastBlockRef.current = currentBlock;
                    return;
                }

                // Skip if no new blocks
                if (currentBlock <= lastBlockRef.current) return;

                // Query events from missed blocks (max 10 blocks back)
                const fromBlock = Math.max(lastBlockRef.current + 1, currentBlock - 10);
                
                const contract = new ethers.Contract(BATTLE_CONTRACT, BATTLE_ABI, readProvider);
                
                // Query each event type
                const [cartelLogs, deaLogs, purgeLogs, nukeLogs] = await Promise.all([
                    contract.queryFilter(contract.filters.CartelResult(), fromBlock, currentBlock),
                    contract.queryFilter(contract.filters.DeaResult(), fromBlock, currentBlock),
                    contract.queryFilter(contract.filters.PurgeResult(), fromBlock, currentBlock),
                    contract.queryFilter(contract.filters.NukeUsed(), fromBlock, currentBlock),
                ]);

                // Process nuke events first
                for (const log of nukeLogs) {
                    const decoded = iface.parseLog(log);
                    const key = `${decoded.args.attacker.toLowerCase()}-${decoded.args.target.toLowerCase()}`;
                    nukeTargetsRef.current.add(key);
                    setTimeout(() => nukeTargetsRef.current.delete(key), 5000);
                }

                // Process battle events
                for (const log of cartelLogs) {
                    const eventId = `cartel-${log.transactionHash}-${log.logIndex}`;
                    if (seenEventsRef.current.has(eventId)) continue;
                    const decoded = iface.parseLog(log);
                    const nukeKey = `${decoded.args.attacker.toLowerCase()}-${decoded.args.defender.toLowerCase()}`;
                    addEvent({
                        id: eventId,
                        type: "cartel",
                        attacker: decoded.args.attacker,
                        defender: decoded.args.defender,
                        won: decoded.args.won,
                        stolen: decoded.args.stolen.toString(),
                        damage: decoded.args.damage.toNumber(),
                        nukeUsed: nukeTargetsRef.current.has(nukeKey),
                        timestamp: Date.now()
                    });
                    triggerRefresh();
                }

                for (const log of deaLogs) {
                    const eventId = `dea-${log.transactionHash}-${log.logIndex}`;
                    if (seenEventsRef.current.has(eventId)) continue;
                    const decoded = iface.parseLog(log);
                    const nukeKey = `${decoded.args.attacker.toLowerCase()}-${decoded.args.target.toLowerCase()}`;
                    addEvent({
                        id: eventId,
                        type: "dea",
                        attacker: decoded.args.attacker,
                        defender: decoded.args.target,
                        won: decoded.args.won,
                        stolen: decoded.args.stolen.toString(),
                        damage: decoded.args.damage.toNumber(),
                        nukeUsed: nukeTargetsRef.current.has(nukeKey),
                        timestamp: Date.now()
                    });
                    triggerRefresh();
                }

                for (const log of purgeLogs) {
                    const eventId = `purge-${log.transactionHash}-${log.logIndex}`;
                    if (seenEventsRef.current.has(eventId)) continue;
                    const decoded = iface.parseLog(log);
                    const nukeKey = `${decoded.args.attacker.toLowerCase()}-${decoded.args.target.toLowerCase()}`;
                    addEvent({
                        id: eventId,
                        type: "purge",
                        attacker: decoded.args.attacker,
                        defender: decoded.args.target,
                        won: decoded.args.won,
                        stolen: decoded.args.stolen.toString(),
                        damage: decoded.args.damage.toNumber(),
                        nukeUsed: nukeTargetsRef.current.has(nukeKey),
                        timestamp: Date.now()
                    });
                    triggerRefresh();
                }

                lastBlockRef.current = currentBlock;
            } catch (e) {
                // Silently fail - will retry on next poll
            }
        };

        // Initialize
        const init = async () => {
            // Try WebSocket first for real-time events
            connectWebSocket();
            
            // Also set up HTTP polling as backup (every 3 seconds)
            // This catches any events that WebSocket might miss
            pollingIntervalRef.current = setInterval(pollForEvents, 3000);
            
            // Initial poll to get current block
            pollForEvents();
        };

        init();

        return () => {
            isMounted = false;
            
            if (wsProviderRef.current) {
                try {
                    wsProviderRef.current.removeAllListeners();
                    wsProviderRef.current.destroy();
                } catch (e) {}
                wsProviderRef.current = null;
            }
            
            if (contractRef.current) {
                contractRef.current.removeAllListeners();
            }
            
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
            
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            
            if (refreshDebounceRef.current) {
                clearTimeout(refreshDebounceRef.current);
            }
            
            console.log("[BattleToast] 🎮 Event listeners stopped");
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
