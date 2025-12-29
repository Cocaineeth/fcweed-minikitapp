// lib/autoRefresh.ts
// Global auto-refresh system for real-time updates across all app components

import { ethers } from "ethers";

// Refresh intervals (in milliseconds)
export const REFRESH_INTERVALS = {
    FAST: 5000,         // 5 seconds - for active battles/raids/targeting
    NORMAL: 15000,      // 15 seconds - for staking stats, balances
    SLOW: 30000,        // 30 seconds - for leaderboards, shop supply
    VERY_SLOW: 60000,   // 1 minute - for token stats, NFT supply
};

// Event types for the global event system
export type RefreshEventType = 
    | 'BALANCE_UPDATE'
    | 'STAKING_UPDATE' 
    | 'BATTLE_UPDATE'
    | 'DEA_RAID_UPDATE'
    | 'PURGE_UPDATE'
    | 'SHOP_UPDATE'
    | 'LEADERBOARD_UPDATE'
    | 'INVENTORY_UPDATE'
    | 'TARGET_SELECTION'
    | 'ATTACK_START'
    | 'ATTACK_END'
    | 'ALL';

// Listener callback type
export type RefreshListener = (event: RefreshEventType, data?: any) => void;

// Global state tracking for targeting
export interface TargetingState {
    targetAddress: string;
    attackerAddress: string;
    attackType: 'cartel' | 'dea' | 'purge';
    timestamp: number;
    isSelecting?: boolean;
}

// Singleton class for managing global refresh state
class AutoRefreshManager {
    private listeners: Map<string, Set<RefreshListener>> = new Map();
    private intervals: Map<string, NodeJS.Timeout> = new Map();
    private activeTargetings: Map<string, TargetingState[]> = new Map();
    private lastRefreshTimes: Map<string, number> = new Map();
    private isPollingActive: boolean = false;
    private pollingInterval: NodeJS.Timeout | null = null;
    
    // Backend URL for real-time state
    private backendUrl: string = '';
    
    constructor() {
        // Initialize event types
        const eventTypes: RefreshEventType[] = [
            'BALANCE_UPDATE', 'STAKING_UPDATE', 'BATTLE_UPDATE', 
            'DEA_RAID_UPDATE', 'PURGE_UPDATE', 'SHOP_UPDATE',
            'LEADERBOARD_UPDATE', 'INVENTORY_UPDATE', 'TARGET_SELECTION',
            'ATTACK_START', 'ATTACK_END', 'ALL'
        ];
        eventTypes.forEach(type => {
            this.listeners.set(type, new Set());
        });
    }

    setBackendUrl(url: string) {
        this.backendUrl = url;
    }

    // Subscribe to refresh events
    subscribe(eventType: RefreshEventType, listener: RefreshListener): () => void {
        const typeListeners = this.listeners.get(eventType);
        if (typeListeners) {
            typeListeners.add(listener);
        }
        
        // Return unsubscribe function
        return () => {
            typeListeners?.delete(listener);
        };
    }

    // Emit refresh event to all listeners
    emit(eventType: RefreshEventType, data?: any) {
        // Notify specific event listeners
        const typeListeners = this.listeners.get(eventType);
        typeListeners?.forEach(listener => listener(eventType, data));
        
        // Also notify 'ALL' listeners
        if (eventType !== 'ALL') {
            const allListeners = this.listeners.get('ALL');
            allListeners?.forEach(listener => listener(eventType, data));
        }
    }

    // Start auto-refresh for a specific component
    startAutoRefresh(
        key: string, 
        refreshFn: () => Promise<void>, 
        interval: number = REFRESH_INTERVALS.NORMAL
    ): void {
        // Clear existing interval if any
        this.stopAutoRefresh(key);
        
        // Run immediately
        refreshFn().catch(console.error);
        
        // Set up interval
        const intervalId = setInterval(async () => {
            try {
                await refreshFn();
            } catch (err) {
                console.error(`[AutoRefresh] ${key} failed:`, err);
            }
        }, interval);
        
        this.intervals.set(key, intervalId);
        this.lastRefreshTimes.set(key, Date.now());
    }

    // Stop auto-refresh for a specific component
    stopAutoRefresh(key: string): void {
        const intervalId = this.intervals.get(key);
        if (intervalId) {
            clearInterval(intervalId);
            this.intervals.delete(key);
        }
    }

    // Stop all auto-refreshes
    stopAll(): void {
        this.intervals.forEach((_, key) => this.stopAutoRefresh(key));
        this.stopPolling();
    }

    // Register that a player is selecting/targeting another player
    registerTargeting(state: TargetingState): void {
        const key = state.targetAddress.toLowerCase();
        const existing = this.activeTargetings.get(key) || [];
        
        // Remove any existing targeting from the same attacker
        const filtered = existing.filter(
            t => t.attackerAddress.toLowerCase() !== state.attackerAddress.toLowerCase()
        );
        
        filtered.push(state);
        this.activeTargetings.set(key, filtered);
        
        // Emit targeting event
        this.emit('TARGET_SELECTION', { 
            targetAddress: state.targetAddress,
            attackers: filtered 
        });
        
        // Broadcast to backend if available
        this.broadcastTargeting(state);
    }

    // Clear targeting when attack completes or is cancelled
    clearTargeting(targetAddress: string, attackerAddress: string): void {
        const key = targetAddress.toLowerCase();
        const existing = this.activeTargetings.get(key) || [];
        
        const filtered = existing.filter(
            t => t.attackerAddress.toLowerCase() !== attackerAddress.toLowerCase()
        );
        
        if (filtered.length > 0) {
            this.activeTargetings.set(key, filtered);
        } else {
            this.activeTargetings.delete(key);
        }
        
        // Emit update
        this.emit('TARGET_SELECTION', {
            targetAddress,
            attackers: filtered
        });
    }

    // Get all players currently targeting a specific address
    getTargetingAttackers(targetAddress: string): TargetingState[] {
        const key = targetAddress.toLowerCase();
        const targeting = this.activeTargetings.get(key) || [];
        
        // Filter out stale targetings (older than 2 minutes)
        const now = Date.now();
        const fresh = targeting.filter(t => now - t.timestamp < 120000);
        
        if (fresh.length !== targeting.length) {
            this.activeTargetings.set(key, fresh);
        }
        
        return fresh;
    }

    // Check if address is being targeted
    isBeingTargeted(address: string): boolean {
        return this.getTargetingAttackers(address).length > 0;
    }

    // Start global polling for real-time updates
    startPolling(provider: ethers.providers.Provider, userAddress: string | null): void {
        if (this.isPollingActive) return;
        this.isPollingActive = true;

        this.pollingInterval = setInterval(async () => {
            try {
                // Poll backend for active targetings
                await this.pollActiveTargetings();
            } catch (err) {
                // Silent fail - polling shouldn't break the app
            }
        }, 3000); // Poll every 3 seconds
    }

    stopPolling(): void {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        this.isPollingActive = false;
    }

    // Broadcast targeting state to backend
    private async broadcastTargeting(state: TargetingState): Promise<void> {
        if (!this.backendUrl) return;
        
        try {
            await fetch(`${this.backendUrl}/api/targeting/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(state)
            });
        } catch (err) {
            // Silent fail - don't break the app if backend is down
        }
    }

    // Poll backend for active targetings
    private async pollActiveTargetings(): Promise<void> {
        if (!this.backendUrl) return;
        
        try {
            const response = await fetch(`${this.backendUrl}/api/targeting/active`);
            if (response.ok) {
                const data = await response.json();
                if (data.success && Array.isArray(data.targetings)) {
                    // Update local state with backend data
                    this.activeTargetings.clear();
                    data.targetings.forEach((t: TargetingState) => {
                        const key = t.targetAddress.toLowerCase();
                        const existing = this.activeTargetings.get(key) || [];
                        existing.push(t);
                        this.activeTargetings.set(key, existing);
                    });
                    
                    // Emit update
                    this.emit('TARGET_SELECTION', { 
                        all: true, 
                        targetings: data.targetings 
                    });
                }
            }
        } catch (err) {
            // Silent fail
        }
    }

    // Force immediate refresh for a component
    async forceRefresh(key: string): Promise<void> {
        this.lastRefreshTimes.set(key, Date.now());
        // The actual refresh needs to be triggered by the component
        this.emit('ALL', { forceRefresh: key });
    }

    // Get time since last refresh
    getTimeSinceRefresh(key: string): number {
        const lastTime = this.lastRefreshTimes.get(key) || 0;
        return Date.now() - lastTime;
    }
}

// Export singleton instance
export const autoRefreshManager = new AutoRefreshManager();

// React hook for auto-refresh
export function useAutoRefresh(
    key: string,
    refreshFn: () => Promise<void>,
    interval: number = REFRESH_INTERVALS.NORMAL,
    deps: any[] = []
): { isRefreshing: boolean; forceRefresh: () => Promise<void>; lastRefresh: number } {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastRefresh, setLastRefresh] = useState(Date.now());
    
    // This is a simplified version - actual implementation would use useEffect
    return {
        isRefreshing,
        forceRefresh: async () => {
            setIsRefreshing(true);
            try {
                await refreshFn();
                setLastRefresh(Date.now());
            } finally {
                setIsRefreshing(false);
            }
        },
        lastRefresh
    };
}

// Import for typing only - will be provided by React
import { useState } from 'react';

// Utility function to create a debounced refresh
export function createDebouncedRefresh(
    fn: () => Promise<void>,
    delay: number = 1000
): () => Promise<void> {
    let timeoutId: NodeJS.Timeout | null = null;
    let pendingPromise: Promise<void> | null = null;
    
    return async () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        
        return new Promise<void>((resolve) => {
            timeoutId = setTimeout(async () => {
                if (!pendingPromise) {
                    pendingPromise = fn();
                }
                await pendingPromise;
                pendingPromise = null;
                resolve();
            }, delay);
        });
    };
}

// Utility to batch multiple refresh calls
export function createBatchedRefresh(
    fns: Array<() => Promise<void>>,
    concurrency: number = 3
): () => Promise<void> {
    return async () => {
        for (let i = 0; i < fns.length; i += concurrency) {
            const batch = fns.slice(i, i + concurrency);
            await Promise.all(batch.map(fn => fn().catch(console.error)));
        }
    };
}
