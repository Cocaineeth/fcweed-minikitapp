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
    "function users(address) view returns (uint64 last,uint32 plants,uint32 lands,uint32 superLands,uint256 accrued,uint256 bonusBoostBps)",
    "function pending(address) view returns (uint256)",
    "function plantsOf(address) view returns (uint256[] memory)",
    "function landsOf(address) view returns (uint256[] memory)",
    "function superLandsOf(address) view returns (uint256[] memory)",
    "function stakePlants(uint256[] calldata ids)",
    "function unstakePlants(uint256[] calldata ids)",
    "function stakeLands(uint256[] calldata ids)",
    "function unstakeLands(uint256[] calldata ids)",
    "function stakeSuperLands(uint256[] calldata ids)",
    "function unstakeSuperLands(uint256[] calldata ids)",
    "function claim()",
    "function landBoostBps() view returns (uint256)",
    "function superLandBoostBps() view returns (uint256)",
    "function tokensPerPlantPerDay() view returns (uint256)",
    "function landStakingEnabled() view returns (bool)",
    "function superLandStakingEnabled() view returns (bool)",
    "function claimEnabled() view returns (bool)",
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
    "function searchForTarget(address target, uint256 deadline, bytes calldata signature) external",
    "function cartelAttack() external",
    "function cancelSearch() external",
    "function canCartelAttack(address attacker) external view returns (bool)",
    "function lastCartelAttackTime(address) external view returns (uint256)",
    "function cartelCooldown() external view returns (uint256)",
    "function canBeCartelAttacked(address defender) external view returns (bool)",
    "function searchNonce(address) external view returns (uint256)",
    "function cartelSearchFee() external view returns (uint256)",
    "function cartelWarsEnabled() external view returns (bool)",
    "function minPendingToBeTarget() external view returns (uint256)",
    "function activeSearchTarget(address) external view returns (address)",
    "function activeSearchExpiry(address) external view returns (uint256)",
    "function getCartelPlayerStats(address player) external view returns (uint256 wins, uint256 losses, uint256 defWins, uint256 defLosses, uint256 rewardsStolen, uint256 rewardsLost, uint256 rewardsLostAttacking, uint256 winStreak, uint256 bestStreak, uint256 nukes, bool hasShield)",
    "function deaRaid(address target) external",
    "function canDeaAttackAny(address attacker) external view returns (bool)",
    "function canDeaAttackTarget(address attacker, address target) external view returns (bool)",
    "function canBeRaided(address target) external view returns (bool)",
    "function deaRaidsEnabled() external view returns (bool)",
    "function deaRaidFee() external view returns (uint256)",
    "function getSuspectInfo(address suspect) external view returns (bool isSuspect, uint256 lastSellTimestamp, uint256 expiresAt, uint256 totalTimesRaided, uint256 totalLost, uint256 totalSoldAmount, uint256 sellCount, bool canCurrentlyBeRaided)",
    "function getSuspectList() external view returns (address[])",
    "function getSuspectCount() external view returns (uint256)",
    "function getDeaAttackerStats(address attacker) external view returns (uint256 raidsWon, uint256 raidsLost, uint256 rewardsStolen, uint256 rewardsLostAttacking, uint256 cooldownRemaining, bool canAttack)",
    "function purgeAttack(address target) external",
    "function canPurgeAttack(address attacker) external view returns (bool)",
    "function isPurgeActive() external view returns (bool)",
    "function purgeFee() external view returns (uint256)",
    "function getPurgeInfo() external view returns (bool isActive, uint256 startTime, uint256 endTime, uint256 timeUntilStart, uint256 timeUntilEnd)",
    "function getPurgeAttackerStats(address attacker) external view returns (uint256 wins, uint256 losses, uint256 rewardsStolen, uint256 cooldownRemaining, bool canAttack)",
    "function getGlobalStats() external view returns (uint256 totalCartelBattles, uint256 totalDeaRaids, uint256 totalPurgeAttacks, uint256 totalSuspectsFlagged, uint256 totalRewardsRedistributed, uint256 totalFeesCollected, uint256 totalPurgeFeesBurned)",
    "event SearchInitiated(address indexed attacker, address indexed target, uint256 fee)",
    "event CartelBattleResult(address indexed attacker, address indexed defender, bool attackerWon, uint256 damageDealt, uint256 rewardsTransferred)",
    "event DeaRaidResult(address indexed attacker, address indexed defender, bool attackerWon, uint256 stolenAmount, uint256 damagePct)",
    "event PurgeAttackResult(address indexed attacker, address indexed target, bool attackerWon, uint256 stolenAmount, uint256 damagePct)",
];

export const BATTLE_SYSTEM_V2_ABI = [
    "function searchForTarget(address target, uint256 deadline, bytes calldata signature) external",
    "function cartelAttack() external",
    "function cancelSearch() external",
    "function canCartelAttack(address attacker) external view returns (bool)",
    "function lastCartelAttackTime(address) external view returns (uint256)",
    "function cartelCooldown() external view returns (uint256)",
    "function canBeCartelAttacked(address defender) external view returns (bool)",
    "function searchNonce(address) external view returns (uint256)",
    "function cartelSearchFee() external view returns (uint256)",
    "function cartelWarsEnabled() external view returns (bool)",
    "function minPendingToBeTarget() external view returns (uint256)",
    "function activeSearchTarget(address) external view returns (address)",
    "function activeSearchExpiry(address) external view returns (uint256)",
    "function getCartelPlayerStats(address player) external view returns (uint256 wins, uint256 losses, uint256 defWins, uint256 defLosses, uint256 rewardsStolen, uint256 rewardsLost, uint256 rewardsLostAttacking, uint256 winStreak, uint256 bestStreak, uint256 nukes, bool hasShield)",
    "function deaRaid(address target) external",
    "function canDeaAttackAny(address attacker) external view returns (bool)",
    "function canDeaAttackTarget(address attacker, address target) external view returns (bool)",
    "function canBeRaided(address target) external view returns (bool)",
    "function deaRaidsEnabled() external view returns (bool)",
    "function deaRaidFee() external view returns (uint256)",
    "function getSuspectInfo(address suspect) external view returns (bool isSuspect, uint256 lastSellTimestamp, uint256 expiresAt, uint256 totalTimesRaided, uint256 totalLost, uint256 totalSoldAmount, uint256 sellCount, bool canCurrentlyBeRaided)",
    "function getSuspectList() external view returns (address[])",
    "function getSuspectCount() external view returns (uint256)",
    "function getDeaAttackerStats(address attacker) external view returns (uint256 raidsWon, uint256 raidsLost, uint256 rewardsStolen, uint256 rewardsLostAttacking, uint256 cooldownRemaining, bool canAttack)",
    "function purgeAttack(address target) external",
    "function canPurgeAttack(address attacker) external view returns (bool)",
    "function isPurgeActive() external view returns (bool)",
    "function purgeFee() external view returns (uint256)",
    "function getPurgeInfo() external view returns (bool isActive, uint256 startTime, uint256 endTime, uint256 timeUntilStart, uint256 timeUntilEnd)",
    "function getPurgeAttackerStats(address attacker) external view returns (uint256 wins, uint256 losses, uint256 rewardsStolen, uint256 cooldownRemaining, bool canAttack)",
    "function getGlobalStats() external view returns (uint256 totalCartelBattles, uint256 totalDeaRaids, uint256 totalPurgeAttacks, uint256 totalSuspectsFlagged, uint256 totalRewardsRedistributed, uint256 totalFeesCollected, uint256 totalPurgeFeesBurned)",
    "event SearchInitiated(address indexed attacker, address indexed target, uint256 fee)",
    "event CartelBattleResult(address indexed attacker, address indexed defender, bool attackerWon, uint256 damageDealt, uint256 rewardsTransferred)",
    "event DeaRaidResult(address indexed attacker, address indexed defender, bool attackerWon, uint256 stolenAmount, uint256 damagePct)",
    "event PurgeAttackResult(address indexed attacker, address indexed target, bool attackerWon, uint256 stolenAmount, uint256 damagePct)",
];

export const CRATE_VAULT_ABI = [
    "function openCrate() external",
    "function getUserStats(address user) external view returns (uint256 dustBalance, uint256 cratesOpened, uint256 fcweedWon, uint256 usdcWon, uint256 nftsWon, uint256 totalSpent)",
    "function getUserDustBalance(address user) external view returns (uint256)",
    "function getUserCratesOpened(address user) external view returns (uint256)",
    "function getGlobalStats() external view returns (uint256 totalCratesOpened, uint256 totalFcweedBurned, uint256 totalFcweedRewarded, uint256 totalUsdcRewarded, uint256 totalDustRewarded, uint256 totalNftsRewarded, uint256 uniqueUsers)",
    "function getVaultInventory() external view returns (uint256 plants, uint256 lands, uint256 superLands)",
    "function getAllRewards() external view returns (tuple(string name, uint8 category, uint256 amount, uint16 probability, bool enabled)[])",
    "function crateCost() external view returns (uint256)",
    "function dustConversionEnabled() external view returns (bool)",
    "function dustShopEnabled() external view returns (bool)",
    "function dustToFcweedRate() external view returns (uint256)",
    "function dustToFcweedAmount() external view returns (uint256)",
    "function convertDustToFcweed(uint256 dustAmount) external",
    "function spendDustOnBehalf(address user, uint256 dustAmount, uint256 itemId) external returns (bool)",
    "function itemShop() external view returns (address)",
    "event CrateOpened(address indexed player, uint256 indexed rewardIndex, string rewardName, uint8 category, uint256 amount, uint256 nftTokenId, uint256 timestamp)",
];

export const V5_ITEMSHOP_ABI = [
    "function shopEnabled() view returns (bool)",
    "function purgeActive() view returns (bool)",
    "function getTimeUntilReset() view returns (uint256)",
    "function getDailyStock(uint256 itemId) view returns (uint256 remaining, uint256 total)",
    "function getItem(uint256 itemId) view returns (tuple(uint256 id, string name, uint256 fcweedPrice, uint256 dustPrice, uint8 itemType, uint256 effectValue, uint256 duration, uint256 maxPerWallet, uint256 dailySupply, uint256 soldToday, uint256 lastResetDay, bool active, uint256 startTime, uint256 endTime, bool requiresTarget))",
    "function getActiveItems() view returns (tuple(uint256 id, string name, uint256 fcweedPrice, uint256 dustPrice, uint8 itemType, uint256 effectValue, uint256 duration, uint256 maxPerWallet, uint256 dailySupply, uint256 soldToday, uint256 lastResetDay, bool active, uint256 startTime, uint256 endTime, bool requiresTarget)[])",
    "function userPurchases(address user, uint256 itemId) view returns (uint256)",
    "function userActiveEffects(address user, uint256 itemId) view returns (uint256)",
    "function hasActiveShield(address user) view returns (bool active, uint256 expiresAt)",
    "function getActiveBoost(address user) view returns (uint256 boostBps, uint256 expiresAt)",
    "function hasActiveNukeReady(address user) view returns (bool)",
    "function nukeExpiry(address user) view returns (uint256)",
    "function hasActiveNuke(address user) view returns (bool)",
    "function purchaseWithFcweed(uint256 itemId)",
    "function purchaseWithDust(uint256 itemId)",
    "function useItem(uint256 itemId, address target)",
    "function useHealthPack(uint256 plantId)",
    "function useHealthPackBatch(uint256[] plantIds)",
    "function removeShieldSelf()",
    "function getUserInventory(address user) view returns (uint256[] itemIds, uint256[] quantities)",
    "event ItemPurchased(address indexed buyer, uint256 indexed itemId, string name, uint256 price, bool paidWithDust, uint256 timestamp)",
    "event ItemUsed(address indexed user, uint256 indexed itemId, address target, uint256 effectValue, uint256 expiresAt)",
    "event HealthPackUsed(address indexed user, uint256 plantId, uint256 healAmount)",
    "event NukeActivated(address indexed user, uint256 expiresAt)",
    "event ShieldRemoved(address indexed user, string reason)",
];

export const SUPER_LAND_ABI = ["function upgrade(uint256 landTokenId)","function upgradeEnabled() view returns (bool)"];
export const ERC20_ABI = ["function approve(address spender, uint256 amount) returns (bool)","function allowance(address owner, address spender) view returns (uint256)","function balanceOf(address owner) view returns (uint256)"];

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
export const battleSystemV2Interface = new ethers.utils.Interface(BATTLE_SYSTEM_V2_ABI);
export const v5ItemShopInterface = new ethers.utils.Interface(V5_ITEMSHOP_ABI);
export const crateVaultInterface = new ethers.utils.Interface(CRATE_VAULT_ABI);
