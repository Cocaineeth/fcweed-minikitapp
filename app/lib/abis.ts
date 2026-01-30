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

// ===============================
// V6 STAKING ABI (xFCWEED REWARDS)
// ===============================
export const V6_STAKING_ABI = [
    // Core staking functions
    "function stakePlants(uint256[] calldata ids) external",
    "function unstakePlants(uint256[] calldata ids) external",
    "function stakeLands(uint256[] calldata ids) external",
    "function unstakeLands(uint256[] calldata ids) external",
    "function stakeSuperLands(uint256[] calldata ids) external",
    "function unstakeSuperLands(uint256[] calldata ids) external",
    
    // xFCWEED claim/convert
    "function claimXFcweed() external",
    "function convertToFcweed(uint256 xAmount) external",
    "function canHarvest(address user) view returns (bool)",
    
    // View functions
    "function pending(address account) view returns (uint256)",
    "function xFcweedBalance(address) view returns (uint256)",
    "function getXFcweedBalance(address) view returns (uint256)",
    "function getPendingRewards(address) view returns (uint256)",
    "function getUserStakedPlants(address) view returns (uint256[])",
    "function getUserStakedLands(address) view returns (uint256[])",
    "function getUserStakedSuperLands(address) view returns (uint256[])",
    
    // User struct
    "function users(address) view returns (uint64 last, uint32 plants, uint32 lands, uint32 superLands, uint256 accrued, uint256 bonusBoostBps, uint256 lastClaimTime, uint256 waterBalance, uint256 waterPurchasedToday, uint256 lastWaterPurchaseDay, uint256 stakedTokens, uint256 tokenStakeTime, address referrer, uint256 referralEarnings, uint32 referralCount, uint256 guildId, uint256 earningBoostBps, uint256 earningBoostExpiry, uint256 capacityBoost, uint256 capacityBoostExpiry, uint256 raidShieldExpiry, uint256 raidAttackBoostBps, uint256 raidAttackBoostExpiry, uint256 plantEarningBoostBpsTotal, uint64 lastPlantBoostBucketProcessed)",
    
    // Plant health
    "function getPlantHealth(uint256 tokenId) view returns (uint256)",
    "function getAverageHealth(address user) view returns (uint256)",
    "function getWaterNeeded(uint256 tokenId) view returns (uint256)",
    
    // Water functions
    "function buyWaterWithXFcweed(uint256 liters) external",
    "function buyWaterWithFcweed(uint256 liters) external",
    "function waterPlant(uint256 tokenId) external",
    "function waterAllPlants(uint256[] calldata tokenIds) external",
    "function waterPlantWithAmount(uint256 tokenId, uint256 amount) external",
    
    // Config
    "function waterPricePerLiter() view returns (uint256)",
    "function tokensPerPlantPerDay() view returns (uint256)",
    "function landBoostBps() view returns (uint256)",
    "function superLandBoostBps() view returns (uint256)",
    "function claimEnabled() view returns (bool)",
    "function waterShopEnabled() view returns (bool)",
    "function plantStakingEnabled() view returns (bool)",
    "function landStakingEnabled() view returns (bool)",
    "function superLandStakingEnabled() view returns (bool)",
    "function conversionRate() view returns (uint256)",
    "function conversionCooldown() view returns (uint256)",
    "function claimCooldown() view returns (uint256)",
    "function lastConvertTime(address) view returns (uint256)",
    
    // Battle stats
    "function getUserBattleStats(address) view returns (uint256 plants, uint256 lands, uint256 superLands, uint256 avgHealth, uint256 pendingRewards)",
    "function hasRaidShield(address) view returns (bool)",
    "function calculateBattlePower(address) view returns (uint256)",
    "function canUnstake(address) view returns (bool)",
    
    // Global stats
    "function totalPlantsStaked() view returns (uint256)",
    "function totalLandsStaked() view returns (uint256)",
    "function totalSuperLandsStaked() view returns (uint256)",
    "function getTotalStakers() view returns (uint256)",
    "function getStakerAtIndex(uint256) view returns (address)",
    
    // Events
    "event StakedPlants(address indexed user, uint256[] tokenIds)",
    "event UnstakedPlants(address indexed user, uint256[] tokenIds)",
    "event StakedLands(address indexed user, uint256[] tokenIds)",
    "event UnstakedLands(address indexed user, uint256[] tokenIds)",
    "event StakedSuperLands(address indexed user, uint256[] tokenIds)",
    "event UnstakedSuperLands(address indexed user, uint256[] tokenIds)",
    "event XFcweedClaimed(address indexed user, uint256 amount)",
    "event XFcweedConverted(address indexed user, uint256 xAmount, uint256 fcweedAmount)",
    "event WaterPurchased(address indexed user, uint256 liters, uint256 cost)",
    "event PlantWatered(address indexed user, uint256 tokenId, uint256 litersUsed)",
    "event PlantsWatered(address indexed user, uint256[] tokenIds, uint256 totalLitersUsed)",
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

// ===============================
// V5 BATTLES ABI (WITH DROUGHT)
// ===============================
export const V5_BATTLES_ABI = [
    // Core battle functions
    "function cartelAttack(address target, uint256 deadline, bytes calldata sig) external",
    "function deaRaid(address target) external",
    "function purgeAttack(address target) external",
    "function flagWithSig(address sus, uint256 amt, uint256 dl, bytes calldata sig) external",
    
    // Drought system
    "function activateDrought(uint8 paymentType) external",
    "function canDrought() view returns (bool)",
    "function timeToDrought() view returns (uint256)",
    "function lastDrought() view returns (uint256)",
    "function droughtOn() view returns (bool)",
    "function droughtCD() view returns (uint256)",
    "function droughtCost() view returns (uint256)",
    "function droughtTake() view returns (uint256)",
    "function droughtDmg() view returns (uint256)",
    "function droughtReward() view returns (uint256)",
    
    // Cartel skip fee
    "function skipCartelWithFee(address target, uint256 deadline, bytes calldata sig) external",
    "function cartelSkipFee() view returns (uint256)",
    
    // State variables
    "function cartelOn() view returns (bool)",
    "function deaOn() view returns (bool)",
    "function purgeManual() view returns (bool)",
    "function cartelFee() view returns (uint256)",
    "function deaFee() view returns (uint256)",
    "function purgeFee() view returns (uint256)",
    "function minPending() view returns (uint256)",
    "function searchNonce(address) view returns (uint256)",
    "function flagNonce(address) view returns (uint256)",
    
    // Cooldown checks
    "function canCartel(address) view returns (bool)",
    "function canDea(address) view returns (bool)",
    "function canDeaTarget(address,address) view returns (bool)",
    "function canPurge(address) view returns (bool)",
    "function canRaid(address) view returns (bool)",
    "function isPurgeActive() view returns (bool)",
    
    // Stats functions
    "function getAtkStats(address) view returns (uint256 wins, uint256 losses, uint256 stolen, uint256 nukes)",
    "function getDefStats(address) view returns (uint256 wins, uint256 losses, uint256 lost, bool hasShield)",
    "function getSuspect(address) view returns (bool isSuspect, uint256 expiresAt, uint256 raids, uint256 lost, uint256 sold, uint256 cnt)",
    "function getGlobal() view returns (uint256 cartel, uint256 dea, uint256 purge, uint256 flagged, uint256 redist, uint256 fees, uint256 burned)",
    "function getPower(address) view returns (uint256 base, uint256 atk, uint256 def)",
    "function getSuspectList() view returns (address[])",
    
    // Timestamps
    "function lastCartel(address) view returns (uint256)",
    "function lastDea(address) view returns (uint256)",
    "function lastDeaOn(address,address) view returns (uint256)",
    "function lastPurge(address) view returns (uint256)",
    
    // Events
    "event CartelResult(address indexed a, address indexed d, bool w, uint256 ap, uint256 dp, uint256 s, uint256 dmg)",
    "event DeaResult(address indexed a, address indexed t, bool w, uint256 ap, uint256 dp, uint256 s, uint256 dmg)",
    "event PurgeResult(address indexed a, address indexed t, bool w, uint256 ap, uint256 dp, uint256 s, uint256 dmg)",
    "event Flagged(address indexed s, uint256 amt, uint256 exp)",
    "event DroughtActivated(address indexed activator, uint256 totalTaken, uint256 activatorReward)",
    "event NukeUsed(address indexed a, address indexed t)",
];

// V3 Battles (backwards compatibility alias)
export const V3_BATTLES_ABI = [
    "function cartelAttack(address target, uint256 deadline, bytes calldata sig) external",
    "function deaRaid(address target) external",
    "function purgeAttack(address target) external",
    "function flagWithSig(address sus, uint256 amt, uint256 dl, bytes calldata sig) external",
    "function cartelOn() view returns (bool)",
    "function deaOn() view returns (bool)",
    "function purgeManual() view returns (bool)",
    "function cartelFee() view returns (uint256)",
    "function deaFee() view returns (uint256)",
    "function purgeFee() view returns (uint256)",
    "function minPending() view returns (uint256)",
    "function searchNonce(address) view returns (uint256)",
    "function flagNonce(address) view returns (uint256)",
    "function canCartel(address) view returns (bool)",
    "function canDea(address) view returns (bool)",
    "function canDeaTarget(address,address) view returns (bool)",
    "function canPurge(address) view returns (bool)",
    "function canRaid(address) view returns (bool)",
    "function isPurgeActive() view returns (bool)",
    "function getAtkStats(address) view returns (uint256 wins, uint256 losses, uint256 stolen, uint256 nukes)",
    "function getDefStats(address) view returns (uint256 wins, uint256 losses, uint256 lost, bool hasShield)",
    "function getSuspect(address) view returns (bool isSuspect, uint256 expiresAt, uint256 raids, uint256 lost, uint256 sold, uint256 cnt)",
    "function getGlobal() view returns (uint256 cartel, uint256 dea, uint256 purge, uint256 flagged, uint256 redist, uint256 fees, uint256 burned)",
    "function getPower(address) view returns (uint256 base, uint256 atk, uint256 def)",
    "function getSuspectList() view returns (address[])",
    "function lastCartel(address) view returns (uint256)",
    "function lastDea(address) view returns (uint256)",
    "function lastDeaOn(address,address) view returns (uint256)",
    "function lastPurge(address) view returns (uint256)",
    "event CartelResult(address indexed a, address indexed d, bool w, uint256 ap, uint256 dp, uint256 s, uint256 dmg)",
    "event DeaResult(address indexed a, address indexed t, bool w, uint256 ap, uint256 dp, uint256 s, uint256 dmg)",
    "event PurgeResult(address indexed a, address indexed t, bool w, uint256 ap, uint256 dp, uint256 s, uint256 dmg)",
    "event Flagged(address indexed s, uint256 amt, uint256 exp)",
    "event NukeUsed(address indexed a, address indexed t)",
];

export const BATTLE_SYSTEM_V3_ABI = V3_BATTLES_ABI;

// ===============================
// V11/V14/V15 ITEMSHOP ABI
// ===============================
export const V11_ITEMSHOP_ABI = [
    "function purchaseWithFcweed(uint256 itemId) external",
    "function purchaseWithDust(uint256 itemId) external",
    "function purchaseWithXFcweed(uint256 itemId) external",
    "function purchaseWithUsdc(uint256 itemId) external",
    "function activateAK47() external",
    "function activateRPG() external",
    "function activateAttackBoost() external",
    "function activateNuke() external",
    "function activateShield() external",
    "function useHealthPack(uint256 plantId) external",
    "function useHealthPackBatch(uint256[] calldata plantIds) external",
    "function removeShieldSelf() external",
    "function inventory(address,uint256) view returns (uint256)",
    "function getUserInventory(address) view returns (uint256 ak47, uint256 rpg, uint256 nuke, uint256 healthPack, uint256 shield, uint256 attackBoost)",
    "function getUserActiveBoosts(address) view returns (uint256 ak47Boost, uint256 ak47Expires, uint256 rpgBoost, uint256 rpgExpires, uint256 attackBoostBps, uint256 attackBoostExpires, bool nukeReady, uint256 nukeExpires, bool shieldActive, uint256 shieldExpires, uint256 totalBoost)",
    "function getItemConfig(uint256 itemId) view returns (string name, uint256 fcweedPrice, uint256 dustPrice, uint256 boostBps, uint256 duration, uint256 dailySupply, uint256 soldToday, bool isWeapon)",
    "function getDailyStock(uint256 itemId) view returns (uint256 remaining, uint256 total)",
    "function getTimeUntilReset() view returns (uint256)",
    "function hasActiveShield(address) view returns (bool active, uint256 expiresAt)",
    "function hasActiveNukeReady(address) view returns (bool)",
    "function getTotalAttackBoost(address) view returns (uint256)",
    "function shopEnabled() view returns (bool)",
    "function purgeActive() view returns (bool)",
    "event ItemPurchased(address indexed buyer, uint256 indexed itemId, bool withDust)",
    "event ItemActivated(address indexed user, uint256 indexed itemId, uint256 expiresAt)",
    "event HealthPackUsed(address indexed user, uint256 plantId, uint256 healAmount)",
    "event ShieldRemoved(address indexed user)",
    "event NukeConsumed(address indexed user, address indexed target)",
];

export const V5_ITEMSHOP_ABI = V11_ITEMSHOP_ABI;
export const V14_ITEMSHOP_ABI = V11_ITEMSHOP_ABI;
export const V15_ITEMSHOP_ABI = V11_ITEMSHOP_ABI;

// V4 battles (legacy)
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
    "event SearchInitiated(address indexed attacker, address indexed target, uint256 fee)",
    "event CartelBattleResult(address indexed attacker, address indexed defender, bool attackerWon, uint256 damageDealt, uint256 rewardsTransferred)",
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

// ===============================
// USDC ITEM SHOP ABI
// ===============================
export const USDC_ITEM_SHOP_ABI = [
    "function buyItem(uint256 itemId, uint256 quantity) external",
    "function buyNuke() external",
    "function buyHealthPack() external",
    "function buyHealthPacks(uint256 quantity) external",
    "function buyCropDuster() external",
    "function getRemainingSupply(uint256 itemId) external view returns (uint256)",
    "function getItemInfo(uint256 itemId) external view returns (string name, uint256 price, uint256 remaining, uint256 total, uint256 mainShopId, bool active)",
    "function getAllItems() external view returns (uint256[] ids, string[] names, uint256[] prices, uint256[] remaining, uint256[] totals, uint256[] mainShopIds, bool[] actives)",
    "function getUserPurchases(address user) external view returns (uint256[] itemIds, uint256[] quantities)",
    "function getTimeUntilReset() external view returns (uint256)",
    "function shopEnabled() external view returns (bool)",
    "function treasury() external view returns (address)",
    "function items(uint256) external view returns (string name, uint256 usdcPrice, uint256 dailySupply, uint256 mainShopItemId, bool active)",
    "event USDCItemPurchased(address indexed buyer, uint256 indexed itemId, uint256 indexed mainShopItemId, string itemName, uint256 usdcPaid, uint256 quantity, uint256 timestamp)",
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
export const v6StakingInterface = new ethers.utils.Interface(V6_STAKING_ABI);
export const v4BattlesInterface = new ethers.utils.Interface(V4_BATTLES_ABI);
export const battleSystemV2Interface = new ethers.utils.Interface(BATTLE_SYSTEM_V2_ABI);
export const v3BattlesInterface = new ethers.utils.Interface(V3_BATTLES_ABI);
export const v5BattlesInterface = new ethers.utils.Interface(V5_BATTLES_ABI);
export const v11ItemShopInterface = new ethers.utils.Interface(V11_ITEMSHOP_ABI);
export const v5ItemShopInterface = v11ItemShopInterface;
export const crateVaultInterface = new ethers.utils.Interface(CRATE_VAULT_ABI);
export const usdcItemShopInterface = new ethers.utils.Interface(USDC_ITEM_SHOP_ABI);
