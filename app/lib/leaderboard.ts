import { STAKING_ABI } from "./abis"
import { NEW_STAKING_ADDRESS } from "./constants"
import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";

const stakingIface = new ethers.utils.Interface(STAKING_ABI);

const TOPICS = {
    stakedPlants: stakingIface.getEventTopic("StakedPlants"),
    unstakedPlants: stakingIface.getEventTopic("UnstakedPlants"),
    stakedLands: stakingIface.getEventTopic("StakedLands"),
    unstakedLands: stakingIface.getEventTopic("UnstakedLands"),
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

async function getLogsPaged(
    readProvider: ethers.providers.Provider,
    filter: ethers.providers.Filter,
    fromBlock: number,
    toBlock: number,
    maxRange = 4500 // stay under 5000 safely
)
{
    const out: ethers.providers.Log[] = [];

    let start = fromBlock;
    while (start <= toBlock)
    {
        const end = Math.min(start + maxRange, toBlock);

        try
        {
            const chunk = await readProvider.getLogs({
                ...filter,
                fromBlock: start,
                toBlock: end,
            });
            out.push(...chunk);
            start = end + 1;
        }
        catch (e: any)
        {
            // If provider still complains, shrink the range and retry
            const msg = (e?.error?.message || e?.message || "").toLowerCase();

            if (maxRange > 500 && (msg.includes("block range") || msg.includes("too many") || msg.includes("limit")))
            {
                maxRange = Math.floor(maxRange / 2);
                continue;
            }

            throw e;
        }
    }

    return out;
}


async function discoverStakers(readProvider: ethers.providers.Provider, fromBlock: number, toBlock: number)
{

    const logs = await getLogsPaged(
        readProvider,
        {
            address: NEW_STAKING_ADDRESS,
            topics: [[
                TOPICS.stakedPlants,
                TOPICS.unstakedPlants,
                TOPICS.stakedLands,
                TOPICS.unstakedLands,
            ]],
        },
        fromBlock,
        toBlock,
        4500
    );
    const addrSet = new Set<string>();

    for (const log of logs)
    {
        // user is indexed => topics[1]
        if (log.topics.length >= 2)
        {
            const user = ("0x" + log.topics[1].slice(26)).toLowerCase();
            addrSet.add(user);
        }
    }

    return Array.from(addrSet);
}

async function buildLeaderboard(readProvider: ethers.providers.Provider, addrs: string[])
{
    const staking = new ethers.Contract(NEW_STAKING_ADDRESS, STAKING_ABI, readProvider);

    const [perDayBn, landBpsBn] = await Promise.all([
        staking.tokensPerPlantPerDay(),
        staking.landBoostBps(),
    ]);

    const rows: FarmerRow[] = [];

    // batch to avoid RPC rate limits
    const BATCH = 40;
    for (let i = 0; i < addrs.length; i += BATCH)
    {
        const slice = addrs.slice(i, i + BATCH);

        const batch = await Promise.all(slice.map(async (addr) =>
            {
                try
                {
                    const u = await staking.users(addr);
                    const plants = Number(u.plants);
                    const lands = Number(u.lands);
                    if (plants === 0 && lands === 0) return null;

                    const base = perDayBn.mul(plants);
                    const boostTotalBps = ethers.BigNumber.from(10000).add(landBpsBn.mul(lands));
                    const dailyBn = base.mul(boostTotalBps).div(10000);
                    const dailyFloat = parseFloat(ethers.utils.formatUnits(dailyBn, 18));

                    const capacityTotal = 1 + lands * 3;
                    const boostPct = (lands * landBpsBn.toNumber()) / 100;

                    return {
                        addr,
                        plants,
                        lands,
                        boostPct,
                        capacity: `${plants}/${capacityTotal}`,
                        daily: dailyFloat.toLocaleString(undefined, { maximumFractionDigits: 2 }),
                        dailyRaw: dailyFloat,
                    } satisfies FarmerRow;
                }
                catch
                {
                    return null;
                }
            }));

        for (const r of batch) if (r) rows.push(r);
    }

    rows.sort((a, b) => b.dailyRaw - a.dailyRaw);
    return rows;
}

export function useLeaderboard(args: {
    readProvider: ethers.providers.Provider;
    userAddress: string | null;
    usingMiniApp: boolean;
    windowBlocksMini?: number;
    windowBlocksBrowser?: number;
    topN?: number;
})
{
    const {
        readProvider,
        userAddress,
        usingMiniApp,
        windowBlocksMini = 120_000,
        windowBlocksBrowser = 500_000,
        topN = 10,
    } = args;

    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState<FarmerRow[]>([]);
    const [farmerCount, setFarmerCount] = useState(0);
    const [walletRank, setWalletRank] = useState<number | null>(null);
    const [walletRow, setWalletRow] = useState<FarmerRow | null>(null);

    const addrCacheRef = useRef<Set<string>>(new Set());
    const requestIdRef = useRef(0);

    const refresh = useCallback(async () =>
        {
            const reqId = ++requestIdRef.current;

            setLoading(true);
            try
            {
                const latest = await readProvider.getBlockNumber();
                const window = usingMiniApp ? windowBlocksMini : windowBlocksBrowser;
                const fromBlock = Math.max(latest - window, 0);

                const addrs = await discoverStakers(readProvider, fromBlock, latest);

                for (const a of addrs) addrCacheRef.current.add(a.toLowerCase());
                if (userAddress) addrCacheRef.current.add(userAddress.toLowerCase());

                const all = Array.from(addrCacheRef.current);

                const allRows = await buildLeaderboard(
                    readProvider,
                    all,
                );

                // prevent stale request overwriting newer results
                if (requestIdRef.current !== reqId) return;

                setFarmerCount(allRows.length);
                setRows(allRows.slice(0, topN));

                if (userAddress)
                {
                    const idx = allRows.findIndex((r) => r.addr.toLowerCase() === userAddress.toLowerCase());
                    setWalletRank(idx === -1 ? null : idx + 1);
                    setWalletRow(idx === -1 ? null : allRows[idx]);
                }
                else
                {
                    setWalletRank(null);
                    setWalletRow(null);
                }
            }
            catch (e)
            {
                if (requestIdRef.current !== reqId) return;
                setRows([]);
                setFarmerCount(0);
                setWalletRank(null);
                setWalletRow(null);
                console.error("Leaderboard refresh failed:", e);
            }
            finally
            {
                if (requestIdRef.current === reqId) setLoading(false);
            }
        }, [
            readProvider,
            userAddress,
            usingMiniApp,
            windowBlocksMini,
            windowBlocksBrowser,
            topN,
        ]);

    useEffect(() =>
        {
            void refresh();
        }, [refresh]);

    return { loading, rows, farmerCount, walletRank, walletRow, refresh };
}

