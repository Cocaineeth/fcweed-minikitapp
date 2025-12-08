"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { sdk } from "@farcaster/miniapp-sdk";
import { ethers } from "ethers";
import styles from "./page.module.css";

const CHAIN_ID = 8453;

const PLANT_ADDRESS = "0xD84890240C2CBB66a825915cD20aEe89C6b66dD5";
const LAND_ADDRESS = "0x798A8F4b4799CfaBe859C85889c78e42a57d71c1";
const STAKING_ADDRESS = "0x45fcaaDBa0fe033ef6bC922B2B51fC4AFc703bBa";
const TOKEN_SYMBOL = "FCWEED";

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;

const PLANT_PRICE_USDC = ethers.utils.parseUnits("49.99", USDC_DECIMALS);
const LAND_PRICE_USDC = ethers.utils.parseUnits("199.99", USDC_DECIMALS);

const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const LAND_ABI = ["function mint(uint256 quantity)"];
const PLANT_ABI = ["function mint(uint256 quantity)"];

const ERC721_VIEW_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
];

const STAKING_ABI = [
  "function users(address) view returns (uint64 last,uint32 plants,uint32 lands,uint256 accrued)",
  "function pending(address) view returns (uint256)",
  "function plantsOf(address) view returns (uint256[] memory)",
  "function landsOf(address) view returns (uint256[] memory)",
  "function stakePlants(uint256[] calldata ids)",
  "function unstakePlants(uint256[] calldata ids)",
  "function stakeLands(uint256[] calldata ids)",
  "function unstakeLands(uint256[] calldata ids)",
  "function claim()",
  "function landBoostBps() view returns (uint256)",
  "function tokensPerPlantPerDay() view returns (uint256)",
  "function landStakingEnabled() view returns (bool)",
  "function claimEnabled() view returns (bool)",
];

type StakingStats = {
  plantsStaked: number;
  landsStaked: number;
  totalSlots: number;
  capacityUsed: number;
  landBoostPct: number;
  pendingFormatted: string;
  claimEnabled: boolean;
};

export default function Home() {
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();

  const [provider, setProvider] =
    useState<ethers.providers.Web3Provider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [usingMiniApp, setUsingMiniApp] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [stakingOpen, setStakingOpen] = useState(false);
  const [stakingStats, setStakingStats] = useState<StakingStats | null>(null);
  const [availablePlants, setAvailablePlants] = useState<number[]>([]);
  const [availableLands, setAvailableLands] = useState<number[]>([]);
  const [stakedPlants, setStakedPlants] = useState<number[]>([]);
  const [stakedLands, setStakedLands] = useState<number[]>([]);
  const [loadingStaking, setLoadingStaking] = useState(false);

  // NEW: only this controls button disabled state
  const [actionLoading, setActionLoading] = useState(false);

  const [landStakingEnabled, setLandStakingEnabled] = useState(false);

  const [selectedAvailPlants, setSelectedAvailPlants] = useState<number[]>([]);
  const [selectedAvailLands, setSelectedAvailLands] = useState<number[]>([]);
  const [selectedStakedPlants, setSelectedStakedPlants] = useState<number[]>(
    [],
  );
  const [selectedStakedLands, setSelectedStakedLands] = useState<number[]>([]);

  const [plantImages, setPlantImages] = useState<Record<number, string>>({});
  const [landImages, setLandImages] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!isMiniAppReady) {
      setMiniAppReady();
    }
    (async () => {
      try {
        await sdk.actions.ready();
      } catch {}
    })();
  }, [isMiniAppReady, setMiniAppReady]);

  useEffect(() => {
    const detect = async () => {
      try {
        // Cast to any so TypeScript doesn't complain during build
        const anySdk = sdk as any;

        if (anySdk.host?.getInfo) {
          await anySdk.host.getInfo();
          setUsingMiniApp(true);
        } else {
          // If host API doesn't exist, assume normal browser
          setUsingMiniApp(false);
        }
      } catch {
        setUsingMiniApp(false);
      }
    };

    detect();
  }, []);

  const shortAddr = (addr?: string | null) =>
    addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "Connect Wallet";

  async function ensureWallet() {
    if (signer && provider && userAddress) {
      return { signer, provider, userAddress };
    }

    try {
      setConnecting(true);
      let p: ethers.providers.Web3Provider;

      if (usingMiniApp) {
        const ethProvider = await sdk.wallet.getEthereumProvider();
        p = new ethers.providers.Web3Provider(ethProvider as any, "any");
      } else {
        const anyWindow = window as any;
        if (!anyWindow.ethereum) {
          alert(
            "No wallet found. Open this in the Base app / Warpcast, or install MetaMask.",
          );
          setConnecting(false);
          return null;
        }
        await anyWindow.ethereum.request({
          method: "eth_requestAccounts",
        });
        p = new ethers.providers.Web3Provider(anyWindow.ethereum, "any");
      }

      const s = p.getSigner();
      const addr = await s.getAddress();
      const net = await p.getNetwork();

      if (net.chainId !== CHAIN_ID) {
        const anyWindow = window as any;
        if (anyWindow.ethereum?.request) {
          try {
            await anyWindow.ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: "0x2105" }],
            });
          } catch {}
        }
      }

      setProvider(p);
      setSigner(s);
      setUserAddress(addr);
      setConnecting(false);

      return { signer: s, provider: p, userAddress: addr };
    } catch (err) {
      console.error("Wallet connect failed:", err);
      setConnecting(false);
      return null;
    }
  }

  async function ensureUsdcAllowance(
    spender: string,
    required: ethers.BigNumber,
  ) {
    const ctx = await ensureWallet();
    if (!ctx) return;

    const { signer: s, provider: p, userAddress: addr } = ctx;

    const code = await p!.getCode(USDC_ADDRESS);
    if (code === "0x") {
      alert(
        "USDC token not found on this network. Please make sure you are on Base mainnet.",
      );
      return;
    }

    const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, s);

    let current: ethers.BigNumber;
    try {
      current = await usdc.allowance(addr, spender);
    } catch (e) {
      console.error("USDC allowance() call reverted:", e);
      alert(
        "Error reading USDC allowance. Double-check that you’re on Base and the USDC address is correct.",
      );
      return;
    }

    if (current.gte(required)) {
      return;
    }

    const tx = await usdc.approve(spender, required);
    await tx.wait();
  }

  async function handleMintLand() {
    try {
      const ctx = await ensureWallet();
      if (!ctx) return;

      await ensureUsdcAllowance(LAND_ADDRESS, LAND_PRICE_USDC);

      const land = new ethers.Contract(LAND_ADDRESS, LAND_ABI, ctx.signer);
      const tx = await land.mint(1);
      await tx.wait();
    } catch (err) {
      console.error("Mint Land error:", err);
    }
  }

  async function handleMintPlant() {
    try {
      const ctx = await ensureWallet();
      if (!ctx) return;

      await ensureUsdcAllowance(PLANT_ADDRESS, PLANT_PRICE_USDC);

      const plant = new ethers.Contract(PLANT_ADDRESS, PLANT_ABI, ctx.signer);
      const tx = await plant.mint(1);
      await tx.wait();
    } catch (err) {
      console.error("Mint Plant error:", err);
    }
  }

  function toHttpFromMaybeIpfs(uri: string): string {
    if (!uri) return "";
    if (uri.startsWith("ipfs://")) {
      const path = uri.slice("ipfs://".length);
      return `https://ipfs.io/ipfs/${path}`;
    }
    return uri;
  }

  async function loadOwnedTokens(
    nftAddress: string,
    owner: string,
    prov: ethers.providers.Provider,
  ): Promise<number[]> {
    try {
      const nft = new ethers.Contract(nftAddress, ERC721_VIEW_ABI, prov);
      const balBn: ethers.BigNumber = await nft.balanceOf(owner);
      const bal = balBn.toNumber();
      if (bal === 0) return [];

      let maxId = 2000;
      try {
        const totalBn: ethers.BigNumber = await nft.totalSupply();
        const total = totalBn.toNumber();
        maxId = Math.min(total + 5, 2000);
      } catch {}

      const ids: number[] = [];
      const ownerLower = owner.toLowerCase();

      for (let tokenId = 0; tokenId <= maxId && ids.length < bal; tokenId++) {
        try {
          const who: string = await nft.ownerOf(tokenId);
          if (who.toLowerCase() === ownerLower) {
            ids.push(tokenId);
          }
        } catch {}
      }

      return ids;
    } catch (e) {
      console.error("Failed to enumerate tokens for", nftAddress, e);
      return [];
    }
  }

  async function fetchNftImages(
    nftAddress: string,
    ids: number[],
    prov: ethers.providers.Provider,
  ): Promise<Record<number, string>> {
    const out: Record<number, string> = {};
    if (ids.length === 0) return out;

    try {
      const nft = new ethers.Contract(nftAddress, ERC721_VIEW_ABI, prov);
      for (const id of ids) {
        try {
          const uri: string = await nft.tokenURI(id);
          const url = toHttpFromMaybeIpfs(uri);
          const res = await fetch(url);
          if (!res.ok) continue;
          const meta = await res.json();
          let img: string = meta.image || "";
          img = toHttpFromMaybeIpfs(img);
          if (img) out[id] = img;
        } catch (e) {
          console.error("Failed to fetch metadata", nftAddress, id, e);
        }
      }
    } catch (e) {
      console.error("fetchNftImages top-level error", nftAddress, e);
    }
    return out;
  }

  async function refreshStaking() {
    if (!stakingOpen) return;

    const ctx = await ensureWallet();
    if (!ctx) return;

    const { provider: p, userAddress: addr } = ctx;

    const staking = new ethers.Contract(
      STAKING_ADDRESS,
      STAKING_ABI,
      p as ethers.providers.Provider,
    );

    setLoadingStaking(true);
    try {
      const [
        user,
        pendingRaw,
        stakedPlantIds,
        stakedLandIds,
        landBps,
        claimEnabled,
        landEnabled,
      ] = await Promise.all([
        staking.users(addr),
        staking.pending(addr),
        staking.plantsOf(addr),
        staking.landsOf(addr),
        staking.landBoostBps(),
        staking.claimEnabled(),
        staking.landStakingEnabled(),
      ]);

      const plantsStaked = Number(user.plants);
      const landsStaked = Number(user.lands);
      const totalSlots = 1 + landsStaked * 3;
      const capacityUsed = plantsStaked;
      const landBoostPct = (landsStaked * Number(landBps)) / 100;
      const pendingFormatted = ethers.utils.formatUnits(pendingRaw, 18);

      const plantOwned = await loadOwnedTokens(PLANT_ADDRESS, addr, p);
      const landOwned = await loadOwnedTokens(LAND_ADDRESS, addr, p);

      const stakedPlantNums = stakedPlantIds.map((x: any) => Number(x));
      const stakedLandNums = stakedLandIds.map((x: any) => Number(x));

      const stakedPlantSet = new Set(stakedPlantNums);
      const stakedLandSet = new Set(stakedLandNums);

      const availPlants = plantOwned.filter((id) => !stakedPlantSet.has(id));
      const availLands = landOwned.filter((id) => !stakedLandSet.has(id));

      setStakedPlants(stakedPlantNums);
      setStakedLands(stakedLandNums);
      setAvailablePlants(availPlants);
      setAvailableLands(availLands);
      setLandStakingEnabled(landEnabled);

      setStakingStats({
        plantsStaked,
        landsStaked,
        totalSlots,
        capacityUsed,
        landBoostPct,
        pendingFormatted,
        claimEnabled,
      });

      const allPlantIds = Array.from(new Set([...plantOwned, ...stakedPlantNums]));
      const allLandIds = Array.from(new Set([...landOwned, ...stakedLandNums]));

      const [plantImgs, landImgs] = await Promise.all([
        fetchNftImages(PLANT_ADDRESS, allPlantIds, p),
        fetchNftImages(LAND_ADDRESS, allLandIds, p),
      ]);

      setPlantImages(plantImgs);
      setLandImages(landImgs);
    } catch (err) {
      console.error("Failed to load staking state:", err);
    } finally {
      setLoadingStaking(false);
    }
  }

  useEffect(() => {
    if (!stakingOpen) return;
    refreshStaking();
    const id = setInterval(() => {
      refreshStaking();
    }, 20000);
    return () => clearInterval(id);
  }, [stakingOpen]);

  async function ensureCollectionApproval(
    collectionAddress: string,
    ctx: {
      signer: ethers.Signer;
      provider: ethers.providers.Provider;
      userAddress: string;
    },
  ) {
    const nft = new ethers.Contract(collectionAddress, ERC721_VIEW_ABI, ctx.signer);
    const approved: boolean = await nft.isApprovedForAll(
      ctx.userAddress,
      STAKING_ADDRESS,
    );
    if (!approved) {
      const tx = await nft.setApprovalForAll(STAKING_ADDRESS, true);
      await tx.wait();
    }
  }

  async function handleStakeSelected() {
    const ctx = await ensureWallet();
    if (!ctx) return;

    const toStakePlants = selectedAvailPlants;
    const toStakeLands = selectedAvailLands;

    if (toStakePlants.length === 0 && toStakeLands.length === 0) {
      alert("No NFTs selected to stake.");
      return;
    }

    const staking = new ethers.Contract(
      STAKING_ADDRESS,
      STAKING_ABI,
      ctx.signer,
    );

    try {
      setActionLoading(true);

      if (toStakePlants.length > 0) {
        await ensureCollectionApproval(PLANT_ADDRESS, ctx);
        const tx = await staking.stakePlants(
          toStakePlants.map((id) => ethers.BigNumber.from(id)),
        );
        await tx.wait();
      }

      if (toStakeLands.length > 0 && landStakingEnabled) {
        await ensureCollectionApproval(LAND_ADDRESS, ctx);
        const tx2 = await staking.stakeLands(
          toStakeLands.map((id) => ethers.BigNumber.from(id)),
        );
        await tx2.wait();
      }

      setSelectedAvailPlants([]);
      setSelectedAvailLands([]);
      await refreshStaking();
    } catch (err) {
      console.error("Stake selected error:", err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUnstakeSelected() {
    const ctx = await ensureWallet();
    if (!ctx) return;

    const toUnstakePlants = selectedStakedPlants;
    const toUnstakeLands = selectedStakedLands;

    if (toUnstakePlants.length === 0 && toUnstakeLands.length === 0) {
      alert("No NFTs selected to unstake.");
      return;
    }

    const staking = new ethers.Contract(
      STAKING_ADDRESS,
      STAKING_ABI,
      ctx.signer,
    );

    try {
      setActionLoading(true);

      if (toUnstakePlants.length > 0) {
        const tx = await staking.unstakePlants(
          toUnstakePlants.map((id) => ethers.BigNumber.from(id)),
        );
        await tx.wait();
      }

      if (toUnstakeLands.length > 0) {
        const tx2 = await staking.unstakeLands(
          toUnstakeLands.map((id) => ethers.BigNumber.from(id)),
        );
        await tx2.wait();
      }

      setSelectedStakedPlants([]);
      setSelectedStakedLands([]);
      await refreshStaking();
    } catch (err) {
      console.error("Unstake selected error:", err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClaim() {
    const ctx = await ensureWallet();
    if (!ctx) return;

    const staking = new ethers.Contract(
      STAKING_ADDRESS,
      STAKING_ABI,
      ctx.signer,
    );

    const pendingAmount =
      stakingStats && stakingStats.pendingFormatted
        ? parseFloat(stakingStats.pendingFormatted)
        : 0;

    if (!pendingAmount || pendingAmount <= 0) {
      alert("No pending rewards to claim yet.");
      return;
    }

    try {
      setActionLoading(true);
      const tx = await staking.claim();
      await tx.wait();
      await refreshStaking();
    } catch (err) {
      console.error("Claim error:", err);
    } finally {
      setActionLoading(false);
    }
  }

  const connected = !!userAddress;
  const pendingFloat = stakingStats
    ? parseFloat(stakingStats.pendingFormatted || "0")
    : 0;

  const totalAvailable = availablePlants.length + availableLands.length;

  const toggleId = (
    id: number,
    list: number[],
    setter: (v: number[]) => void,
  ) => {
    if (list.includes(id)) {
      setter(list.filter((x) => x !== id));
    } else {
      setter([...list, id]);
    }
  };

  // Buttons only depend on wallet + active tx now
  const stakeDisabled = !connected || actionLoading;
  const unstakeDisabled = !connected || actionLoading;
  const claimDisabled = !connected || actionLoading;

  return (
    <div className={styles.page}>
      <header className={styles.headerWrapper}>
        <div className={styles.brand}>
          <span className={styles.liveDot} />
          <span className={styles.brandText}>FCWEED</span>
        </div>

        <div className={styles.headerRight}>
          <button
            className={styles.iconButton}
            aria-label="Close"
            type="button"
          >
            ✕
          </button>
          <button
            className={styles.iconButton}
            aria-label="GitHub"
            type="button"
            onClick={() =>
              window.open("https://x.com/x420Ponzi", "_blank")
            }
          >
            ⧉
          </button>

          <div className={styles.walletWrapper}>
            <Wallet />
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.heroCard}>
          <div className={styles.heroMedia}>
            <Image
              priority
              src="/hero.png"
              alt="x420 Ponzi Plants"
              width={320}
              height={320}
              className={styles.heroImage}
            />
            <div className={styles.heroTags}>
              <span className={styles.tag}>ERC-721</span>
              <span className={styles.tag}>Base</span>
              <span className={styles.tag}>x402</span>
            </div>
          </div>

          <div className={styles.heroMain}>
            <h1 className={styles.title}>FCWEED Farming on Base</h1>
            <p className={styles.subtitle}>
              Stake-to-earn Farming — Powered by FCWEED on Base
              <br />
              Collect Land &amp; Plant NFTs, stake them to grow yields, and
              boost rewards with expansion.
              <br />
              Every Land NFT unlocks more Plant slots and increases your{" "}
              <span className={styles.highlight}>Land Boost</span> for higher
              payouts.
            </p>

            <div className={styles.ctaRow}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleMintLand}
                disabled={connecting}
              >
                Mint Land
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleMintPlant}
                disabled={connecting}
              >
                Mint Plant
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => setStakingOpen(true)}
              >
                Staking
              </button>
            </div>

            <div className={styles.ctaRowSecondary}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() =>
                  window.open(
                    "https://element.market/collections/x420-land-1?search[toggles][0]=ALL",
                    "_blank",
                  )
                }
              >
                Trade Land
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() =>
                  window.open(
                    "https://element.market/collections/x420-plants?search[toggles][0]=ALL",
                    "_blank",
                  )
                }
              >
                Trade Plant
              </button>
            </div>
          </div>
        </section>

        <section className={styles.infoCard}>
          <h2 className={styles.heading}>How it Works</h2>
          <ul className={styles.bulletList}>
            <li>Connect your wallet on Base to begin.</li>
            <li>Mint Plant Bud NFTs and stake them for yield.</li>
            <li>Mint Land NFTs (all Lands are equal rarity).</li>
            <li>Each Land allows you to stake <b>+3 extra Plant Buds</b>.</li>
            <li>
              Each Land grants a <b>+2.5% token boost</b> to all yield earned.
            </li>
            <li>
              The more Land you stack — the stronger your multiplier will be.
            </li>
          </ul>

          <h2 className={styles.heading}>Coming Soon</h2>
          <ul className={styles.bulletList}>
            <li>Plant NFT artwork reveal.</li>
            <li>Reward token + staking UI polish.</li>
            <li>
              Stake, compound, and climb up the Crime Ladder (KOTH leaderboard).
            </li>
          </ul>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>© 2025 FCWEED</span>
      </footer>

      {stakingOpen && (
        <div className={styles.modalBackdrop}>
          <div
            className={styles.modal}
            style={{
              maxWidth: "900px",
              width: "100%",
              maxHeight: "90vh",
              height: "90vh",
            }}
          >
            <header className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Grow Lab Statistics</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setStakingOpen(false)}
              >
                ✕
              </button>
            </header>

            <div className={styles.modalStatsGrid}>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Plants Staked</span>
                <span className={styles.statValue}>
                  {stakingStats ? stakingStats.plantsStaked : 0}
                </span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Lands Staked</span>
                <span className={styles.statValue}>
                  {stakingStats ? stakingStats.landsStaked : 0}
                </span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Capacity</span>
                <span className={styles.statValue}>
                  {stakingStats
                    ? `${stakingStats.capacityUsed}/${stakingStats.totalSlots}`
                    : "0/1"}
                </span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Land Boost</span>
                <span className={styles.statValue}>
                  {stakingStats
                    ? `+${stakingStats.landBoostPct.toFixed(1)}%`
                    : "+0.0%"}
                </span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Pending</span>
                <span className={styles.statValue}>
                  {pendingFloat > 0 ? pendingFloat.toFixed(2) : "0.00"}
                </span>
              </div>
            </div>

            <div
              className={styles.modalBody}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1.05fr) minmax(0,1.25fr)",
                gap: 16,
                height: "calc(100% - 130px)",
              }}
            >
              <div className={styles.nftColumn}>
                <div className={styles.nftHeader}>
                  <label className={styles.selectAllRow}>
                    <input
                      type="checkbox"
                      checked={
                        totalAvailable > 0 &&
                        selectedAvailPlants.length +
                          selectedAvailLands.length ===
                          totalAvailable
                      }
                      onChange={() => {
                        if (
                          selectedAvailPlants.length +
                            selectedAvailLands.length ===
                          totalAvailable
                        ) {
                          setSelectedAvailPlants([]);
                          setSelectedAvailLands([]);
                        } else {
                          setSelectedAvailPlants(availablePlants);
                          setSelectedAvailLands(availableLands);
                        }
                      }}
                    />
                    <span>Select all {totalAvailable} available</span>
                  </label>
                </div>

                <div
                  className={styles.nftScroll}
                  style={{ overflowY: "auto", paddingRight: 8 }}
                >
                  {totalAvailable === 0 ? (
                    <div className={styles.emptyState}>
                      <span>No unstaked NFTs for your wallet.</span>
                    </div>
                  ) : (
                    <>
                      {availableLands.map((id) => {
                        const img = landImages[id] || "/hero.png";
                        return (
                          <label key={`al-${id}`} className={styles.nftRow}>
                            <input
                              type="checkbox"
                              checked={selectedAvailLands.includes(id)}
                              onChange={() =>
                                toggleId(
                                  id,
                                  selectedAvailLands,
                                  setSelectedAvailLands,
                                )
                              }
                            />
                            <div className={styles.nftThumbWrap}>
                              <img
                                src={img}
                                alt={`Land #${id}`}
                                className={styles.nftThumb}
                                style={{
                                  width: 80,
                                  height: 80,
                                  borderRadius: 10,
                                  objectFit: "cover",
                                }}
                              />
                            </div>
                            <div className={styles.nftMeta}>
                              <div className={styles.nftName}>x420 Land</div>
                              <div className={styles.nftSub}>#{id}</div>
                            </div>
                          </label>
                        );
                      })}

                      {availablePlants.map((id) => {
                        const img = plantImages[id] || "/hero.png";
                        return (
                          <label key={`ap-${id}`} className={styles.nftRow}>
                            <input
                              type="checkbox"
                              checked={selectedAvailPlants.includes(id)}
                              onChange={() =>
                                toggleId(
                                  id,
                                  selectedAvailPlants,
                                  setSelectedAvailPlants,
                                )
                              }
                            />
                            <div className={styles.nftThumbWrap}>
                              <img
                                src={img}
                                alt={`Plant #${id}`}
                                className={styles.nftThumb}
                                style={{
                                  width: 80,
                                  height: 80,
                                  borderRadius: 10,
                                  objectFit: "cover",
                                }}
                              />
                            </div>
                            <div className={styles.nftMeta}>
                              <div className={styles.nftName}>x420 Plants</div>
                              <div className={styles.nftSub}>#{id}</div>
                            </div>
                          </label>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>

              <div className={styles.manageColumn}>
                <div className={styles.manageBox}>
                  <div className={styles.manageHeader}>
                    <span>
                      {selectedStakedPlants.length +
                        selectedStakedLands.length}{" "}
                      selected
                    </span>
                  </div>
                  <div
                    className={styles.nftScrollRight}
                    style={{ overflowY: "auto", paddingRight: 8 }}
                  >
                    {stakedPlants.length === 0 && stakedLands.length === 0 ? (
                      <div className={styles.emptyState}>
                        <span>No NFTs currently staked.</span>
                      </div>
                    ) : (
                      <>
                        {stakedLands.length > 0 && (
                          <>
                            <div className={styles.sectionTitle}>
                              Staked Lands {stakedLands.length}
                            </div>
                            {stakedLands.map((id) => {
                              const img = landImages[id] || "/hero.png";
                              return (
                                <label
                                  key={`sl-${id}`}
                                  className={styles.nftRow}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedStakedLands.includes(id)}
                                    onChange={() =>
                                      toggleId(
                                        id,
                                        selectedStakedLands,
                                        setSelectedStakedLands,
                                      )
                                    }
                                  />
                                  <div className={styles.nftThumbWrap}>
                                    <img
                                      src={img}
                                      alt={`Land #${id}`}
                                      className={styles.nftThumb}
                                      style={{
                                        width: 80,
                                        height: 80,
                                        borderRadius: 10,
                                        objectFit: "cover",
                                      }}
                                    />
                                  </div>
                                  <div className={styles.nftMeta}>
                                    <div className={styles.nftName}>
                                      x420 Land
                                    </div>
                                    <div className={styles.nftSub}>#{id}</div>
                                  </div>
                                </label>
                              );
                            })}
                          </>
                        )}

                        {stakedPlants.length > 0 && (
                          <>
                            <div className={styles.sectionTitle}>
                              Staked Plants {stakedPlants.length}
                            </div>
                            {stakedPlants.map((id) => {
                              const img = plantImages[id] || "/hero.png";
                              return (
                                <label
                                  key={`sp-${id}`}
                                  className={styles.nftRow}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedStakedPlants.includes(id)}
                                    onChange={() =>
                                      toggleId(
                                        id,
                                        selectedStakedPlants,
                                        setSelectedStakedPlants,
                                      )
                                    }
                                  />
                                  <div className={styles.nftThumbWrap}>
                                    <img
                                      src={img}
                                      alt={`Plant #${id}`}
                                      className={styles.nftThumb}
                                      style={{
                                        width: 80,
                                        height: 80,
                                        borderRadius: 10,
                                        objectFit: "cover",
                                      }}
                                    />
                                  </div>
                                  <div className={styles.nftMeta}>
                                    <div className={styles.nftName}>
                                      x420 Plants
                                    </div>
                                    <div className={styles.nftSub}>#{id}</div>
                                  </div>
                                </label>
                              );
                            })}
                          </>
                        )}
                      </>
                    )}
                  </div>
                  <div className={styles.manageFooter}>
                    <span>
                      Staked: {stakingStats ? stakingStats.plantsStaked : 0}
                    </span>
                    <span>Wallet: {shortAddr(userAddress)}</span>
                  </div>
                </div>

                <div className={styles.actionRow}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={stakeDisabled}
                    onClick={handleStakeSelected}
                    style={{
                      padding: "10px 26px",
                      fontSize: 14,
                      borderRadius: 999,
                      minWidth: 96,
                    }}
                  >
                    Stake
                  </button>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={unstakeDisabled}
                    onClick={handleUnstakeSelected}
                    style={{
                      padding: "10px 26px",
                      fontSize: 14,
                      borderRadius: 999,
                      minWidth: 96,
                    }}
                  >
                    Unstake
                  </button>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={claimDisabled}
                    onClick={handleClaim}
                    style={{
                      padding: "10px 26px",
                      fontSize: 14,
                      borderRadius: 999,
                      minWidth: 96,
                    }}
                  >
                    Claim
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
