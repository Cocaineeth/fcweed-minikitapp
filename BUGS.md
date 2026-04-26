# FCWEED V6 — Frontend Bug Tracker

Live contract addresses (Base mainnet):

| Contract | Address |
|---|---|
| Plant ERC721 | `0xD84890240C2CBB66a825915cD20aEe89C6b66dD5` |
| Land ERC721 | `0x798A8F4b4799CfaBe859C85889c78e42a57d71c1` |
| SuperLand ERC721 | `0xAcd70377fF1aaF4E1aE76398C678CBE6ECc35e7d` |
| FCWEED ERC20 | `0x42ef01219BDb2190F275Cda7956D08822549d224` |
| Staking V6 | `0xF1c619ad86e7a9C83502D4200DFD6263B5e2E020` |
| Item Shop V15 | `0xa11A61B2A8E8822a468d82bF404e122a87b2251a` |
| Battles V10 | `0xB0e2D0d5794C2e86A57C77EdCD962191670B0dcE` |
| CrateVault V4 | `0xEf273E227B3e6e1d560BC17170eFF99A94686786` |
| USDC Premium Shop V1 | `0xA69646f43bD0a620A18F3c4c29cf3489b73ca7b3` |
| Treasury | `0x5A567898881cef8DF767D192B74d99513cAa6e46` |
| Backend Signer | `0x153a48Db09Ec2d9363966DFA55049f25F3e48043` |

Legacy (do NOT call from current UI — wired to deprecated StakingV5):
- BattleRouter `0x7C1caA166cB77076Aeacd2601f40Fcf788Bf044c`
- DEARaids (standalone) `0x94EA1CCF45D5B363b36329baD49e7b67De802E41`
- ThePurge (standalone) `0x60e845616bD85e61054b18863cD3A30D36353E4b`

All current Cartel / DEA / Purge / CropDuster flows live inside **Battles V10** (`flagSuspect`, `deaRaid`, `purgeAttack`, `cropDusterAttack`, `cartelSearch`, `cartelSkip`).

---

## Issue tracker

### 1. Water Supply Window (12pm–6pm EST)
- [ ] Deploy `FCWEEDWaterShopV1` (`fcweed-v6/contracts/FCWEEDWaterShopV1.sol`)
- [ ] `staking.setAuthorizedContract(waterShop, true)` — lets shop call `spendXFcweed`
- [ ] `itemShop.setAuthorizedWaterContract(waterShop, true)` — lets shop call `grantWater` proxy
- [ ] `staking.setWaterShopEnabled(false)` — disable old in-staking buy paths
- [ ] Frontend (Next.js + WP) repointed from `staking.buyWaterWith*` to `waterShop.buyWater(liters, payKind)`
- [ ] UI states from `waterShop.getWaterStatus(user)`: `windowOpen`, `secondsUntilOpen/Close`, `userRemaining`, `globalRemaining`, `xFcweedPrice`/`fcweedPrice`/`usdcPrice`
- [ ] Next.js miniapp
- [ ] WordPress PHP frontend

**Resolution:** New standalone WaterShopV1 contract enforces window + per-user cap + global cap on-chain. V6 Staking's `buyWaterWith*` paths get disabled via `setWaterShopEnabled(false)`. WaterShop calls `staking.spendXFcweed` for xFCWEED payment, transfers FCWEED/USDC to treasury directly, then forwards to `itemShop.grantWater` which forwards to `staking.grantWater` to credit the user's `User.waterBalance`.

DST handled on-chain (US rule: 2nd Sunday March → 1st Sunday November). No admin maintenance.

Cap formula: `plants * basePlantWater * (1 + lands*landBoostBps/10000 + superLands*superLandBoostBps/10000)`. Defaults: `basePlantWater=10`, `landBoostBps=250` (matches staking emission boost), `superLandBoostBps=1200` (matches). All admin-tunable.

Frontend functions:
- `waterShop.buyWater(uint256 liters, PayKind pay)` — `pay`: 0=XFCWEED, 1=FCWEED, 2=USDC
- `waterShop.getWaterStatus(address)` — single read for UI
- `waterShop.userDailyCap(address)` — sanity-check display
- `waterShop.isWindowOpen()` — quick boolean

---

### 2. Watering Plants With Purchased Water
- [ ] `waterPlant(plantId)` calls correctly
- [ ] `waterAllPlants(plantIds[])` batch path
- [ ] `waterPlantWithAmount(plantId, amount)` partial-water path
- [ ] Post-tx refresh: `plantInfo[plantId].lastWateredTime`, `getPlantHealth(plantId)`, `User.waterBalance`
- [ ] Indexer cache invalidation post-tx
- [ ] Post stake/unstake cycle: re-read `getPlantHealth(plantId)` from chain, NEVER assume restake = full health
- [ ] Next.js miniapp
- [ ] WordPress PHP frontend

**Anti-glitch note:** V6 Staking already prevents the "unstake/restake to reset water decay" exploit:
- `unstakePlants` requires `getPlantHealth(id) >= 100` per plant — can't unstake decayed plants.
- On unstake: `plantLastWaterByNFT[id] = plantInfo[id].lastWateredTime` (preserved).
- On restake: `lastWateredTime = plantEverStaked[id] ? plantLastWaterByNFT[id] : block.timestamp` — restores prior timestamp, does NOT reset.
- Initial 30-min decay grace explicitly does NOT apply on restake (`lastWater >= p.stakedAt` check fails).
- `getPlantHealth` for unstaked plants computes decay from preserved timestamp, so health continues to drop while unstaked.

Frontend bug surface: any UI that caches `lastWateredTime` locally and resets it after a restake event will show fake-fresh health that doesn't match chain. Always re-fetch on stake/unstake events.

Frontend reads:
- `staking.users(addr)` → returns `User` struct, includes `waterBalance` (12th field)
- `staking.plantInfo(plantId)` → `(staker, stakedAt, lastWateredTime, healthBoostExpiry, healthBoostPercent, earningBoostBps, earningBoostExpiry)`
- `staking.getPlantHealth(plantId)` → 0–100
- `staking.getWaterNeeded(plantId)` → liters in 1e18 units
- `staking.getAverageHealth(addr)` → for yield multiplier display

Events to listen for cache bust:
- `PlantWatered(user, tokenId, litersUsed)`
- `PlantsWatered(user, tokenIds[], totalLitersUsed)`
- `WaterPurchased(user, liters, cost)`

---

### 3. Cartel Wars / Attack Modes (Battles V10)
- [ ] Cartel target selection → `cartelSearch(target, deadline, sig)` (EIP-712 backend sig required)
- [ ] Cartel skip flow → `cartelSkip(deadline, sig)` (EIP-712)
- [ ] DEA Raids → `deaRaid(target)` — only on flagged suspects
- [ ] Suspect flagging → `flagSuspect(suspect, soldAmt, deadline, sig)` (backend EIP-712)
- [ ] Purge attacks → `purgeAttack(target)` — gated by `isPurgeActive()`
- [ ] Crop Duster → `cropDusterAttack([t1,t2,t3])` (3 distinct targets, item activated)
- [ ] Defender state preview before submit
- [ ] Cooldowns displayed accurately:
  - Cartel: `lastCartel[user] + cartelCD` (default 6h)
  - DEA global: `lastDea[user] + deaCD` (current 2h per `DEA Changes.txt`)
  - DEA per-target: `lastDeaOn[user][target] + deaTargetCD` (current 6h per `DEA Changes.txt`)
  - DEA target immunity post-raid: `Suspect.raidAt + deaTargetImm` (current 2h)
  - Purge: `lastPurge[user] + purgeCD` (default 20m)
- [ ] Shield surfacing: `_shield(target)` = `itemShop.hasActiveShield(target).0 || staking.hasRaidShield(target)`
- [ ] DEA suspect false-positive guard: confirm `getSuspect(target)` reads cleanly and same-cartel logic (if any) is in backend signer, not on-chain
- [ ] Loot/result display from `CartelResult`/`DeaResult`/`PurgeResult`/`NukeUsed`/`CropDusterUsed` events
- [ ] Next.js miniapp
- [ ] WordPress PHP frontend

View helpers: `canCartel`, `canDea`, `canDeaTarget`, `canPurge`, `canRaid`, `getAtkStats`, `getDefStats`, `getSuspect`, `getPower`, `getSuspectList`, `getStakersForTargeting`.

**Note on DEA same-cartel false-positive:** The Battles V10 contract has no on-chain cartel-membership concept. If "same cartel" filtering is desired, it has to happen in the backend signer (refuse to sign `flagSuspect` / refuse to sign DEA target search) or in the UI. Confirm where the user-facing block currently lives.

---

### 4. Item Shop V15
- [ ] xFCWEED purchase path — `buyItem(itemId, PaymentType.XFCWEED)` / `buyItemMultiple` calls `staking.spendXFcweed()` directly. **No conversion required.**
- [ ] FCWEED purchase path — needs `fcweed.approve(itemShop, amount)` first
- [ ] USDC purchase path (Premium / Crop Duster / Nuke / Health Pack / Water Pack) — needs `usdc.approve(itemShop, amount)` first
- [ ] Dust purchase path — calls `crateVault.spendDustOnBehalf(user, amount, itemId)`
- [ ] Daily reset state: `getRemainingSupply(itemId)` reads `lastResetDay[itemId] < getCurrentDay() ? 0 : dailySold[itemId]`. Reset day = `block.timestamp / 86400` → **midnight UTC**, confirmed in code.
- [ ] Per-user purchase caps — **none on-chain**; only global `dailySupply`. If per-user caps are advertised in UI they are pure frontend gating.
- [ ] Activation flow: `activateItem(itemId)` for AK47/RPG/Nuke/Shield/AttackBoost/WaterPack/CropDuster; `useHealthPack(plantId)` for Health Pack
- [ ] Inventory read: `getInventory(addr, itemId)` or `getUserFullInventory(addr)`
- [ ] Active boosts: `getActiveBoosts(addr)` returns 11 fields including `cropDusterActive` and `cropDusterExp`
- [ ] Next.js miniapp
- [ ] WordPress PHP frontend

Item IDs: AK47=1, RPG=2, NUKE=3, HEALTH_PACK=4, SHIELD=5, ATTACK_BOOST=6, WATER_PACK=7, CROP_DUSTER=8.

**Bug pattern to watch for:** any UI that calls `convertToFcweed()` before a shop purchase is wrong — burn that path.

---

### 6. Plant Health Disclosure on Marketplaces
- [ ] Deploy `fcweed-backend-fresh/plant-metadata-server.js` on public host
- [ ] Set `BASE_METADATA_DIR` or `BASE_METADATA_URL` env to existing static metadata source
- [ ] Owner runs `set-plant-base-uri.js` to flip Plant ERC721 baseURI to the new dynamic endpoint
- [ ] Run `opensea-refresh.js --staked` (then full range if needed) to bust OpenSea cache
- [ ] Verify Health, Health Status, Staked, Last Watered, and Decay Warning attributes render on OpenSea
- [ ] Same metadata used by Next.js miniapp + WordPress for consistency

**Resolution:** No contract changes. Plant ERC721 (`X420Plants`) already has `setBaseURI(string) onlyOwner`. New metadata server reads existing JSON, augments with live `staking.getPlantHealth(tokenId)` + `plantInfo` + `plantLastWaterByNFT`, returns OpenSea-compatible JSON with health attributes. When a plant is unstaked AND has decayed, server injects an explicit `Decay Warning` trait + appends warning to `description` field — buyers on any marketplace see the rot before they pay.

Files:
- `fcweed-backend-fresh/plant-metadata-server.js` — Express router (mount or run standalone on :3030)
- `fcweed-backend-fresh/opensea-refresh.js` — bulk OpenSea cache refresh CLI
- `fcweed-v6/scripts/set-plant-base-uri.js` — admin baseURI flip

### 5. Dust Shop / CrateVault V4
- [ ] Dust balance read from CrateVault state (verify exact getter name in CrateVaultV2.sol)
- [ ] Dust spend → Item Shop calls `crateVault.spendDustOnBehalf(user, amount, itemId)` on `PaymentType.DUST`
- [ ] Direct dust shop UI (if separate from Item Shop) calls correct CrateVault function
- [ ] Exchange rates displayed match contract (Item Shop dust prices defined per item: 1k AK, 4k RPG, 10k Nuke, 2k Health Pack, 2.5k Shield, 200 Attack Boost, 500 Water Pack)
- [ ] Next.js miniapp
- [ ] WordPress PHP frontend

---

## Working notes

- **Hard rule:** No contract changes. If a fix requires one, flag here and stop.
- **ethers versions:** v6 in Next.js miniapp; v5 in WordPress-served JS. Don't mix in a single file.
- **Token economics rule:** xFCWEED spends are 1:1 internal-balance via `staking.spendXFcweed()` (Item Shop) or direct calls (`buyWaterWithXFcweed`). **Never** force `convertToFcweed()` ahead of an in-game spend.
- **Pending discovery:** Battles V10 source-vs-bytecode parity (local source is labelled V5; redeployment number bumped to V10). CrateVault V2 source vs V4 deployed address. Verify before assuming ABI matches.
