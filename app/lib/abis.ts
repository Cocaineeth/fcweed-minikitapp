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


export const V4_STAKING_ABI = [
    "function stakePlants(uint256[] calldata ids) external",
    "function unstakePlants(uint256[] calldata ids) external",
    "function stakeLands(uint256[] calldata ids) external",
    "function unstakeLands(uint256[] calldata ids) external",
    "function stakeSuperLands(uint256[] calldata ids) external",
    "function unstakeSuperLands(uint256[] calldata ids) external",
    "function claim() external",
    "function pending(address account) external view returns (uint256)",
    "function capacityOf(address account) external view returns (uint256)",
    "function plantsOf(address account) external view returns (uint256[])",
    "function landsOf(address account) external view returns (uint256[])",
    "function superLandsOf(address account) external view returns (uint256[])",
    "function superLandStakerOf(uint256 tokenId) external view returns (address)",
    "function users(address) external view returns (uint64 last, uint32 plants, uint32 lands, uint32 superLands, uint256 accrued, uint256 bonusBoostBps, uint256 lastClaimTime, uint256 waterBalance, uint256 waterPurchasedToday, uint256 lastWaterPurchaseDay, uint256 stakedTokens, uint256 tokenStakeTime, address referrer, uint256 referralEarnings, uint32 referralCount, uint256 guildId, uint256 earningBoostBps, uint256 earningBoostExpiry, uint256 capacityBoost, uint256 capacityBoostExpiry, uint256 raidShieldExpiry, uint256 raidAttackBoostBps, uint256 raidAttackBoostExpiry, uint256 seasonPoints, uint256 lastSeasonUpdated)",
    "function getPlantHealth(uint256 tokenId) external view returns (uint256)",
    "function getAverageHealth(address user) external view returns (uint256)",
    "function getWaterNeeded(uint256 tokenId) external view returns (uint256)",
    "function buyWater(uint256 liters) external",
    "function waterPlant(uint256 tokenId) external",
    "function waterPlants(uint256[] calldata tokenIds) external",
    "function isShopOpen() external view returns (bool)",
    "function getShopTimeInfo() external view returns (bool isOpen, uint256 opensAt, uint256 closesAt)",
    "function getDailyWaterSupply() external view returns (uint256)",
    "function getDailyWaterRemaining() external view returns (uint256)",
    "function getWalletWaterLimit(address wallet) external view returns (uint256)",
    "function getWalletWaterRemaining(address wallet) external view returns (uint256)",
    "function waterPricePerLiter() external view returns (uint256)",
    "function tokensPerPlantPerDay() external view returns (uint256)",
    "function landBoostBps() external view returns (uint256)",
    "function superLandBoostBps() external view returns (uint256)",
    "function claimEnabled() external view returns (bool)",
    "function waterShopEnabled() external view returns (bool)",
    "function plantStakingEnabled() external view returns (bool)",
    "function landStakingEnabled() external view returns (bool)",
    "function superLandStakingEnabled() external view returns (bool)",
    "function totalPlantsStaked() external view returns (uint256)",
    "function getUserBattleStats(address account) external view returns (uint256 plants, uint256 lands, uint256 superLands, uint256 avgHealth, uint256 pendingRewards)",
    "function hasRaidShield(address user) external view returns (bool)",
    "function calculateBattlePower(address account) external view returns (uint256)",
    "function getTotalStakers() external view returns (uint256)",
    "function getStakerAtIndex(uint256 index) external view returns (address)",
    "event Claimed(address indexed user, uint256 amount)",
    "event WaterPurchased(address indexed user, uint256 liters, uint256 cost)",
    "event PlantWatered(address indexed user, uint256 tokenId, uint256 litersUsed)",
    "event PlantsWatered(address indexed user, uint256[] tokenIds, uint256 totalLitersUsed)",
    "event StakedPlants(address indexed user, uint256[] tokenIds)",
    "event UnstakedPlants(address indexed user, uint256[] tokenIds)",
];

export const V4_BATTLES_ABI = [
    "function searchForTarget(address target, uint256 nonce, uint256 deadline, bytes calldata signature) external",
    "function attack() external",
    "function cancelSearch() external",
    "function getTargetStats(address target) external view returns (uint256 plants, uint256 lands, uint256 superLands, uint256 avgHealth, uint256 pendingRewards, uint256 battlePower, bool hasShield)",
    "function getActiveSearch(address attacker) external view returns (address target, uint256 expiry, bool isValid)",
    "function canAttack(address attacker) external view returns (bool)",
    "function canBeAttacked(address defender) external view returns (bool)",
    "function getAttackCooldownRemaining(address attacker) external view returns (uint256)",
    "function getDefenseImmunityRemaining(address defender) external view returns (uint256)",
    "function getPlayerStats(address player) external view returns (uint256 wins, uint256 losses, uint256 defWins, uint256 defLosses, uint256 rewardsStolen, uint256 rewardsLost, uint256 winStreak, uint256 bestStreak)",
    "function estimateBattleOdds(address attacker, address defender) external view returns (uint256 attackerPower, uint256 defenderPower, uint256 estimatedWinChance)",
    "function getSearchNonce(address attacker) external view returns (uint256)",
    "function searchFee() external view returns (uint256)",
    "function raidsEnabled() external view returns (bool)",
    "event SearchInitiated(address indexed attacker, address indexed target, uint256 fee)",
    "event BattleResult(address indexed attacker, address indexed defender, bool attackerWon, uint256 damageDealt, uint256 rewardsTransferred)",
];

export const CRATE_VAULT_ABI = [
    "function openCrate() external",
    "function getUserStats(address user) external view returns (uint256 dustBalance, uint256 cratesOpened, uint256 fcweedWon, uint256 usdcWon, uint256 nftsWon, uint256 totalSpent, uint256 lastOpenedAt)",
    "function getUserDustBalance(address user) external view returns (uint256)",
    "function getUserCratesOpened(address user) external view returns (uint256)",
    "function getGlobalStats() external view returns (uint256 totalCratesOpened, uint256 totalFcweedBurned, uint256 totalFcweedRewarded, uint256 totalUsdcRewarded, uint256 totalDustRewarded, uint256 totalNftsRewarded, uint256 uniqueUsers)",
    "function getVaultInventory() external view returns (uint256 plants, uint256 lands, uint256 superLands, uint256 shopItems)",
    "function getAllRewards() external view returns (tuple(string name, uint8 category, uint256 amount, uint16 probability, bool enabled)[])",
    "function crateCost() external view returns (uint256)",
    "function dustConversionEnabled() external view returns (bool)",
    "function dustToFcweedRate() external view returns (uint256)",
    "function dustToFcweedAmount() external view returns (uint256)",
    "function convertDustToFcweed(uint256 dustAmount) external",
    "event CrateOpened(address indexed player, uint256 indexed rewardIndex, string rewardName, uint8 category, uint256 amount, uint256 nftTokenId, uint256 timestamp)",
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
export const v4StakingInterface = new ethers.utils.Interface(V4_STAKING_ABI);
export const v4BattlesInterface = new ethers.utils.Interface(V4_BATTLES_ABI);