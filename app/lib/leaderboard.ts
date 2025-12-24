import { useState, useEffect, useCallback } from "react";

export type LeaderboardItem = {
  staker: string;
  plants: number;
  lands: number;
  superLands: number;
  score: number;
};

export type LeaderboardResponse = {
    items: LeaderboardItem[];
    limit?: number;
    offset?: number;
};

export type FarmerRow = {
    addr: string;
    plants: number;
    lands: number;
    boostPct: number;
    capacity: string;
    daily: string;
    dailyRaw: number;
};

export function useLeaderboard(limit = 50) {
    const [items, setItems] = useState<LeaderboardItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await loadLeaderboard({ limit });
            setItems(data.items);
        } catch (e: any) {
            setError(e?.message || "Failed to load leaderboard");
        } finally {
            setLoading(false);
        }
    }, [limit]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { items, loading, error, refresh };
}

export async function loadLeaderboard(params?:
{
    limit?: number;
    offset?: number;
    signal?: AbortSignal;
}): Promise<LeaderboardResponse> {
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;
    
    const base = "https://api.fcweed.xyz/v1";
    const url = new URL(`${base}/leaderboard`);
    
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset))
    
    const res = await fetch(url.toString(), {
        method: "GET",
        signal: params?.signal,
        cache: "no-store" // always get freshest; backend does TTL cache anyway
    });

    if(!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`leaderboard failed: ${res.status} ${text}`);
    }

    return (await res.json()) as LeaderboardResponse;
}
