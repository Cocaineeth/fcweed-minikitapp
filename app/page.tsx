"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { sdk } from "@farcaster/miniapp-sdk";
import { ethers } from "ethers";
import styles from "./page.module.css";

const CHAIN_ID = 8453;
const PUBLIC_BASE_RPC = "https://mainnet.base.org";

const PLANT_ADDRESS = "0xD84890240C2CBB66a825915cD20aEe89C6b66dD5";
const LAND_ADDRESS = "0x798A8F4b4799CfaBe859C85889c78e42a57d71c1";
const STAKING_ADDRESS = "0x9dA6B01BFcbf5ab256B7B1d46F316e946da85507";
const TOKEN_SYMBOL = "FCWEED";

const PLANT_FALLBACK_IMG = "/hero.png";
const LAND_FALLBACK_IMG = "/land.png";

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

const LAND_ABI = ["function mint()"];
const PLANT_ABI = ["function mint()"];

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

type CrimeRow = {
  address: string;
  plants: number;
  lands: number;
  capacityUsed: number;
  totalSlots: number;
  landBoostPct: number;
  dailyRateFormatted: string;
};

const PLAYLIST = [
  {
    title: "Kendrick Lamar - Untitled 05 (LoVibe Remix)",
    src: "/audio/track1.mp3",
  },
  { title: "Travis Scott - SDP Interlude", src: "/audio/track2.mp3" },
  { title: "Yeat - if we being real", src: "/audio/track3.mp3" },
];

const GIFS = [
  "/fcweed-radio.gif",
  "/fcweed-radio-2.gif",
  "/fcweed-radio-3.gif",
  "/fcweed-radio-4.gif",
];

async function waitForTx(
  tx: ethers.providers.TransactionResponse | undefined | null
) {
  if (!tx) return;
  try {
    await tx.wait();
  } catch (e: any) {
    const msg =
      e?.reason ||
      e?.error?.message ||
      e?.data?.message ||
      e?.message ||
      "";
    if (
      msg.includes("does not support the requested method") ||
      msg.includes("unsupported method")
    ) {
      console.warn("Ignoring provider wait() error:", e);
    } else {
      throw e;
    }
  }
}

export default function Home() {
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();

  const [provider, setProvider] =
    useState<ethers.providers.Web3Provider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [usingMiniApp, setUsingMiniApp] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [miniAppEthProvider, setMiniAppEthProvider] = useState<any | null>(
    null
  );

  const [readProvider] = useState(
    () => new ethers.providers.JsonRpcProvider(PUBLIC_BASE_RPC)
  );

  const [stakingOpen, setStakingOpen] = useState(false);
  const [stakingStats, setStakingStats] = useState<StakingStats | null>(null);
  const [availablePlants, setAvailablePlants] = useState<number[]>([]);
  const [availableLands, setAvailableLands] = useState<number[]>([]);
  const [stakedPlants, setStakedPlants] = useState<number[]>([]);
  const [stakedLands, setStakedLands] = useState<number[]>([]);
  const [loadingStaking, setLoadingStaking] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);
  const [landStakingEnabled, setLandStakingEnabled] = useState(false);

  const [selectedAvailPlants, setSelectedAvailPlants] = useState<number[]>([]);
  const [selectedAvailLands, setSelectedAvailLands] = useState<number[]>([]);
  const [selectedStakedPlants, setSelectedStakedPlants] =
    useState<number[]>([]);
  const [selectedStakedLands, setSelectedStakedLands] = useState<number[]>([]);

  const [plantImages, setPlantImages] = useState<Record<number, string>>({});
  const [landImages, setLandImages] = useState<Record<number, string>>({});

  const [mintStatus, setMintStatus] = useState<string>("");

  const [currentTrack, setCurrentTrack] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [gifIndex, setGifIndex] = useState(0);

  const [crimeRows, setCrimeRows] = useState<CrimeRow[]>([]);
  const [crimeLoading, setCrimeLoading] = useState(false);

  const currentTrackMeta = PLAYLIST[currentTrack];

  useEffect(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current
        .play()
        .catch((err) => {
          console.warn("Autoplay blocked by browser", err);
          setIsPlaying(false);
        });
    } else if (!audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, [isPlaying, currentTrack]);

  useEffect(() => {
    const id = setInterval(() => {
      setGifIndex((prev) => (prev + 1) % GIFS.length);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const handlePlayPause = () => setIsPlaying((prev) => !prev);
  const handleNextTrack = () =>
    setCurrentTrack((prev) => (prev + 1) % PLAYLIST.length);
  const handlePrevTrack = () =>
    setCurrentTrack((prev) => (prev - 1 + PLAYLIST.length) % PLAYLIST.length);

  useEffect(() => {
    if (!isMiniAppReady) {
      setMiniAppReady();
    }
    (async () => {
      try {
        await sdk.actions.ready();
      } catch {
      }
    })();
  }, [isMiniAppReady, setMiniAppReady]);

  const shortAddr = (addr?: string | null) =>
    addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "Connect Wallet";

  async function ensureWallet() {
    if (signer && provider && userAddress) {
      return { signer, provider, userAddress };
    }

    try {
      setConnecting(true);

      let p: ethers.providers.Web3Provider;
      let s: ethers.Signer;
      let addr: string;
      let isMini = false;
      let ethProv: any | null = null;

      try {
        ethProv = await sdk.wallet.getEthereumProvider();
        if (ethProv) {
          isMini = true;
        }
      } catch {
        isMini = false;
      }

      if (isMini && ethProv) {
        setUsingMiniApp(true);
        setMiniAppEthProvider(ethProv);

        p = new ethers.providers.Web3Provider(ethProv as any, "any");

        let fcAddr: string | undefined;
        try {
          fcAddr = (await (sdk as any).wallet.getAddress?.()) as
            | string
            | undefined;
        } catch {
          fcAddr = undefined;
        }

        if (fcAddr) {
          addr = fcAddr;
          s = p.getSigner(fcAddr);
        } else {
          s = p.getSigner();
          addr = await s.getAddress();
        }
      } else {
        setUsingMiniApp(false);
        const anyWindow = window as any;
        if (!anyWindow.ethereum) {
          setMintStatus(
            "No wallet found. Open this in the Farcaster app or install a browser wallet."
          );
          setConnecting(false);
          return null;
        }
        await anyWindow.ethereum.request({ method: "eth_requestAccounts" });
        p = new ethers.providers.Web3Provider(anyWindow.ethereum, "any");
        s = p.getSigner();
        addr = await s.getAddress();
      }

      const net = await p.getNetwork();
      if (net.chainId !== CHAIN_ID) {
        if (isMini) {
          setMintStatus("Please switch your Farcaster wallet to Base to mint.");
        } else {
          const anyWindow = window as any;
          if (anyWindow.ethereum?.request) {
            try {
              await anyWindow.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: "0x2105" }],
              });
            } catch {
            }
          }
        }
      }

      setProvider(p);
      setSigner(s);
      setUserAddress(addr);
      setConnecting(false);

      return { signer: s, provider: p, userAddress: addr };
    } catch (err) {
      console.error("Wallet connect failed:", err);
      if (usingMiniApp) {
        setMintStatus(
          "Could not connect Farcaster wallet. Make sure the mini app has wallet permissions."
        );
      } else {
        setMintStatus("Wallet connect failed. Check your wallet and try again.");
      }
      setConnecting(false);
      return null;
    }
  }

  async function ensureUsdcAllowance(
    spender: string,
    required: ethers.BigNumber
  ): Promise<boolean> {
    const ctx = await ensureWallet();
    if (!ctx) return false;

    const { signer: s, userAddress: addr } = ctx;

    setMintStatus("Checking USDC contract on Base…");
    const code = await readProvider.getCode(USDC_ADDRESS);
    if (code === "0x") {
      setMintStatus(
        "USDC token not found on this network. Please make sure you are on Base mainnet."
      );
      return false;
    }

    const usdcRead = new ethers.Contract(USDC_ADDRESS, USDC_ABI, readProvider);
    const usdcWrite = new ethers.Contract(USDC_ADDRESS, USDC_ABI, s);

    try {
      const bal = await usdcRead.balanceOf(addr);
      if (bal.lt(required)) {
        setMintStatus(
          `You need at least ${ethers.utils.formatUnits(
            required,
            USDC_DECIMALS
          )} USDC on Base to mint.`
        );
        return false;
      }
    } catch (e) {
      console.warn("USDC balanceOf failed (continuing):", e);
    }

    let current = ethers.constants.Zero;
    try {
      current = await usdcRead.allowance(addr, spender);
    } catch (e: any) {
      console.warn("USDC allowance() read failed, treating as 0:", e);
      current = ethers.constants.Zero;
    }

    if (current.gte(required)) {
      return true;
    }

    setMintStatus("Requesting USDC approve transaction in your wallet…");

    try {
      const tx = await usdcWrite.approve(spender, required);
      await waitForTx(tx);
      setMintStatus("USDC approve confirmed. Sending mint transaction…");
      return true;
    } catch (err) {
      console.error("USDC approve failed:", err);
      const msg =
        (err as any)?.reason ||
        (err as any)?.error?.message ||
        (err as any)?.data?.message ||
        (err as any)?.message ||
        "USDC approve failed";
      setMintStatus(msg);
      return false;
    }
  }

  async function handleMintLand() {
    try {
      setMintStatus("Preparing to mint 1 Land (199.99 USDC + gas)…");
      const ctx = await ensureWallet();
      if (!ctx) return;

      const okAllowance = await ensureUsdcAllowance(
        LAND_ADDRESS,
        LAND_PRICE_USDC
      );
      if (!okAllowance) return;

      const land = new ethers.Contract(LAND_ADDRESS, LAND_ABI, ctx.signer);
      const tx = await land.mint();
      setMintStatus("Land mint transaction sent. Waiting for confirmation…");
      await waitForTx(tx);
      setMintStatus(
        "Land mint submitted ✅ Check your wallet / explorer for confirmation."
      );
    } catch (err: any) {
      console.error("Mint Land error:", err);
      const msg =
        err?.reason ||
        err?.error?.message ||
        err?.data?.message ||
        err?.message ||
        "Mint Land failed";
      if (
        msg.includes("does not support the requested method") ||
        msg.includes("unsupported method")
      ) {
        setMintStatus(
          "Land mint submitted ✅ Check your wallet / explorer for confirmation."
        );
      } else {
        setMintStatus(`Land mint failed: ${msg}`);
      }
    }
  }

  async function handleMintPlant() {
    try {
      setMintStatus("Preparing to mint 1 Plant (49.99 USDC + gas)…");
      const ctx = await ensureWallet();
      if (!ctx) return;

      const okAllowance = await ensureUsdcAllowance(
        PLANT_ADDRESS,
        PLANT_PRICE_USDC
      );
      if (!okAllowance) return;

      const plant = new ethers.Contract(PLANT_ADDRESS, PLANT_ABI, ctx.signer);
      const tx = await plant.mint();
      setMintStatus("Plant mint transaction sent. Waiting for confirmation…");
      await waitForTx(tx);
      setMintStatus(
        "Plant mint submitted ✅ Check your wallet / explorer for confirmation."
      );
    } catch (err: any) {
      console.error("Mint Plant error:", err);
      const msg =
        err?.reason ||
        err?.error?.message ||
        err?.data?.message ||
        err?.message ||
        "Mint Plant failed";
      if (
        msg.includes("does not support the requested method") ||
        msg.includes("unsupported method")
      ) {
        setMintStatus(
          "Plant mint submitted ✅ Check your wallet / explorer for confirmation."
        );
      } else {
        setMintStatus(`Plant mint failed: ${msg}`);
      }
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
    owner: string
  ): Promise<number[]> {
    try {
      const nft = new ethers.Contract(nftAddress, ERC721_VIEW_ABI, readProvider);
      const balBn: ethers.BigNumber = await nft.balanceOf(owner);
      const bal = balBn.toNumber();
      if (bal === 0) return [];
      let maxId = 2000;
      try {
        const totalBn: ethers.BigNumber = await nft.totalSupply();
        const total = totalBn.toNumber();
        maxId = Math.min(total + 5, 2000);
      } catch {
      }

      const ids: number[] = [];
      const ownerLower = owner.toLowerCase();

      for (let tokenId = 0; tokenId <= maxId && ids.length < bal; tokenId++) {
        try {
          const who: string = await nft.ownerOf(tokenId);
          if (who.toLowerCase() === ownerLower) {
            ids.push(tokenId);
          }
        } catch {
        }
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
    prov: ethers.providers.Provider
  ): Promise<Record<number, string>> {
    const out: Record<number, string> = {};
    if (ids.length === 0) return out;

    const isLand = nftAddress.toLowerCase() === LAND_ADDRESS.toLowerCase();
    const isPlant = nftAddress.toLowerCase() === PLANT_ADDRESS.toLowerCase();

    try {
      const nft = new ethers.Contract(nftAddress, ERC721_VIEW_ABI, prov);

      for (const id of ids) {
        try {
          let img: string | undefined;

          try {
            const uri: string = await nft.tokenURI(id);
            const url = toHttpFromMaybeIpfs(uri);
            const res = await fetch(url);
            if (res.ok) {
              const meta = await res.json();
              img = meta.image ? toHttpFromMaybeIpfs(meta.image) : undefined;
            }
          } catch {
          }

          if (!img) {
            if (isLand) img = LAND_FALLBACK_IMG;
            else if (isPlant) img = PLANT_FALLBACK_IMG;
          }

          if (img) {
            out[id] = img;
          }
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

    const { userAddress: addr } = ctx;

    const staking = new ethers.Contract(
      STAKING_ADDRESS,
      STAKING_ABI,
      readProvider
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

      const plantOwned = await loadOwnedTokens(PLANT_ADDRESS, addr);
      const landOwned = await loadOwnedTokens(LAND_ADDRESS, addr);

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

      const allPlantIds = Array.from(
        new Set([...plantOwned, ...stakedPlantNums])
      );
      const allLandIds = Array.from(
        new Set([...landOwned, ...stakedLandNums])
      );

      const [plantImgs, landImgs] = await Promise.all([
        fetchNftImages(PLANT_ADDRESS, allPlantIds, readProvider),
        fetchNftImages(LAND_ADDRESS, allLandIds, readProvider),
      ]);

      setPlantImages(plantImgs);
      setLandImages(landImgs);
    } catch (err) {
      console.error("Failed to load staking state:", err);
    } finally {
      setLoadingStaking(false);
    }
  }

  async function refreshCrimeLadder() {
    setCrimeLoading(true);
    try {
      const staking = new ethers.Contract(
        STAKING_ADDRESS,
        STAKING_ABI,
        readProvider
      );
      const plantNft = new ethers.Contract(
        PLANT_ADDRESS,
        ERC721_VIEW_ABI,
        readProvider
      );
      const landNft = new ethers.Contract(
        LAND_ADDRESS,
        ERC721_VIEW_ABI,
        readProvider
      );

      let plantSupply = 0;
      let landSupply = 0;
      try {
        plantSupply = (await plantNft.totalSupply()).toNumber();
      } catch {}
      try {
        landSupply = (await landNft.totalSupply()).toNumber();
      } catch {}

      const maxPlantId = Math.min(plantSupply || 0, 400);
      const maxLandId = Math.min(landSupply || 0, 400);

      const ownersSet = new Set<string>();

      for (let i = 0; i <= maxPlantId; i++) {
        try {
          const o: string = await plantNft.ownerOf(i);
          ownersSet.add(o.toLowerCase());
        } catch {}
      }

      for (let i = 0; i <= maxLandId; i++) {
        try {
          const o: string = await landNft.ownerOf(i);
          ownersSet.add(o.toLowerCase());
        } catch {}
      }

      const owners = Array.from(ownersSet);
      if (owners.length === 0) {
        setCrimeRows([]);
        setCrimeLoading(false);
        return;
      }

      const [tokensPerPlantPerDay, landBps] = await Promise.all([
        staking.tokensPerPlantPerDay(),
        staking.landBoostBps(),
      ]);

      const rowsWithDaily: {
        row: CrimeRow;
        dailyBN: ethers.BigNumber;
      }[] = [];

      for (const addrLower of owners) {
        try {
          const user = await staking.users(addrLower);
          const plantsStaked = Number(user.plants);
          const landsStaked = Number(user.lands);
          if (!plantsStaked && !landsStaked) continue;

          const plantsBN = ethers.BigNumber.from(plantsStaked);
          const landsBN = ethers.BigNumber.from(landsStaked);

          const baseDaily = tokensPerPlantPerDay.mul(plantsBN);
          const boostBps = landBps.mul(landsBN); // 250 bps per land
          const multiplierBps = ethers.BigNumber.from(10000).add(boostBps);
          const dailyBN = baseDaily.mul(multiplierBps).div(10000);

          const totalSlots = 1 + landsStaked * 3;
          const capacityUsed = plantsStaked;
          const landBoostPct =
            boostBps.toNumber() / 100; // 250 bps = 2.5%

          const dailyRateFormatted = ethers.utils.formatUnits(dailyBN, 18);

          rowsWithDaily.push({
            row: {
              address: addrLower,
              plants: plantsStaked,
              lands: landsStaked,
              capacityUsed,
              totalSlots,
              landBoostPct,
              dailyRateFormatted,
            },
            dailyBN,
          });
        } catch {
        }
      }

      rowsWithDaily.sort((a, b) => {
        if (a.dailyBN.eq(b.dailyBN)) return 0;
        return a.dailyBN.lt(b.dailyBN) ? 1 : -1;
      });

      setCrimeRows(rowsWithDaily.slice(0, 10).map((x) => x.row));
    } catch (e) {
      console.error("Crime ladder load failed:", e);
      setCrimeRows([]);
    } finally {
      setCrimeLoading(false);
    }
  }

  useEffect(() => {
    void refreshCrimeLadder();
  }, []);

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
      userAddress: string;
    }
  ) {
    const nft = new ethers.Contract(
      collectionAddress,
      ERC721_VIEW_ABI,
      ctx.signer
    );
    const approved: boolean = await nft.isApprovedForAll(
      ctx.userAddress,
      STAKING_ADDRESS
    );
    if (!approved) {
      const tx = await nft.setApprovalForAll(STAKING_ADDRESS, true);
      await waitForTx(tx);
    }
  }

  async function handleStakeSelected() {
    const ctx = await ensureWallet();
    if (!ctx) return;

    const toStakePlants = selectedAvailPlants;
    const toStakeLands = selectedAvailLands;

    if (toStakePlants.length === 0 && toStakeLands.length === 0) {
      setMintStatus("No NFTs selected to stake.");
      return;
    }

    const staking = new ethers.Contract(
      STAKING_ADDRESS,
      STAKING_ABI,
      ctx.signer
    );

    try {
      setActionLoading(true);

      if (toStakePlants.length > 0) {
        await ensureCollectionApproval(PLANT_ADDRESS, ctx);
        const tx = await staking.stakePlants(
          toStakePlants.map((id) => ethers.BigNumber.from(id))
        );
        await waitForTx(tx);
      }

      if (toStakeLands.length > 0 && landStakingEnabled) {
        await ensureCollectionApproval(LAND_ADDRESS, ctx);
        const tx2 = await staking.stakeLands(
          toStakeLands.map((id) => ethers.BigNumber.from(id))
        );
        await waitForTx(tx2);
      }

      setSelectedAvailPlants([]);
      setSelectedAvailLands([]);
      await refreshStaking();
      await refreshCrimeLadder();
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
      setMintStatus("No NFTs selected to unstake.");
      return;
    }

    const staking = new ethers.Contract(
      STAKING_ADDRESS,
      STAKING_ABI,
      ctx.signer
    );

    try {
      setActionLoading(true);

      if (toUnstakePlants.length > 0) {
        const tx = await staking.unstakePlants(
          toUnstakePlants.map((id) => ethers.BigNumber.from(id))
        );
        await waitForTx(tx);
      }

      if (toUnstakeLands.length > 0) {
        const tx2 = await staking.unstakeLands(
          toUnstakeLands.map((id) => ethers.BigNumber.from(id))
        );
        await waitForTx(tx2);
      }

      setSelectedStakedPlants([]);
      setSelectedStakedLands([]);
      await refreshStaking();
      await refreshCrimeLadder();
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
      ctx.signer
    );

    const pendingAmount =
      stakingStats && stakingStats.pendingFormatted
        ? parseFloat(stakingStats.pendingFormatted)
        : 0;

    if (!pendingAmount || pendingAmount <= 0) {
      setMintStatus("No pending rewards to claim yet.");
      return;
    }

    try {
      setActionLoading(true);
      const tx = await staking.claim();
      await waitForTx(tx);
      await refreshStaking();
      await refreshCrimeLadder();
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

  const pendingDisplay =
    pendingFloat > 0
      ? pendingFloat >= 1_000_000
        ? `${(pendingFloat / 1_000_000).toFixed(2)}M`
        : pendingFloat.toFixed(2)
      : "0.00";

  const totalAvailable = availablePlants.length + availableLands.length;

  const toggleId = (
    id: number,
    list: number[],
    setter: (v: number[]) => void
  ) => {
    if (list.includes(id)) {
      setter(list.filter((x) => x !== id));
    } else {
      setter([...list, id]);
    }
  };

  const stakeDisabled = !connected || actionLoading;
  const unstakeDisabled = !connected || actionLoading;
  const claimDisabled = !connected || actionLoading;

  return (
    <div
      className={styles.page}
      onPointerDown={() => {
        if (!isPlaying && audioRef.current) {
          audioRef.current
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => {});
        }
      }}
    >
      <header className={styles.headerWrapper}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <div className={styles.brand}>
            <span className={styles.liveDot} />
            <span className={styles.brandText}>FCWEED</span>
          </div>

          <button
            type="button"
            disabled={connecting}
            onClick={() => {
              void ensureWallet();
            }}
            className={styles.walletButton}
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.25)",
              background: connected
                ? "rgba(0, 200, 130, 0.18)"
                : "rgba(39, 95, 255, 0.55)",
              fontSize: 12,
              fontWeight: 500,
              color: "#fff",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {shortAddr(userAddress)}
          </button>
        </div>

        <div className={styles.headerRight}>
          <button
            className={styles.iconButton}
            aria-label="Twitter"
            type="button"
            onClick={() =>
              window.open("https://x.com/x420Ponzi", "_blank")
            }
          >
            𝕏
          </button>

          <div className={styles.radioPill}>
            <span className={styles.radioLabel}>Farcaster Radio</span>

            <div className={styles.radioTitleWrap}>
              <span className={styles.radioTitleInner}>
                {currentTrackMeta.title}
              </span>
            </div>

            <button
              type="button"
              className={styles.iconButtonSmall}
              onClick={handlePrevTrack}
              aria-label="Previous track"
            >
              ‹
            </button>
            <button
              type="button"
              className={styles.iconButtonSmall}
              onClick={handlePlayPause}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? "❚❚" : "▶"}
            </button>
            <button
              type="button"
              className={styles.iconButtonSmall}
              onClick={handleNextTrack}
              aria-label="Next track"
            >
              ›
            </button>
          </div>

          <audio
            ref={audioRef}
            src={currentTrackMeta.src}
            onEnded={handleNextTrack}
            autoPlay
            style={{ display: "none" }}
          />
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

            {mintStatus && (
              <p
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  opacity: 0.9,
                  maxWidth: 420,
                }}
              >
                {mintStatus}
              </p>
            )}

            <div className={styles.ctaRowSecondary}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() =>
                  window.open(
                    "https://element.market/collections/x420-land-1?search[toggles][0]=ALL",
                    "_blank"
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
                    "_blank"
                  )
                }
              >
                Trade Plant
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() =>
                  window.open(
                    "https://dexscreener.com/base",
                    "_blank"
                  )
                }
              >
                Trade ${TOKEN_SYMBOL}
              </button>
            </div>
          </div>
        </section>

        <section
          style={{
            margin: "18px 0",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Image
            src={GIFS[gifIndex]}
            alt="FCWEED Radio Vibes"
            width={320}
            height={120}
            style={{
              borderRadius: 16,
              objectFit: "cover",
            }}
          />
        </section>

        <section className={styles.infoCard}>
          <h2 className={styles.heading}>How it Works</h2>
          <ul className={styles.bulletList}>
            <li>Connect your wallet on Base to begin.</li>
            <li>Mint Plant Bud NFTs and stake them for yield.</li>
            <li>Mint Land NFTs (all Lands are equal rarity).</li>
            <li>
              Each Land allows you to stake <b>+3 extra Plant Buds</b>.
            </li>
            <li>
              Each Land grants a <b>+2.5% token boost</b> to all yield earned.
            </li>
            <li>
              The more Land you stack — the stronger your multiplier will be.
            </li>
          </ul>

          <h2 className={styles.heading}>Use of Funds</h2>
          <ul className={styles.bulletList}>
            <li>
              <b>50% of all mint funds</b> are routed to periodic{" "}
              <b>buyback and burns</b> of ${TOKEN_SYMBOL}.
            </li>
            <li>
              ${TOKEN_SYMBOL} has a <b>3% buy &amp; sell tax</b>:
              <ul style={{ marginTop: 6, marginLeft: 18 }}>
                <li>
                  <b>2%</b> goes directly into automated{" "}
                  <b>buyback &amp; burn</b>.
                </li>
                <li>
                  <b>1%</b> is set aside for <b>top farmer rewards</b> in ETH,
                  paid out based on the Crime Ladder leaderboard.
                </li>
              </ul>
            </li>
            <li>
              The more you farm and climb the ladder, the larger your share of
              ETH rewards from the tax pool.
            </li>
          </ul>
        </section>

        <section className={styles.infoCard}>
          <h2 className={styles.heading}>Crime Ladder — Top Farmers</h2>
          {crimeLoading && crimeRows.length === 0 && (
            <p style={{ fontSize: 13, opacity: 0.8 }}>Loading Crime Ladder…</p>
          )}
          {!crimeLoading && crimeRows.length === 0 && (
            <p style={{ fontSize: 13, opacity: 0.8 }}>
              No farmers yet. Stake Plants + Land to appear on the Crime Ladder.
            </p>
          )}
          {crimeRows.length > 0 && (
            <div
              style={{
                marginTop: 10,
                overflowX: "auto",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>
                      Rank
                    </th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>
                      Farmer
                    </th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>
                      Plants
                    </th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>
                      Lands
                    </th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>
                      Land Boost
                    </th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>
                      Capacity
                    </th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>
                      Daily Rate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {crimeRows.map((row, idx) => (
                    <tr
                      key={row.address + idx}
                      style={{
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <td style={{ padding: "6px 8px" }}>{idx + 1}</td>
                      <td style={{ padding: "6px 8px" }}>
                        {shortAddr(row.address)}
                      </td>
                      <td
                        style={{ padding: "6px 8px", textAlign: "right" }}
                      >
                        {row.plants}
                      </td>
                      <td
                        style={{ padding: "6px 8px", textAlign: "right" }}
                      >
                        {row.lands}
                      </td>
                      <td
                        style={{ padding: "6px 8px", textAlign: "right" }}
                      >
                        +{row.landBoostPct.toFixed(1)}%
                      </td>
                      <td
                        style={{ padding: "6px 8px", textAlign: "right" }}
                      >
                        {row.capacityUsed}/{row.totalSlots}
                      </td>
                      <td
                        style={{ padding: "6px 8px", textAlign: "right" }}
                      >
                        {Number(row.dailyRateFormatted).toFixed(2)}{" "}
                        {TOKEN_SYMBOL}/day
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
              height: "90vh",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
            }}
          >
            <header className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Grow Lab Statistics</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className={styles.modalClose}
                  onClick={refreshStaking}
                  disabled={loadingStaking}
                >
                  ⟳
                </button>
                <button
                  type="button"
                  className={styles.modalClose}
                  onClick={() => setStakingOpen(false)}
                >
                  ✕
                </button>
              </div>
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
                <span
                  className={styles.statValue}
                  style={{ fontSize: 13, wordBreak: "break-all" }}
                >
                  {pendingDisplay}
                </span>
              </div>
            </div>

            <div
              className={styles.modalBody}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                marginTop: 8,
                paddingBottom: 8,
                flex: 1,
              }}
            >
              <div>
                <div
                  className={styles.nftHeader}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span>Available NFTs ({totalAvailable})</span>
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
                    <span style={{ marginLeft: 6 }}>Select all</span>
                  </label>
                </div>

                <div
                  style={{
                    display: "flex",
                    overflowX: "auto",
                    gap: 10,
                    padding: "4px 2px 6px",
                  }}
                >
                  {totalAvailable === 0 ? (
                    <div className={styles.emptyState}>
                      <span>No unstaked NFTs for your wallet.</span>
                    </div>
                  ) : (
                    <>
                      {availableLands.map((id) => {
                        const img = landImages[id] || "/land.png";
                        return (
                          <label
                            key={`al-${id}`}
                            className={styles.nftRow}
                            style={{
                              minWidth: 170,
                              flexShrink: 0,
                              flexDirection: "column",
                              alignItems: "flex-start",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedAvailLands.includes(id)}
                              onChange={() =>
                                toggleId(
                                  id,
                                  selectedAvailLands,
                                  setSelectedAvailLands
                                )
                              }
                              style={{ marginBottom: 4 }}
                            />
                            <div
                              className={styles.nftThumbWrap}
                              style={{
                                padding: 4,
                                borderRadius: 14,
                                border:
                                  "1px solid rgba(255,255,255,0.18)",
                                background: "#050814",
                              }}
                            >
                              <img
                                src={img}
                                alt={`Land #${id}`}
                                className={styles.nftThumb}
                                style={{
                                  width: 120,
                                  height: 120,
                                  borderRadius: 10,
                                  objectFit: "contain",
                                }}
                              />
                            </div>
                            <div
                              className={styles.nftMeta}
                              style={{ marginTop: 6 }}
                            >
                              <div
                                className={styles.nftName}
                                style={{ fontSize: 13, fontWeight: 600 }}
                              >
                                x420 Land
                              </div>
                              <div
                                className={styles.nftSub}
                                style={{ fontSize: 11, opacity: 0.75 }}
                              >
                                #{id}
                              </div>
                            </div>
                          </label>
                        );
                      })}

                      {availablePlants.map((id) => {
                        const img = plantImages[id] || "/hero.png";
                        return (
                          <label
                            key={`ap-${id}`}
                            className={styles.nftRow}
                            style={{
                              minWidth: 170,
                              flexShrink: 0,
                              flexDirection: "column",
                              alignItems: "flex-start",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedAvailPlants.includes(id)}
                              onChange={() =>
                                toggleId(
                                  id,
                                  selectedAvailPlants,
                                  setSelectedAvailPlants
                                )
                              }
                              style={{ marginBottom: 4 }}
                            />
                            <div
                              className={styles.nftThumbWrap}
                              style={{
                                padding: 4,
                                borderRadius: 14,
                                border:
                                  "1px solid rgba(255,255,255,0.18)",
                                background: "#050814",
                              }}
                            >
                              <img
                                src={img}
                                alt={`Plant #${id}`}
                                className={styles.nftThumb}
                                style={{
                                  width: 120,
                                  height: 120,
                                  borderRadius: 10,
                                  objectFit: "contain",
                                }}
                              />
                            </div>
                            <div
                              className={styles.nftMeta}
                              style={{ marginTop: 6 }}
                            >
                              <div
                                className={styles.nftName}
                                style={{ fontSize: 13, fontWeight: 600 }}
                              >
                                x420 Plants
                              </div>
                              <div
                                className={styles.nftSub}
                                style={{ fontSize: 11, opacity: 0.75 }}
                              >
                                #{id}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>

              <div style={{ flex: 1 }}>
                <div
                  className={styles.nftHeader}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span>
                    Staked NFTs{" "}
                    {stakedPlants.length + stakedLands.length > 0
                      ? `(${stakedPlants.length + stakedLands.length})`
                      : ""}
                  </span>
                  <span style={{ fontSize: 12 }}>
                    Selected:{" "}
                    {selectedStakedPlants.length +
                      selectedStakedLands.length}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    overflowX: "auto",
                    gap: 10,
                    padding: "4px 2px 6px",
                  }}
                >
                  {stakedPlants.length === 0 && stakedLands.length === 0 ? (
                    <div className={styles.emptyState}>
                      <span>No NFTs currently staked.</span>
                    </div>
                  ) : (
                    <>
                      {stakedLands.map((id) => {
                        const img = landImages[id] || "/land.png";
                        return (
                          <label
                            key={`sl-${id}`}
                            className={styles.nftRow}
                            style={{
                              minWidth: 170,
                              flexShrink: 0,
                              flexDirection: "column",
                              alignItems: "flex-start",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedStakedLands.includes(id)}
                              onChange={() =>
                                toggleId(
                                  id,
                                  selectedStakedLands,
                                  setSelectedStakedLands
                                )
                              }
                              style={{ marginBottom: 4 }}
                            />
                            <div
                              className={styles.nftThumbWrap}
                              style={{
                                padding: 4,
                                borderRadius: 14,
                                border:
                                  "1px solid rgba(255,255,255,0.18)",
                                background: "#050814",
                              }}
                            >
                              <img
                                src={img}
                                alt={`Land #${id}`}
                                className={styles.nftThumb}
                                style={{
                                  width: 120,
                                  height: 120,
                                  borderRadius: 10,
                                  objectFit: "contain",
                                }}
                              />
                            </div>
                            <div
                              className={styles.nftMeta}
                              style={{ marginTop: 6 }}
                            >
                              <div
                                className={styles.nftName}
                                style={{ fontSize: 13, fontWeight: 600 }}
                              >
                                x420 Land
                              </div>
                              <div
                                className={styles.nftSub}
                                style={{ fontSize: 11, opacity: 0.75 }}
                              >
                                #{id}
                              </div>
                            </div>
                          </label>
                        );
                      })}

                      {stakedPlants.map((id) => {
                        const img = plantImages[id] || "/hero.png";
                        return (
                          <label
                            key={`sp-${id}`}
                            className={styles.nftRow}
                            style={{
                              minWidth: 170,
                              flexShrink: 0,
                              flexDirection: "column",
                              alignItems: "flex-start",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedStakedPlants.includes(id)}
                              onChange={() =>
                                toggleId(
                                  id,
                                  selectedStakedPlants,
                                  setSelectedStakedPlants
                                )
                              }
                              style={{ marginBottom: 4 }}
                            />
                            <div
                              className={styles.nftThumbWrap}
                              style={{
                                padding: 4,
                                borderRadius: 14,
                                border:
                                  "1px solid rgba(255,255,255,0.18)",
                                background: "#050814",
                              }}
                            >
                              <img
                                src={img}
                                alt={`Plant #${id}`}
                                className={styles.nftThumb}
                                style={{
                                  width: 120,
                                  height: 120,
                                  borderRadius: 10,
                                  objectFit: "contain",
                                }}
                              />
                            </div>
                            <div
                              className={styles.nftMeta}
                              style={{ marginTop: 6 }}
                            >
                              <div
                                className={styles.nftName}
                                style={{ fontSize: 13, fontWeight: 600 }}
                              >
                                x420 Plants
                              </div>
                              <div
                                className={styles.nftSub}
                                style={{ fontSize: 11, opacity: 0.75 }}
                              >
                                #{id}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>

              <div
                className={styles.actionRow}
                style={{
                  marginTop: "auto",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={stakeDisabled}
                  onClick={handleStakeSelected}
                  style={{
                    padding: "10px 22px",
                    fontSize: 14,
                    borderRadius: 999,
                    minWidth: 88,
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
                    padding: "10px 22px",
                    fontSize: 14,
                    borderRadius: 999,
                    minWidth: 88,
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
                    padding: "10px 22px",
                    fontSize: 14,
                    borderRadius: 999,
                    minWidth: 88,
                  }}
                >
                  Claim
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
