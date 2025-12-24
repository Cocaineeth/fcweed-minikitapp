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
