import { ethers } from "ethers";
import { MULTICALL3_ABI } from "./abis";
import { MULTICALL3_ADDRESS } from "./constants";

export type MultiResult =
{
    success: boolean;
    returnData: string;
};

export async function multicallTry(
    provider: ethers.providers.Provider,
    calls: { target: string; callData: string }[]
): Promise<MultiResult[]>
{
    const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);
    return await mc.tryAggregate(false, calls);
}

export function decode1(
    iface: ethers.utils.Interface,
    fn: string,
    r: MultiResult
): any
{
    if (!r.success) return null;
    try
    {
        return iface.decodeFunctionResult(fn, r.returnData)[0];
    }
    catch
    {
        return null;
    }
}
