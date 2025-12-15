import { ethers } from "ethers";

export const USDC_ABI = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
];

export const LAND_ABI = ["function mint()"];
export const PLANT_ABI = ["function mint()"];

export const ERC721_VIEW_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function totalSupply() view returns (uint256)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function isApprovedForAll(address owner, address operator) view returns (bool)",
    "function setApprovalForAll(address operator, bool approved)",
];

export const MULTICALL3_ABI = [
    "function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])",
];

export const STAKING_ABI = [
    // ---- common reads
    "function users(address) view returns (uint64 last,uint32 plants,uint32 lands,uint32 superLands,uint256 accrued,uint256 bonusBoostBps)",
    "function pending(address) view returns (uint256)",

    // ---- old + new token lists
    "function plantsOf(address) view returns (uint256[] memory)",
    "function landsOf(address) view returns (uint256[] memory)",
    "function superLandsOf(address) view returns (uint256[] memory)",

    // ---- actions
    "function stakePlants(uint256[] calldata ids)",
    "function unstakePlants(uint256[] calldata ids)",
    "function stakeLands(uint256[] calldata ids)",
    "function unstakeLands(uint256[] calldata ids)",
    "function stakeSuperLands(uint256[] calldata ids)",
    "function unstakeSuperLands(uint256[] calldata ids)",
    "function claim()",

    // ---- config
    "function landBoostBps() view returns (uint256)",
    "function superLandBoostBps() view returns (uint256)",
    "function tokensPerPlantPerDay() view returns (uint256)",
    "function landStakingEnabled() view returns (bool)",
    "function superLandStakingEnabled() view returns (bool)",
    "function claimEnabled() view returns (bool)",

    // ---- new-only helpers
    "function capacityOf(address) view returns (uint256)",
    "function getBoostBps(address) view returns (uint256)",

    "event StakedPlants(address indexed user, uint256[] tokenIds)",
    "event UnstakedPlants(address indexed user, uint256[] tokenIds)",
    "event StakedLands(address indexed user, uint256[] tokenIds)",
    "event UnstakedLands(address indexed user, uint256[] tokenIds)",
];

export const SUPER_LAND_ABI = ["function upgrade(uint256 landTokenId)","function upgradeEnabled() view returns (bool)"];
export const ERC20_ABI = ["function approve(address spender, uint256 amount) returns (bool)","function allowance(address owner, address spender) view returns (uint256)","function balanceOf(address owner) view returns (uint256)"];

// users() must be decoded per-version
const usersOldFrag = ethers.utils.Fragment.from(
  "function users(address) view returns (uint64 last,uint32 plants,uint32 lands,uint256 accrued)"
);
const usersNewFrag = ethers.utils.Fragment.from(
  "function users(address) view returns (uint64 last,uint32 plants,uint32 lands,uint32 superLands,uint256 accrued,uint256 bonusBoostBps)"
);

export const usdcInterface = new ethers.utils.Interface(USDC_ABI);
export const landInterface = new ethers.utils.Interface(LAND_ABI);
export const plantInterface = new ethers.utils.Interface(PLANT_ABI);
export const stakingInterface = new ethers.utils.Interface(STAKING_ABI);
export const erc721Interface = new ethers.utils.Interface(ERC721_VIEW_ABI);
export const superLandInterface = new ethers.utils.Interface(SUPER_LAND_ABI);
export const erc20Interface = new ethers.utils.Interface(ERC20_ABI);
