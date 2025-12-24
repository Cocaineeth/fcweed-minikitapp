import { CRATE_REWARDS } from "./constants";
import { ethers } from "ethers";

export type CrateReward = typeof CRATE_REWARDS[number];
export type StakingStats = {
    plantsStaked: number;
    landsStaked: number;
    totalSlots: number;
    capacityUsed: number;
    landBoostPct: number;
    pendingFormatted: string;
    pendingRaw: ethers.BigNumber;
    claimEnabled: boolean;
    tokensPerSecond: ethers.BigNumber;
};

export type NewStakingStats = {
    plantsStaked: number;
    landsStaked: number;
    superLandsStaked: number;
    totalSlots: number;
    capacityUsed: number;
    totalBoostPct: number;
    pendingFormatted: string;
    pendingRaw: ethers.BigNumber;
    dailyRewards: string;
    claimEnabled: boolean;
    tokensPerSecond: ethers.BigNumber;
};

export type FarmerRow = {
    addr: string;
    plants: number;
    lands: number;
    superLands: number;
    boostPct: number;
    capacity: string;
    daily: string;
    dailyRaw: number;
};

export type OwnedState = {
    wallet: string;
    plants: { tokenId: string; staked: boolean; boost: number }[];
    lands: { tokenId: string; staked: boolean; boost: number }[];
    superLands: { tokenId: string; staked: boolean; boost: number }[];
    totals: {
        plants: number;
        lands: number;
        superLands: number;
    };
};
