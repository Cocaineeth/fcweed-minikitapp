export type OwnedToken = {
    tokenId: string;
    staked: boolean;
    boost: number;
};

export type OwnedTokensResponse = {
    wallet: string;
    plants: OwnedToken[];
    lands: OwnedToken[];
    superLands: OwnedToken[];
    totals: {
        plants: number;
        lands: number;
        superLands: number;
    };
    cache?: {
        ttlMs: number;
    };
    _cached?: boolean;
    _deduped?: boolean;
};

function mustEnv(name: string): string {
    const v = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!v) {
        throw new Error(`Missing ${name}`);
    }
    return v;
}

export async function loadOwnedTokens(wallet: string, signal?: AbortSignal): Promise<OwnedTokensResponse> {
    const base = "https://api.fcweed.xyz/v1";
    const url = new URL(`${base}/owned-tokens`);
    url.searchParams.set("wallet", wallet);

    const res = await fetch(url.toString(), {
        method: "GET",
        signal,
        cache: "no-store" // always get freshest; backend does TTL cache anyway
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`owned-tokens failed: ${res.status} ${text}`);
    }

    return (await res.json()) as OwnedTokensResponse;
}
