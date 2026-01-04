"use client";

import { ethers } from "ethers";

export const AUTH_TOKEN_KEY = "fcweed_auth_token";
export const AUTH_ADDRESS_KEY = "fcweed_auth_address";

export type AuthState =
{
    token: string | null;
    address: string | null;
};

export function readAuthFromStorage() : AuthState
{
    if (typeof window === "undefined")
    {
        return { token: null, address: null };
    }

    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
    const address = window.localStorage.getItem(AUTH_ADDRESS_KEY);

    return {
        token: token && token.length > 0 ? token : null,
        address: address && address.length > 0 ? address : null,
    };
}

export function clearAuthStorage() : void
{
    if (typeof window === "undefined")
    {
        return;
    }

    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_ADDRESS_KEY);
}

export function setAuthStorage(address: string, token: string) : void
{
    if (typeof window === "undefined")
    {
        return;
    }

    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    window.localStorage.setItem(AUTH_ADDRESS_KEY, address);
}

export async function ensureReferralAuth(params:
{
    backendBaseUrl: string;           // e.g. https://wars.x420ponzi.com
    address: string;
    signer: ethers.Signer;            // must be connected
    chainId: number;
    domain?: string;                  // defaults to window.location.host
}) : Promise<string>
{
    const stored = readAuthFromStorage();
    const addrLc = params.address.toLowerCase();

    if (stored.token && stored.address?.toLowerCase() === addrLc)
    {
        return stored.token;
    }

    const domain = params.domain || (typeof window !== "undefined" ? window.location.host : "fcweed");
    const issuedAt = new Date().toISOString();

    // 1) get nonce
    const nonceRes = await fetch(`${params.backendBaseUrl}/v1/referrals/auth/nonce`, {
        method: "POST",
        headers: { "Accept": "application/json" },
        credentials: "include",
        body: JSON.stringify({wallet: params.address})
    });

    if (!nonceRes.ok)
    {
        const t = await nonceRes.text().catch(() => "");
        throw new Error(`Auth nonce failed (${nonceRes.status}): ${t.slice(0, 120)}`);
    }

    const nonceJson = await nonceRes.json();
    const nonce: string = nonceJson?.nonce;
    const message: string = nonceJson?.message;

    if (!nonce || typeof nonce !== "string" || !message || typeof message !== "string")
    {
        throw new Error("Auth nonce response missing nonce/message");
    }

    // 2) sign message
    const signature = await params.signer.signMessage(message);

    // 3) verify signature -> token
    const verifyRes = await fetch(`${params.backendBaseUrl}/v1/referrals/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        credentials: "include",
        body: JSON.stringify({
            wallet: params.address,
            nonce,
            signature,
        }),
    });

    if (!verifyRes.ok)
    {
        const t = await verifyRes.text().catch(() => "");
        throw new Error(`Auth verify failed (${verifyRes.status}): ${t.slice(0, 160)}`);
    }

    const verifyJson = await verifyRes.json();
    const token: string = verifyJson?.token;

    if (!token || typeof token !== "string")
    {
        throw new Error("Auth token missing from backend response");
    }

    setAuthStorage(params.address, token);
    return token;
}

export async function authedFetch(params:
{
    url: string;
    init?: RequestInit;
    backendBaseUrl: string;
    address: string;
    signer: ethers.Signer;
    chainId: number;
    domain?: string;
    retryOn401?: boolean;
}) : Promise<Response>
{
    const retryOn401 = params.retryOn401 ?? true;

    const token = await ensureReferralAuth({
        backendBaseUrl: params.backendBaseUrl,
        address: params.address,
        signer: params.signer,
        chainId: params.chainId,
        domain: params.domain,
    });

    const init: RequestInit = {
        ...(params.init || {}),
        headers: {
            ...((params.init && params.init.headers) ? params.init.headers : {}),
            "Authorization": `Bearer ${token}`,
        },
        credentials: "include",
    };

    const res = await fetch(params.url, init);

    if (res.status === 401 && retryOn401)
    {
        // Token expired/invalid. Clear and re-auth once.
        clearAuthStorage();

        const token2 = await ensureReferralAuth({
            backendBaseUrl: params.backendBaseUrl,
            address: params.address,
            signer: params.signer,
            chainId: params.chainId,
            domain: params.domain,
        });

        const init2: RequestInit = {
            ...(params.init || {}),
            headers: {
                ...((params.init && params.init.headers) ? params.init.headers : {}),
                "Authorization": `Bearer ${token2}`,
            },
            credentials: "include",
        };

        return fetch(params.url, init2);
    }

    return res;
}
