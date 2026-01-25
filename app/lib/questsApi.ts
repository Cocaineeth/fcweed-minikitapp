"use client";

import type { ethers } from "ethers";
import { authedFetch } from "../lib/referralAuth";

export type MissionKind = "DAILY" | "WEEKLY" | "MONTHLY" | "ONCE";

export type MissionProgress = {
    missionId?: string;
    mission_id?: string;
    progress: number;
    completions: number;
    completed?: boolean;
    resetAt?: string | null;
    reset_at?: string | null;
};

type MissionProgressResponse = {
    missions: MissionProgress[];
};

export type MissionProgress = {
    missionId: string;
    progress: number;
    completions: number;
    completed?: boolean;
    resetAt: string | null;
};
export type PointBalances = {
    total_points: number;
    weekly_points: number;
    updated_at?: string;
};

export type RewardType = "water" | "dust";

export type AuthCtx = {
    backendBaseUrl: string; // e.g. https://wars.x420ponzi.com
    address: string;
    signer: ethers.Signer;
    chainId: number;
    domain?: string;
};

function v1(baseUrl: string): string
{
    const b = baseUrl.replace(/\/$/, "");
    return `${b}/v1`;
}

async function readJson(res: Response): Promise<any>
{
    const text = await res.text();

    if (!text)
    {
        return null;
    }

    try
    {
        return JSON.parse(text);
    }
    catch
    {
        throw new Error(text);
    }
}

function missionKindFromReset(reset?: string): MissionKind
{
    switch ((reset || "").toLowerCase())
    {
        case "daily": return "DAILY";
        case "weekly": return "WEEKLY";
        case "monthly": return "MONTHLY";
        default: return "ONCE";
    }
}

function normalizeCatalogItem(raw: any): MissionRow
{
    // Supports both your DB-ish shape and earlier UI shape.
    const id = String(raw.id ?? raw.mission_id ?? raw.code ?? "");
    const points = Number(raw.points ?? 0);
    const enabled = raw.active === undefined ? (raw.enabled ?? true) : Boolean(raw.active);

    // Your backend mission shape (from missions table):
    // { id, code, category, reset_period, requirement: {event,count}, points, max_completions, active }
    const reset = raw.reset_period ?? raw.resetPeriod;
    const kind = raw.kind ?? missionKindFromReset(reset);

    const req = raw.requirement ?? raw.req ?? null;
    const event_key = String(raw.event_key ?? raw.eventKey ?? req?.event ?? raw.event ?? "");
    const target = Number(raw.target ?? raw.count ?? req?.count ?? 1);

    const title = String(
        raw.title ??
        raw.name ??
        raw.code ??
        (raw.category ? `${raw.category}: ${event_key}` : event_key) ??
        "Mission"
    );

    return {
        id,
        title,
        kind: kind as MissionKind,
        event_key,
        target,
        points,
        enabled,
        max_completions: raw.max_completions ?? raw.maxCompletions,
    };
}

export async function fetchMissionCatalog(baseUrl: string, signal?: AbortSignal): Promise<MissionRow[]>
{
    const res = await fetch(`${v1(baseUrl)}/missions/catalog`, {
        method: "GET",
        credentials: "include",
        signal,
    });

    const data = await readJson(res);
    if (!res.ok || data?.success === false)
    {
        throw new Error(data?.error || `missions/catalog failed (${res.status})`);
    }

    const list = (data?.missions ?? data?.catalog ?? data?.data ?? data) || [];
    if (!Array.isArray(list))
    {
        return [];
    }

    return list.map(normalizeCatalogItem);
}

export async function fetchMyMissionProgress(ctx: AuthCtx, signal?: AbortSignal): Promise<MissionProgress[]>
{
    const url = `${v1(ctx.backendBaseUrl)}/missions/progress`;

    const res = await authedFetch({
        url,
        init: { method: "GET", signal },
        backendBaseUrl: ctx.backendBaseUrl,
        address: ctx.address,
        signer: ctx.signer,
        chainId: ctx.chainId,
        domain: ctx.domain,
    });

    const data = await readJson(res);
    if (!res.ok || data?.success === false)
    {
        throw new Error(data?.error || `missions/progress failed (${res.status})`);
    }

    const raw = data;
    const list =
        (Array.isArray(raw) ? raw :
            Array.isArray(raw?.progress) ? raw.progress :
            Array.isArray(raw?.missions) ? raw.missions :
            Array.isArray(raw?.data) ? raw.data :
            []) as any[];

    // Normalize to use mission_id for consistency with catalog matching
    return list.map(item => ({
        ...item,
        mission_id: item.missionId || item.mission_id || item.id || "",
    }));
}

export async function fetchMyPointsBalance(ctx: AuthCtx, signal?: AbortSignal): Promise<PointBalances>
{
    const url = `${v1(ctx.backendBaseUrl)}/points/balance`;

    const res = await authedFetch({
        url,
        init: { method: "GET", signal },
        backendBaseUrl: ctx.backendBaseUrl,
        address: ctx.address,
        signer: ctx.signer,
        chainId: ctx.chainId,
        domain: ctx.domain,
    });

    const data = await readJson(res);
    if (!res.ok || data?.success === false)
    {
        throw new Error(data?.error || `points/balance failed (${res.status})`);
    }

    const b = data?.balance ?? data?.data ?? data;
    return {
        total_points: Number(b?.total ?? b?.totalPoints ?? 0),
        weekly_points: Number(b?.weekly ?? b?.weeklyPoints ?? 0),
        updated_at: b?.updatedAt ?? b?.updatedAt,
    };
}

export async function convertPoints(
    ctx: AuthCtx,
    payload: { points: number; reward: RewardType },
): Promise<{ rewardAmount: number; reward: RewardType }>
{
    const url = `${v1(ctx.backendBaseUrl)}/points/convert`;

    const res = await authedFetch({
        url,
        init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        },
        backendBaseUrl: ctx.backendBaseUrl,
        address: ctx.address,
        signer: ctx.signer,
        chainId: ctx.chainId,
        domain: ctx.domain,
    });

    const data = await readJson(res);
    if (!res.ok || data?.success === false)
    {
        throw new Error(data?.error || `points/convert failed (${res.status})`);
    }

    const amount = Number(data?.amount ?? data?.rewardAmount ?? data?.reward_amount ?? 0);
    const reward = (data?.reward ?? payload.reward) as RewardType;

    return { rewardAmount: amount, reward };
}

export async function emitOffchainEvent(
    ctx: AuthCtx,
    eventType: string,
    quantity: number = 1,
    meta: Record<string, any> = {},
): Promise<any>
{
    const url = `${v1(ctx.backendBaseUrl)}/missions/event`;

    const res = await authedFetch({
        url,
        init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventType, quantity, meta }),
        },
        backendBaseUrl: ctx.backendBaseUrl,
        address: ctx.address,
        signer: ctx.signer,
        chainId: ctx.chainId,
        domain: ctx.domain,
    });

    const data = await readJson(res);
    if (!res.ok || data?.success === false)
    {
        throw new Error(data?.error || `missions/event failed (${res.status})`);
    }

    return data;
}
