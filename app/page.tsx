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
  "function plantStakerOf(uint256) view returns (address)",
  "function landStakerOf(uint256) view returns (address)",
];

const landInterface = new ethers.utils.Interface(LAND_ABI);
const plantInterface = new ethers.utils.Interface(PLANT_ABI);
const stakingInterface = new ethers.utils.Interface(STAKING_ABI);

type StakingStats = {
  plantsStaked: number;
  landsStaked: number;
  totalSlots: number;
  capacityUsed: number;
  landBoostPct: number;
  pendingFormatted: string;
  claimEnabled: boolean;
};

type FarmerRow = {
  addr: string;
  plants: number;
  lands: number;
  boostPct: number;
  capacity: string;
  daily: string;
  dailyRaw: number;
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

  const [mintStatus, setMintStatus] = useState<string>("");

  const [currentTrack, setCurrentTrack] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [gifIndex, setGifIndex] = useState(0);

  const [ladderRows, setLadderRows] = useState<FarmerRow[]>([]);
  const [ladderLoading, setLadderLoading] = useState(false);

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
        //
      }
    })();
  }, [isMiniAppReady, setMiniAppReady]);

  const shortAddr = (addr?: string | null) =>
    addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "Connect Wallet";

  async function ensureWallet() {
    if (signer && provider && userAddress) {
      return { signer, provider, userAddress, isMini: usingMiniApp };
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
              //
            }
          }
        }
      }

      setProvider(p);
      setSigner(s);
      setUserAddress(addr);
      setConnecting(false);

      return { signer: s, provider: p, userAddress: addr, isMini };
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

    setMintStatus("Checking USDC allowance…");

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

  async function sendContractTx(
    to: string,
    data: string
  ): Promise<ethers.providers.TransactionResponse | null> {
    const ctx = await ensureWallet();
    if (!ctx) return null;

    if (ctx.isMini && miniAppEthProvider) {
      const from = ctx.userAddress;
      const valueHex = "0x0";
      const txHash: string = await miniAppEthProvider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from,
            to,
            data,
            value: valueHex,
          },
        ],
      });
      const fakeTx: any = {
        hash: txHash,
        wait: async () => {},
      };
      return fakeTx as ethers.providers.TransactionResponse;
    } else {
      const tx = await ctx.signer.sendTransaction({
        to,
        data,
        value: 0,
      });
      return tx;
    }
  }

  async function handleMintLand() {
    try {
      setMintStatus("Preparing to mint 1 Land (199.99 USDC + gas)…");
      const okAllowance = await ensureUsdcAllowance(
        LAND_ADDRESS,
        LAND_PRICE_USDC
      );
      if (!okAllowance) return;

      const data = landInterface.encodeFunctionData("mint", []);
      const tx = await sendContractTx(LAND_ADDRESS, data);
      if (!tx) return;
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
      setMintStatus(`Land mint failed: ${msg}`);
    }
  }

  async function handleMintPlant() {
    try {
      setMintStatus("Preparing to mint 1 Plant (49.99 USDC + gas)…");
      const okAllowance = await ensureUsdcAllowance(
        PLANT_ADDRESS,
        PLANT_PRICE_USDC
      );
      if (!okAllowance) return;

      const data = plantInterface.encodeFunctionData("mint", []);
      const tx = await sendContractTx(PLANT_ADDRESS, data);
      if (!tx) return;
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
      setMintStatus(`Plant mint failed: ${msg}`);
    }
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

      const MAX_ID = 400;
      const ids: number[] = [];
      for (let tokenId = 0; tokenId < MAX_ID; tokenId++) {
        ids.push(tokenId);
      }

      const ownerLower = owner.toLowerCase();
      const found: number[] = [];
      const BATCH = 20;

      for (let i = 0; i < ids.length; i += BATCH) {
        const slice = ids.slice(i, i + BATCH);
        const results = await Promise.all(
          slice.map(async (tokenId) => {
            try {
              const who: string = await nft.ownerOf(tokenId);
              return { tokenId, who };
            } catch {
              return { tokenId, who: "" };
            }
          })
        );

        for (const r of results) {
          if (!r.who) continue;
          if (r.who.toLowerCase() === ownerLower) {
            found.push(r.tokenId);
            if (found.length >= bal) break;
          }
        }
        if (found.length >= bal) break;
      }

      return found;
    } catch (e) {
      console.error("Failed to enumerate tokens for", nftAddress, e);
      return [];
    }
  }

  async function refreshStaking() {
    let addr = userAddress;
    if (!addr) {
      const ctx = await ensureWallet();
      if (!ctx) return;
      addr = ctx.userAddress;
    }

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

      const [plantOwned, landOwned] = await Promise.all([
        loadOwnedTokens(PLANT_ADDRESS, addr),
        loadOwnedTokens(LAND_ADDRESS, addr),
      ]);

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

      setLoadingStaking(false);
    } catch (err) {
      console.error("Failed to load staking state:", err);
      setLoadingStaking(false);
    }
  }

  useEffect(() => {
    if (!stakingOpen) return;
    refreshStaking();
  }, [stakingOpen]);

  async function refreshCrimeLadder() {
    setLadderLoading(true);
    try {
      const staking = new ethers.Contract(
        STAKING_ADDRESS,
        STAKING_ABI,
        readProvider
      );

      const [tokensPerPlantPerDayBn, landBpsBn] = await Promise.all([
        staking.tokensPerPlantPerDay(),
        staking.landBoostBps(),
      ]);

      const addrSet = new Set<string>();
      const MAX_ID = 400;
      const BATCH = 40;
      const zero = ethers.constants.AddressZero;

      const scanMapping = async (fn: "plantStakerOf" | "landStakerOf") => {
        for (let start = 0; start < MAX_ID; start += BATCH) {
          const ids: number[] = [];
          const end = Math.min(MAX_ID, start + BATCH);
          for (let i = start; i < end; i++) ids.push(i);

          try {
            const promises = ids.map((id) =>
              (staking as any)[fn](id).catch(() => zero)
            );
            const results: string[] = await Promise.all(promises);
            results.forEach((who) => {
              if (who && who !== zero) {
                addrSet.add(who.toLowerCase());
              }
            });
          } catch (e) {
            console.warn(`Batch scan error for ${fn}`, e);
          }
        }
      };

      await scanMapping("plantStakerOf");
      await scanMapping("landStakerOf");

      const allAddrs = Array.from(addrSet);
      const rows: FarmerRow[] = [];

      const tasks = allAddrs.map(async (addr) => {
        try {
          const u = await staking.users(addr);
          const plants = Number(u.plants);
          const lands = Number(u.lands);
          if (plants === 0 && lands === 0) return;

          const plantsBn = ethers.BigNumber.from(plants);
          const landsBn = ethers.BigNumber.from(lands);

          const base = tokensPerPlantPerDayBn.mul(plantsBn);
          const boostTotalBps = ethers.BigNumber.from(10000).add(
            landBpsBn.mul(landsBn)
          );
          const dailyBn = base.mul(boostTotalBps).div(10000);
          const dailyFloat = parseFloat(
            ethers.utils.formatUnits(dailyBn, 18)
          );

          const capacityTotal = 1 + lands * 3;
          const boostPct = (lands * landBpsBn.toNumber()) / 100;

          rows.push({
            addr,
            plants,
            lands,
            boostPct,
            capacity: `${plants}/${capacityTotal}`,
            daily: dailyFloat.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            }),
            dailyRaw: dailyFloat,
          });
        } catch {
          //
        }
      });

      await Promise.all(tasks);

      rows.sort((a, b) => b.dailyRaw - a.dailyRaw);
      setLadderRows(rows.slice(0, 10));
    } catch (e) {
      console.error("Crime ladder load failed", e);
      setLadderRows([]);
    } finally {
      setLadderLoading(false);
    }
  }

  useEffect(() => {
    refreshCrimeLadder();
  }, []);

  async function ensureCollectionApproval(
    collectionAddress: string,
    ctx: {
      signer: ethers.Signer;
      userAddress: string;
    }
  ) {
    // Minimal path: rely on UI-level approval via external site or previous approval.
    // If you want, you can re-add isApprovedForAll checks here later.
    const nft = new ethers.Contract(
      collectionAddress,
      ["function setApprovalForAll(address,bool)"],
      ctx.signer
    );
    // Best-effort approve; if fails, user will see wallet error but app won't crash.
    try {
      const tx = await nft.setApprovalForAll(STAKING_ADDRESS, true);
      await waitForTx(tx);
    } catch (e) {
      console.warn("Approval tx failed or reverted (user may have rejected):", e);
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

    try {
      setActionLoading(true);

      if (toStakePlants.length > 0) {
        await ensureCollectionApproval(PLANT_ADDRESS, ctx);
        const data = stakingInterface.encodeFunctionData("stakePlants", [
          toStakePlants.map((id) => ethers.BigNumber.from(id)),
        ]);
        const tx = await sendContractTx(STAKING_ADDRESS, data);
        await waitForTx(tx);
      }

      if (toStakeLands.length > 0 && landStakingEnabled) {
        await ensureCollectionApproval(LAND_ADDRESS, ctx);
        const data2 = stakingInterface.encodeFunctionData("stakeLands", [
          toStakeLands.map((id) => ethers.BigNumber.from(id)),
        ]);
        const tx2 = await sendContractTx(STAKING_ADDRESS, data2);
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

    try {
      setActionLoading(true);

      if (toUnstakePlants.length > 0) {
        const data = stakingInterface.encodeFunctionData("unstakePlants", [
          toUnstakePlants.map((id) => ethers.BigNumber.from(id)),
        ]);
        const tx = await sendContractTx(STAKING_ADDRESS, data);
        await waitForTx(tx);
      }

      if (toUnstakeLands.length > 0) {
        const data2 = stakingInterface.encodeFunctionData("unstakeLands", [
          toUnstakeLands.map((id) => ethers.BigNumber.from(id)),
        ]);
        const tx2 = await sendContractTx(STAKING_ADDRESS, data2);
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
      const data = stakingInterface.encodeFunctionData("claim", []);
      const tx = await sendContractTx(STAKING_ADDRESS, data);
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

            <p
              style={{
                fontSize: 14,
                fontWeight: 700,
                margin: "6px 0 10px",
                opacity: 0.95,
              }}
            >
              <strong>
                Mint 1 Plant to start farming like Pablo Escobar
              </strong>
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
                    "https://dexscreener.com/base/0x0000000000000000000000000000000000000000",
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
              The more you farm and climb the ladder, the larger your share of{" "}
              <b>ETH rewards</b> from the tax pool.
            </li>
          </ul>
        </section>

        <section className={styles.infoCard}>
          <h2 className={styles.heading}>Crime Ladder — Top Farmers</h2>
          {ladderLoading ? (
            <p style={{ fontSize: 13, opacity: 0.8 }}>Loading ladder…</p>
          ) : ladderRows.length === 0 ? (
            <p style={{ fontSize: 13, opacity: 0.8 }}>
              No farmers yet. Stake Plants + Land to appear on the Crime
              Ladder.
            </p>
          ) : (
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
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>
                      Rank
                    </th>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>
                      Farmer
                    </th>
                    <th style={{ textAlign: "right", padding: "4px 6px" }}>
                      Plants
                    </th>
                    <th style={{ textAlign: "right", padding: "4px 6px" }}>
                      Land
                    </th>
                    <th style={{ textAlign: "right", padding: "4px 6px" }}>
                      Land Boost
                    </th>
                    <th style={{ textAlign: "right", padding: "4px 6px" }}>
                      Capacity
                    </th>
                    <th style={{ textAlign: "right", padding: "4px 6px" }}>
                      Daily {TOKEN_SYMBOL}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ladderRows.map((row, idx) => (
                    <tr key={row.addr}>
                      <td style={{ padding: "4px 6px" }}>{idx + 1}</td>
                      <td style={{ padding: "4px 6px" }}>
                        {row.addr.slice(0, 6)}…{row.addr.slice(-4)}
                      </td>
                      <td style={{ padding: "4px 6px", textAlign: "right" }}>
                        {row.plants}
                      </td>
                      <td style={{ padding: "4px 6px", textAlign: "right" }}>
                        {row.lands}
                      </td>
                      <td style={{ padding: "4px 6px", textAlign: "right" }}>
                        +{row.boostPct.toFixed(1)}%
                      </td>
                      <td style={{ padding: "4px 6px", textAlign: "right" }}>
                        {row.capacity}
                      </td>
                      <td style={{ padding: "4px 6px", textAlign: "right" }}>
                        {row.daily}
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
                        const img = LAND_FALLBACK_IMG;
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
                        const img = PLANT_FALLBACK_IMG;
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
                        const img = LAND_FALLBACK_IMG;
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
                        const img = PLANT_FALLBACK_IMG;
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
