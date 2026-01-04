"use client";

import { useState, useEffect, useRef } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

// Notification types and their default states
export interface NotificationPreferences {
    // Shop & Economy
    shopRestock: boolean;          // Item Shop Restock (7pm EST)
    waterShopOpen: boolean;        // Water Shop Open (12pm EST)
    waterShopClose: boolean;       // Water Shop Close (6pm EST)
    
    // Battle Events
    purgeStarted: boolean;         // Purge LIVE
    purgeEnded: boolean;           // Purge is Over
    attacked: boolean;             // You've been attacked
    battleResult: boolean;         // Battle won/lost
    
    // Cooldowns
    cartelCooldown: boolean;       // Cartel Wars cooldown ready
    purgeCooldown: boolean;        // Purge attack cooldown ready
    deaCooldown: boolean;          // DEA Raid cooldown ready
    
    // Expiring Items
    shieldExpiring: boolean;       // Shield expiring (10 min warning)
    weaponExpiring: boolean;       // AK-47/RPG expiring
    nukeExpiring: boolean;         // Nuke expiring
    boostExpiring: boolean;        // Attack boost expiring
    
    // Farm Alerts
    plantHealthCritical: boolean;  // Plant below 20% health
    pendingMilestone: boolean;     // Pending rewards milestone
    
    // Other
    referralUsed: boolean;         // Someone used your referral
    deaListFlagged: boolean;       // You're flagged on DEA list
    crateJackpot: boolean;         // Won jackpot from crate
    newDeaTarget: boolean;         // New suspect available to raid
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
    shopRestock: true,
    waterShopOpen: false,
    waterShopClose: false,
    purgeStarted: true,
    purgeEnded: false,
    attacked: true,
    battleResult: true,
    cartelCooldown: true,
    purgeCooldown: true,
    deaCooldown: true,
    shieldExpiring: true,
    weaponExpiring: false,
    nukeExpiring: true,
    boostExpiring: false,
    plantHealthCritical: true,
    pendingMilestone: false,
    referralUsed: true,
    deaListFlagged: true,
    crateJackpot: true,
    newDeaTarget: false,
};

const NOTIFICATION_LABELS: Record<keyof NotificationPreferences, { label: string; emoji: string; description: string }> = {
    shopRestock: { label: "Shop Restock", emoji: "🛒", description: "Daily at 7pm EST" },
    waterShopOpen: { label: "Water Shop Open", emoji: "💧", description: "Daily at 12pm EST" },
    waterShopClose: { label: "Water Shop Close", emoji: "🚫", description: "Daily at 6pm EST" },
    purgeStarted: { label: "Purge Started", emoji: "💀", description: "When Purge goes LIVE" },
    purgeEnded: { label: "Purge Ended", emoji: "✅", description: "When Purge ends" },
    attacked: { label: "Under Attack", emoji: "⚔️", description: "When your farm takes damage" },
    battleResult: { label: "Battle Results", emoji: "🏆", description: "Win/loss notifications" },
    cartelCooldown: { label: "Cartel Wars Ready", emoji: "🎯", description: "Attack cooldown finished" },
    purgeCooldown: { label: "Purge Attack Ready", emoji: "💀", description: "Purge cooldown finished" },
    deaCooldown: { label: "DEA Raid Ready", emoji: "🚔", description: "DEA cooldown finished" },
    shieldExpiring: { label: "Shield Expiring", emoji: "🛡️", description: "10 min before expiry" },
    weaponExpiring: { label: "Weapon Expiring", emoji: "🔫", description: "AK-47/RPG expiring soon" },
    nukeExpiring: { label: "Nuke Expiring", emoji: "☢️", description: "10 min before expiry" },
    boostExpiring: { label: "Boost Expiring", emoji: "⚡", description: "Attack boost expiring" },
    plantHealthCritical: { label: "Plant Health Critical", emoji: "🌱", description: "Plants below 20% health" },
    pendingMilestone: { label: "Rewards Milestone", emoji: "💰", description: "Hit 100K/500K/1M pending" },
    referralUsed: { label: "Referral Used", emoji: "👥", description: "Someone used your code" },
    deaListFlagged: { label: "DEA List Alert", emoji: "🚨", description: "You've been flagged" },
    crateJackpot: { label: "Crate Jackpot", emoji: "🎁", description: "Won big from crates" },
    newDeaTarget: { label: "New DEA Target", emoji: "🎯", description: "New suspect to raid" },
};

const NOTIFICATION_CATEGORIES = [
    {
        title: "🛒 Shop & Economy",
        keys: ["shopRestock", "waterShopOpen", "waterShopClose"] as (keyof NotificationPreferences)[],
    },
    {
        title: "⚔️ Battle Events", 
        keys: ["purgeStarted", "purgeEnded", "attacked", "battleResult"] as (keyof NotificationPreferences)[],
    },
    {
        title: "⏰ Cooldowns Ready",
        keys: ["cartelCooldown", "purgeCooldown", "deaCooldown"] as (keyof NotificationPreferences)[],
    },
    {
        title: "⚠️ Expiring Items",
        keys: ["shieldExpiring", "weaponExpiring", "nukeExpiring", "boostExpiring"] as (keyof NotificationPreferences)[],
    },
    {
        title: "🌿 Farm Alerts",
        keys: ["plantHealthCritical", "pendingMilestone"] as (keyof NotificationPreferences)[],
    },
    {
        title: "📢 Other",
        keys: ["referralUsed", "deaListFlagged", "crateJackpot", "newDeaTarget"] as (keyof NotificationPreferences)[],
    },
];

interface Props {
    theme: "dark" | "light";
    userAddress?: string;
    backendUrl?: string;
}

export function NotificationSettings({ theme, userAddress, backendUrl }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);
    const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string>("");
    const [fid, setFid] = useState<number | null>(null);
    const [manualFid, setManualFid] = useState<string>("");
    const [inFarcasterContext, setInFarcasterContext] = useState(false);

    // Load preferences from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem("fcweed_notification_prefs");
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
            } catch {}
        }
        
        const enabled = localStorage.getItem("fcweed_notifications_enabled") === "true";
        setNotificationsEnabled(enabled);
        
        const savedFid = localStorage.getItem("fcweed_fid");
        if (savedFid) {
            setFid(Number(savedFid));
            setManualFid(savedFid);
        }

        // Get Farcaster FID if in frame context
        const getFid = async () => {
            try {
                const context = await sdk.context;
                if (context?.user?.fid) {
                    setFid(context.user.fid);
                    setManualFid(String(context.user.fid));
                    setInFarcasterContext(true);
                    localStorage.setItem("fcweed_fid", String(context.user.fid));
                }
            } catch {}
        };
        getFid();
    }, []);

    // Save preferences to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem("fcweed_notification_prefs", JSON.stringify(preferences));
    }, [preferences]);

    // Request notification permission from Farcaster
    const enableNotifications = async () => {
        // Check if we have an FID (either from context or manual entry)
        const effectiveFid = fid || (manualFid ? Number(manualFid) : null);
        
        if (!effectiveFid) {
            setStatus("❌ Enter your Farcaster FID first");
            return;
        }
        
        setLoading(true);
        setStatus("Enabling notifications...");
        
        try {
            // Try to add frame if in Farcaster context (but don't fail if not)
            if (inFarcasterContext) {
                try {
                    await sdk.actions.addFrame();
                } catch (e) {
                    console.log("[Notifications] addFrame not available, continuing anyway");
                }
            }
            
            // Register with backend - this is what actually matters
            if (backendUrl && userAddress) {
                const response = await fetch(`${backendUrl}/api/notifications/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        address: userAddress,
                        fid: effectiveFid,
                        preferences: preferences,
                    }),
                });
                
                if (response.ok) {
                    setNotificationsEnabled(true);
                    localStorage.setItem("fcweed_notifications_enabled", "true");
                    localStorage.setItem("fcweed_fid", String(effectiveFid));
                    setFid(effectiveFid);
                    setStatus("✅ Notifications enabled!");
                } else {
                    const err = await response.json();
                    setStatus(`❌ ${err.error || "Registration failed"}`);
                }
            } else {
                // Just save locally if no backend or no wallet
                setNotificationsEnabled(true);
                localStorage.setItem("fcweed_notifications_enabled", "true");
                localStorage.setItem("fcweed_fid", String(effectiveFid));
                setFid(effectiveFid);
                setStatus("✅ Preferences saved!");
            }
        } catch (e: any) {
            console.error("[Notifications] Enable failed:", e);
            // Still enable locally even if backend fails
            setNotificationsEnabled(true);
            localStorage.setItem("fcweed_notifications_enabled", "true");
            localStorage.setItem("fcweed_fid", String(effectiveFid));
            setFid(effectiveFid);
            setStatus("✅ Saved locally (backend unavailable)");
        }
        
        setLoading(false);
        setTimeout(() => setStatus(""), 3000);
    };

    const disableNotifications = async () => {
        setNotificationsEnabled(false);
        localStorage.setItem("fcweed_notifications_enabled", "false");
        setStatus("Notifications disabled");
        
        // Unregister from backend
        if (backendUrl && userAddress) {
            try {
                await fetch(`${backendUrl}/api/notifications/unregister`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ address: userAddress }),
                });
            } catch {}
        }
        
        setTimeout(() => setStatus(""), 2000);
    };

    const togglePreference = (key: keyof NotificationPreferences) => {
        const newPrefs = { ...preferences, [key]: !preferences[key] };
        setPreferences(newPrefs);
        
        // Sync with backend
        if (backendUrl && userAddress && notificationsEnabled) {
            fetch(`${backendUrl}/api/notifications/preferences`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    address: userAddress,
                    preferences: newPrefs,
                }),
            }).catch(() => {});
        }
    };

    const enableAll = () => {
        const allEnabled = Object.fromEntries(
            Object.keys(preferences).map(k => [k, true])
        ) as NotificationPreferences;
        setPreferences(allEnabled);
    };

    const disableAll = () => {
        const allDisabled = Object.fromEntries(
            Object.keys(preferences).map(k => [k, false])
        ) as NotificationPreferences;
        setPreferences(allDisabled);
    };

    const isDark = theme === "dark";
    const enabledCount = Object.values(preferences).filter(Boolean).length;

    return (
        <>
            {/* Bell Icon Button */}
            <button
                onClick={() => setIsOpen(true)}
                style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: `1px solid ${isDark ? "rgba(255,255,255,0.2)" : "#cbd5e1"}`,
                    background: isDark ? "rgba(255,255,255,0.1)" : "#f1f5f9",
                    color: isDark ? "#fff" : "#1e293b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    position: "relative",
                }}
                title="Notification Settings"
            >
                🔔
                {/* Green dot when enabled */}
                {notificationsEnabled && (
                    <span style={{
                        position: "absolute",
                        top: -2,
                        right: -2,
                        width: 10,
                        height: 10,
                        background: "#22c55e",
                        borderRadius: "50%",
                        border: `2px solid ${isDark ? "#1f2937" : "#fff"}`,
                    }} />
                )}
            </button>

            {/* Modal Overlay */}
            {isOpen && (
                <div
                    onClick={() => setIsOpen(false)}
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: "rgba(0,0,0,0.7)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 9999,
                        padding: 16,
                    }}
                >
                    {/* Modal Content */}
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: 400,
                            maxHeight: "80vh",
                            overflowY: "auto",
                            borderRadius: 16,
                            background: isDark ? "#1f2937" : "#fff",
                            border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            position: "sticky",
                            top: 0,
                            padding: 16,
                            borderBottom: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                            background: isDark ? "#1f2937" : "#fff",
                            borderRadius: "16px 16px 0 0",
                        }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: isDark ? "#fff" : "#1f2937" }}>
                                    🔔 Notifications
                                </h3>
                                <button 
                                    onClick={() => setIsOpen(false)}
                                    style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: 8,
                                        border: "none",
                                        background: isDark ? "#374151" : "#f3f4f6",
                                        color: isDark ? "#9ca3af" : "#6b7280",
                                        cursor: "pointer",
                                        fontSize: 16,
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                            
                            {/* FID Input (show when FID not already set) */}
                            {!fid && !notificationsEnabled && (
                                <div style={{ marginBottom: 12 }}>
                                    <label style={{ 
                                        display: "block", 
                                        fontSize: 12, 
                                        color: isDark ? "#9ca3af" : "#6b7280",
                                        marginBottom: 4 
                                    }}>
                                        Your Farcaster FID {inFarcasterContext ? "(auto-detected)" : "(find in Warpcast → Settings)"}
                                    </label>
                                    <input
                                        type="number"
                                        value={manualFid}
                                        onChange={(e) => setManualFid(e.target.value)}
                                        placeholder="e.g. 12345"
                                        style={{
                                            width: "100%",
                                            padding: "8px 12px",
                                            borderRadius: 8,
                                            border: `1px solid ${isDark ? "#4b5563" : "#d1d5db"}`,
                                            background: isDark ? "#374151" : "#f9fafb",
                                            color: isDark ? "#fff" : "#1f2937",
                                            fontSize: 14,
                                        }}
                                    />
                                </div>
                            )}
                            
                            {/* Master Toggle */}
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: 12,
                                borderRadius: 8,
                                background: isDark ? "#374151" : "#f3f4f6",
                            }}>
                                <div>
                                    <div style={{ fontWeight: 600, color: isDark ? "#fff" : "#1f2937" }}>
                                        {notificationsEnabled ? "✅ Enabled" : "❌ Disabled"}
                                    </div>
                                    <div style={{ fontSize: 12, color: isDark ? "#9ca3af" : "#6b7280" }}>
                                        {notificationsEnabled ? `${enabledCount} alerts active` : "Click to enable"}
                                    </div>
                                </div>
                                <button
                                    onClick={notificationsEnabled ? disableNotifications : enableNotifications}
                                    disabled={loading}
                                    style={{
                                        padding: "8px 16px",
                                        borderRadius: 8,
                                        border: "none",
                                        fontWeight: 600,
                                        fontSize: 14,
                                        cursor: loading ? "not-allowed" : "pointer",
                                        opacity: loading ? 0.5 : 1,
                                        background: notificationsEnabled ? "#ef4444" : "#22c55e",
                                        color: "#fff",
                                    }}
                                >
                                    {loading ? "..." : notificationsEnabled ? "Disable" : "Enable"}
                                </button>
                            </div>
                            
                            {status && (
                                <div style={{
                                    marginTop: 8,
                                    fontSize: 13,
                                    textAlign: "center",
                                    color: status.includes("✅") ? "#22c55e" : status.includes("❌") ? "#ef4444" : isDark ? "#9ca3af" : "#6b7280",
                                }}>
                                    {status}
                                </div>
                            )}

                            {/* Quick Actions */}
                            {notificationsEnabled && (
                                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                                    <button
                                        onClick={enableAll}
                                        style={{
                                            flex: 1,
                                            padding: "6px 12px",
                                            fontSize: 12,
                                            borderRadius: 6,
                                            border: "none",
                                            fontWeight: 500,
                                            background: isDark ? "#4b5563" : "#e5e7eb",
                                            color: isDark ? "#fff" : "#374151",
                                            cursor: "pointer",
                                        }}
                                    >
                                        Enable All
                                    </button>
                                    <button
                                        onClick={disableAll}
                                        style={{
                                            flex: 1,
                                            padding: "6px 12px",
                                            fontSize: 12,
                                            borderRadius: 6,
                                            border: "none",
                                            fontWeight: 500,
                                            background: isDark ? "#4b5563" : "#e5e7eb",
                                            color: isDark ? "#fff" : "#374151",
                                            cursor: "pointer",
                                        }}
                                    >
                                        Disable All
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Notification Categories */}
                        {notificationsEnabled && (
                            <div style={{ padding: 12 }}>
                                {NOTIFICATION_CATEGORIES.map((category, idx) => (
                                    <div key={idx} style={{ marginBottom: 16 }}>
                                        <div style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.05em",
                                            marginBottom: 8,
                                            color: isDark ? "#9ca3af" : "#6b7280",
                                        }}>
                                            {category.title}
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                            {category.keys.map((key) => {
                                                const info = NOTIFICATION_LABELS[key];
                                                return (
                                                    <button
                                                        key={key}
                                                        onClick={() => togglePreference(key)}
                                                        style={{
                                                            width: "100%",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "space-between",
                                                            padding: "8px 12px",
                                                            borderRadius: 8,
                                                            border: "none",
                                                            background: isDark ? "#374151" : "#f9fafb",
                                                            cursor: "pointer",
                                                            textAlign: "left",
                                                        }}
                                                    >
                                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                            <span style={{ fontSize: 16 }}>{info.emoji}</span>
                                                            <div>
                                                                <div style={{ fontSize: 13, fontWeight: 500, color: isDark ? "#fff" : "#1f2937" }}>
                                                                    {info.label}
                                                                </div>
                                                                <div style={{ fontSize: 11, color: isDark ? "#6b7280" : "#9ca3af" }}>
                                                                    {info.description}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {/* Toggle Switch */}
                                                        <div style={{
                                                            width: 40,
                                                            height: 24,
                                                            borderRadius: 12,
                                                            padding: 2,
                                                            background: preferences[key] ? "#22c55e" : isDark ? "#4b5563" : "#d1d5db",
                                                            transition: "background 0.2s",
                                                        }}>
                                                            <div style={{
                                                                width: 20,
                                                                height: 20,
                                                                borderRadius: 10,
                                                                background: "#fff",
                                                                transition: "transform 0.2s",
                                                                transform: preferences[key] ? "translateX(16px)" : "translateX(0)",
                                                            }} />
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Footer */}
                        <div style={{
                            padding: 12,
                            borderTop: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                            textAlign: "center",
                        }}>
                            <div style={{ fontSize: 11, color: isDark ? "#6b7280" : "#9ca3af" }}>
                                {fid ? `FID: ${fid}` : "Enter FID to receive Farcaster notifications"}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// Export types for backend use
export type { NotificationPreferences };
export { DEFAULT_PREFERENCES, NOTIFICATION_LABELS };
