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
    const menuRef = useRef<HTMLDivElement>(null);

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

        // Get Farcaster FID if in frame context
        const getFid = async () => {
            try {
                const context = await sdk.context;
                if (context?.user?.fid) {
                    setFid(context.user.fid);
                }
            } catch {}
        };
        getFid();
    }, []);

    // Close menu on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Save preferences to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem("fcweed_notification_prefs", JSON.stringify(preferences));
    }, [preferences]);

    // Request notification permission from Farcaster
    const enableNotifications = async () => {
        setLoading(true);
        setStatus("Requesting permission...");
        
        try {
            // Request notification permission via Farcaster SDK
            const result = await sdk.actions.addFrame();
            
            if (result?.added) {
                setNotificationsEnabled(true);
                localStorage.setItem("fcweed_notifications_enabled", "true");
                setStatus("✅ Notifications enabled!");
                
                // Register with backend
                if (backendUrl && userAddress && fid) {
                    try {
                        await fetch(`${backendUrl}/api/notifications/register`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                address: userAddress,
                                fid: fid,
                                preferences: preferences,
                            }),
                        });
                    } catch (e) {
                        console.error("[Notifications] Backend registration failed:", e);
                    }
                }
            } else {
                setStatus("❌ Permission denied");
            }
        } catch (e: any) {
            console.error("[Notifications] Enable failed:", e);
            setStatus("❌ Not in Farcaster frame");
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
        <div className="relative" ref={menuRef}>
            {/* Bell Icon Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`p-2 rounded-lg transition-colors relative ${
                    isDark 
                        ? "hover:bg-gray-700 text-gray-300" 
                        : "hover:bg-gray-200 text-gray-600"
                }`}
                title="Notification Settings"
            >
                <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    width="20" 
                    height="20" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                >
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {/* Notification badge */}
                {notificationsEnabled && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900" />
                )}
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div 
                    className={`absolute right-0 top-12 w-80 max-h-[70vh] overflow-y-auto rounded-xl shadow-2xl z-50 ${
                        isDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"
                    }`}
                >
                    {/* Header */}
                    <div className={`sticky top-0 p-4 border-b ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className={`font-bold text-lg ${isDark ? "text-white" : "text-gray-900"}`}>
                                🔔 Notifications
                            </h3>
                            <button 
                                onClick={() => setIsOpen(false)}
                                className={`p-1 rounded ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
                            >
                                ✕
                            </button>
                        </div>
                        
                        {/* Master Toggle */}
                        <div className={`flex items-center justify-between p-3 rounded-lg ${
                            isDark ? "bg-gray-700" : "bg-gray-100"
                        }`}>
                            <div>
                                <div className={`font-medium ${isDark ? "text-white" : "text-gray-900"}`}>
                                    {notificationsEnabled ? "✅ Enabled" : "❌ Disabled"}
                                </div>
                                <div className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                                    {notificationsEnabled ? `${enabledCount} alerts active` : "Click to enable"}
                                </div>
                            </div>
                            <button
                                onClick={notificationsEnabled ? disableNotifications : enableNotifications}
                                disabled={loading}
                                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                                    notificationsEnabled
                                        ? "bg-red-500 hover:bg-red-600 text-white"
                                        : "bg-green-500 hover:bg-green-600 text-white"
                                } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                                {loading ? "..." : notificationsEnabled ? "Disable" : "Enable"}
                            </button>
                        </div>
                        
                        {status && (
                            <div className={`mt-2 text-sm text-center ${
                                status.includes("✅") ? "text-green-400" : 
                                status.includes("❌") ? "text-red-400" : 
                                isDark ? "text-gray-400" : "text-gray-500"
                            }`}>
                                {status}
                            </div>
                        )}

                        {/* Quick Actions */}
                        {notificationsEnabled && (
                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={enableAll}
                                    className={`flex-1 py-1.5 text-xs rounded font-medium ${
                                        isDark ? "bg-gray-600 hover:bg-gray-500 text-white" : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                                    }`}
                                >
                                    Enable All
                                </button>
                                <button
                                    onClick={disableAll}
                                    className={`flex-1 py-1.5 text-xs rounded font-medium ${
                                        isDark ? "bg-gray-600 hover:bg-gray-500 text-white" : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                                    }`}
                                >
                                    Disable All
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Notification Categories */}
                    {notificationsEnabled && (
                        <div className="p-3">
                            {NOTIFICATION_CATEGORIES.map((category, idx) => (
                                <div key={idx} className="mb-4">
                                    <div className={`text-xs font-bold uppercase tracking-wide mb-2 ${
                                        isDark ? "text-gray-400" : "text-gray-500"
                                    }`}>
                                        {category.title}
                                    </div>
                                    <div className="space-y-1">
                                        {category.keys.map((key) => {
                                            const info = NOTIFICATION_LABELS[key];
                                            return (
                                                <button
                                                    key={key}
                                                    onClick={() => togglePreference(key)}
                                                    className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
                                                        isDark 
                                                            ? "hover:bg-gray-700" 
                                                            : "hover:bg-gray-100"
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-lg">{info.emoji}</span>
                                                        <div className="text-left">
                                                            <div className={`text-sm font-medium ${
                                                                isDark ? "text-white" : "text-gray-900"
                                                            }`}>
                                                                {info.label}
                                                            </div>
                                                            <div className={`text-xs ${
                                                                isDark ? "text-gray-500" : "text-gray-400"
                                                            }`}>
                                                                {info.description}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {/* Toggle Switch */}
                                                    <div className={`w-10 h-6 rounded-full p-1 transition-colors ${
                                                        preferences[key] 
                                                            ? "bg-green-500" 
                                                            : isDark ? "bg-gray-600" : "bg-gray-300"
                                                    }`}>
                                                        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                                                            preferences[key] ? "translate-x-4" : "translate-x-0"
                                                        }`} />
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
                    <div className={`p-3 border-t text-center ${
                        isDark ? "border-gray-700" : "border-gray-200"
                    }`}>
                        <div className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                            Requires Farcaster frame context
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Export types for backend use
export type { NotificationPreferences };
export { DEFAULT_PREFERENCES, NOTIFICATION_LABELS };
