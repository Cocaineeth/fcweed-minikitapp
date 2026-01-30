"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { 
    V6_STAKING_ADDRESS,
    FCWEED_ADDRESS,
} from "../lib/constants";
import { ERC20_ABI } from "../lib/abis";

// Crop Duster constants from contracts
const CROP_DUSTER_ID = 8;
const CROP_DUSTER_TARGET_COUNT = 3;
const CROP_DUSTER_STEAL_PERCENT = 50;
const CROP_DUSTER_DAMAGE_PERCENT = 50;
const CROP_DUSTER_EXECUTION_FEE = ethers.utils.parseUnits("500000", 18); // 500K FCWEED

interface StakerInfo {
    address: string;
    plants: number;
    pending: string;
    pendingRaw: ethers.BigNumber;
    avgHealth: number;
}

interface CropDusterModalProps {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string | undefined;
    sendContractTx: (to: string, data: string, gasLimit: string, from?: string) => Promise<any>;
    provider: ethers.providers.Provider | null;
    fcweedBalance?: ethers.BigNumber;
    inventoryCount: number;
    onSuccess?: () => void;
    theme?: "light" | "dark";
    itemShopAddress: string;
    battlesAddress: string;
}

type ModalStep = "confirm" | "activating" | "select_targets" | "executing";

export function CropDusterModal({
    isOpen,
    onClose,
    userAddress,
    sendContractTx,
    provider,
    fcweedBalance,
    inventoryCount,
    onSuccess,
    theme = "dark",
    itemShopAddress,
    battlesAddress,
}: CropDusterModalProps) {
    const [step, setStep] = useState<ModalStep>("confirm");
    const [loading, setLoading] = useState(false);
    const [txStatus, setTxStatus] = useState("");
    
    // Target selection state
    const [stakers, setStakers] = useState<StakerInfo[]>([]);
    const [loadingStakers, setLoadingStakers] = useState(false);
    const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    
    // Reset state when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setStep("confirm");
            setSelectedTargets([]);
            setTxStatus("");
            setSearchQuery("");
            setLoading(false);
        }
    }, [isOpen]);
    
    // Format large numbers
    const formatBigNumber = (bn: ethers.BigNumber | undefined, decimals = 18) => {
        if (!bn) return "0";
        const formatted = ethers.utils.formatUnits(bn, decimals);
        const num = parseFloat(formatted);
        if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
        if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
        return num.toFixed(2);
    };
    
    // Load all stakers for target selection
    const loadStakers = useCallback(async () => {
        if (!provider || !userAddress) return;
        
        setLoadingStakers(true);
        try {
            const stakingAbi = [
                "function getTotalStakers() view returns (uint256)",
                "function getStakerAtIndex(uint256) view returns (address)",
                "function users(address) view returns (uint256 plants, uint256 lands, uint256 superLands, uint256 lastClaim, uint256 lastWater)",
                "function pending(address) view returns (uint256)",
                "function getAverageHealth(address) view returns (uint256)",
            ];
            const stakingContract = new ethers.Contract(V6_STAKING_ADDRESS, stakingAbi, provider);
            
            // Get total stakers count
            const totalStakers = await stakingContract.getTotalStakers().catch(() => ethers.BigNumber.from(0));
            const count = totalStakers.toNumber ? totalStakers.toNumber() : parseInt(totalStakers.toString());
            
            if (count === 0) {
                setStakers([]);
                setLoadingStakers(false);
                return;
            }
            
            // Load stakers in batches
            const batchSize = 50;
            const allStakers: StakerInfo[] = [];
            
            for (let i = 0; i < Math.min(count, 200); i += batchSize) {
                const batch = await Promise.all(
                    Array.from({ length: Math.min(batchSize, count - i) }, async (_, j) => {
                        try {
                            const stakerAddr = await stakingContract.getStakerAtIndex(i + j);
                            
                            // Skip self
                            if (stakerAddr.toLowerCase() === userAddress.toLowerCase()) {
                                return null;
                            }
                            
                            // Get staker info
                            const [userData, pending, avgHealth] = await Promise.all([
                                stakingContract.users(stakerAddr).catch(() => null),
                                stakingContract.pending(stakerAddr).catch(() => ethers.BigNumber.from(0)),
                                stakingContract.getAverageHealth(stakerAddr).catch(() => ethers.BigNumber.from(100)),
                            ]);
                            
                            const plants = userData?.plants?.toNumber?.() || userData?.plants || 0;
                            const pendingNum = parseFloat(ethers.utils.formatEther(pending));
                            
                            // Only include stakers with pending rewards
                            if (pendingNum < 1000) return null;
                            
                            return {
                                address: stakerAddr,
                                plants: typeof plants === 'number' ? plants : parseInt(plants.toString()),
                                pending: pendingNum >= 1_000_000 
                                    ? `${(pendingNum / 1_000_000).toFixed(2)}M`
                                    : pendingNum >= 1_000 
                                        ? `${(pendingNum / 1_000).toFixed(1)}K`
                                        : pendingNum.toFixed(0),
                                pendingRaw: pending,
                                avgHealth: avgHealth.toNumber ? avgHealth.toNumber() : parseInt(avgHealth.toString()),
                            };
                        } catch {
                            return null;
                        }
                    })
                );
                
                allStakers.push(...batch.filter((s): s is StakerInfo => s !== null));
            }
            
            // Sort by pending rewards (highest first)
            allStakers.sort((a, b) => {
                const aVal = parseFloat(ethers.utils.formatEther(a.pendingRaw));
                const bVal = parseFloat(ethers.utils.formatEther(b.pendingRaw));
                return bVal - aVal;
            });
            
            setStakers(allStakers);
        } catch (err) {
            console.error("Error loading stakers:", err);
        } finally {
            setLoadingStakers(false);
        }
    }, [provider, userAddress]);
    
    // Activate crop duster from inventory
    const handleActivate = async () => {
        if (!userAddress || inventoryCount === 0) return;
        
        setStep("activating");
        setLoading(true);
        setTxStatus("Activating Crop Duster...");
        
        try {
            // Call activateItem(8) on ItemShop
            const iface = new ethers.utils.Interface([
                "function activateItem(uint256 itemId) external"
            ]);
            const data = iface.encodeFunctionData("activateItem", [CROP_DUSTER_ID]);
            const tx = await sendContractTx(itemShopAddress, data, "0x7A120"); // 500k gas
            
            if (!tx) {
                setTxStatus("Transaction cancelled");
                setStep("confirm");
                setLoading(false);
                return;
            }
            
            setTxStatus("Waiting for confirmation...");
            await tx.wait();
            
            setTxStatus("Activated! Loading targets...");
            
            // Load stakers and move to target selection
            await loadStakers();
            setStep("select_targets");
            setTxStatus("");
            setLoading(false);
            
        } catch (err: any) {
            console.error("Activation failed:", err);
            setTxStatus(`Failed: ${err.reason || err.message || "Unknown error"}`);
            setStep("confirm");
            setLoading(false);
        }
    };
    
    // Toggle target selection
    const toggleTarget = (address: string) => {
        setSelectedTargets(prev => {
            if (prev.includes(address)) {
                return prev.filter(a => a !== address);
            }
            if (prev.length >= CROP_DUSTER_TARGET_COUNT) {
                return prev;
            }
            return [...prev, address];
        });
    };
    
    // Execute the crop duster attack
    const executeAttack = async () => {
        if (!userAddress || selectedTargets.length !== CROP_DUSTER_TARGET_COUNT) return;
        
        // Check FCWEED balance for execution fee
        if (fcweedBalance && fcweedBalance.lt(CROP_DUSTER_EXECUTION_FEE)) {
            setTxStatus("Need 500K FCWEED for execution fee!");
            return;
        }
        
        setStep("executing");
        setLoading(true);
        setTxStatus("Checking FCWEED approval...");
        
        try {
            // First approve FCWEED if needed for the execution fee
            const fcweed = new ethers.Contract(FCWEED_ADDRESS, ERC20_ABI, provider);
            const allowance = await fcweed.allowance(userAddress, battlesAddress);
            if (allowance.lt(CROP_DUSTER_EXECUTION_FEE)) {
                setTxStatus("Approving FCWEED...");
                const approveIface = new ethers.utils.Interface(ERC20_ABI);
                const approveData = approveIface.encodeFunctionData("approve", [battlesAddress, ethers.constants.MaxUint256]);
                const approveTx = await sendContractTx(FCWEED_ADDRESS, approveData, "0x7A120");
                if (!approveTx) {
                    setTxStatus("Approval cancelled");
                    setStep("select_targets");
                    setLoading(false);
                    return;
                }
                await approveTx.wait();
            }
            
            setTxStatus("Deploying Crop Duster...");
            
            // Call cropDusterAttack on Battles contract
            const iface = new ethers.utils.Interface([
                "function cropDusterAttack(address[3] targets) external"
            ]);
            const targetsArray: [string, string, string] = [selectedTargets[0], selectedTargets[1], selectedTargets[2]];
            const data = iface.encodeFunctionData("cropDusterAttack", [targetsArray]);
            const tx = await sendContractTx(battlesAddress, data, "0xF4240"); // 1M gas
            
            if (!tx) {
                setTxStatus("Transaction cancelled");
                setStep("select_targets");
                setLoading(false);
                return;
            }
            
            setTxStatus("Crop Duster in flight...");
            await tx.wait();
            
            setTxStatus("Crop Duster attack complete!");
            
            setTimeout(() => {
                onClose();
                if (onSuccess) onSuccess();
            }, 2000);
            
        } catch (err: any) {
            console.error("Attack failed:", err);
            setTxStatus(`Failed: ${err.reason || err.message || "Unknown error"}`);
            setStep("select_targets");
            setLoading(false);
        }
    };
    
    // Check affordability for execution fee
    const canAffordFee = fcweedBalance ? fcweedBalance.gte(CROP_DUSTER_EXECUTION_FEE) : false;
    
    // Filter stakers by search
    const filteredStakers = stakers.filter(s => 
        s.address.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    if (!isOpen) return null;
    
    const bgColor = theme === "light" ? "#ffffff" : "linear-gradient(135deg, #1a1a00, #2d2a0a)";
    const textColor = theme === "light" ? "#1e293b" : "#ffffff";
    const mutedColor = theme === "light" ? "#64748b" : "#9ca3af";
    
    return (
        <div 
            style={{ 
                position: "fixed", 
                top: 0, 
                left: 0, 
                right: 0, 
                bottom: 0, 
                background: "rgba(0,0,0,0.9)", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center", 
                zIndex: 100, 
                padding: 16 
            }}
            onClick={() => !loading && onClose()}
        >
            <div 
                style={{ 
                    background: bgColor, 
                    borderRadius: 16, 
                    padding: 24, 
                    maxWidth: step === "select_targets" ? 520 : 400, 
                    width: "100%", 
                    maxHeight: "85vh",
                    overflowY: "auto",
                    border: "2px solid #f59e0b",
                    boxShadow: "0 0 40px rgba(245,158,11,0.3)",
                    position: "relative"
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Close button */}
                {!loading && step !== "executing" && step !== "activating" && (
                    <button
                        onClick={onClose}
                        style={{
                            position: "absolute",
                            top: 16,
                            right: 16,
                            background: "transparent",
                            border: "none",
                            color: mutedColor,
                            fontSize: 24,
                            cursor: "pointer",
                            padding: 4,
                        }}
                    >
                        ✕
                    </button>
                )}
                
                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 64, marginBottom: 8 }}>✈️</div>
                    <h2 style={{ margin: 0, fontSize: 22, color: "#f59e0b", fontWeight: 700 }}>
                        CROP DUSTER
                    </h2>
                    <p style={{ fontSize: 12, color: mutedColor, margin: "8px 0 0" }}>
                        Aerial assault on {CROP_DUSTER_TARGET_COUNT} targets!
                    </p>
                </div>
                
                {/* Step: Confirm */}
                {step === "confirm" && (
                    <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                            <div style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 8, padding: 10, textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: "#f59e0b", marginBottom: 4 }}>TARGETS</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: "#f59e0b" }}>{CROP_DUSTER_TARGET_COUNT}</div>
                            </div>
                            <div style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 8, padding: 10, textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: "#fbbf24", marginBottom: 4 }}>STEAL</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: "#fbbf24" }}>{CROP_DUSTER_STEAL_PERCENT}%</div>
                            </div>
                            <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, padding: 10, textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: "#ef4444", marginBottom: 4 }}>DAMAGE</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: "#ef4444" }}>{CROP_DUSTER_DAMAGE_PERCENT}%</div>
                            </div>
                        </div>
                        
                        <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                            <div style={{ fontSize: 11, color: "#fcd34d", textAlign: "center", lineHeight: 1.6 }}>
                                <strong style={{ color: "#f59e0b" }}>AERIAL ASSAULT</strong><br/><br/>
                                Deploy your Crop Duster to attack <strong>{CROP_DUSTER_TARGET_COUNT} targets</strong> simultaneously.<br/><br/>
                                Each target loses <strong>{CROP_DUSTER_STEAL_PERCENT}%</strong> of their pending rewards (you keep it!) and takes <strong>{CROP_DUSTER_DAMAGE_PERCENT}%</strong> plant damage.
                            </div>
                        </div>
                        
                        <div style={{ background: "rgba(107,114,128,0.1)", border: "1px solid rgba(107,114,128,0.3)", borderRadius: 10, padding: 12, marginBottom: 20 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <span style={{ fontSize: 11, color: mutedColor }}>Execution Fee:</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: canAffordFee ? "#10b981" : "#ef4444" }}>
                                    500K FCWEED {canAffordFee ? "✓" : "✗"}
                                </span>
                            </div>
                            <div style={{ fontSize: 10, color: "#9ca3af", textAlign: "center" }}>
                                Fee is charged when attack executes • Your balance: {formatBigNumber(fcweedBalance)}
                            </div>
                        </div>
                        
                        {inventoryCount === 0 ? (
                            <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: 14, textAlign: "center" }}>
                                <div style={{ fontSize: 14, color: "#ef4444", fontWeight: 600 }}>No Crop Dusters in Inventory</div>
                                <div style={{ fontSize: 11, color: "#fca5a5", marginTop: 8 }}>Buy from the USDC Shop for $100</div>
                            </div>
                        ) : (
                            <div style={{ display: "flex", gap: 10 }}>
                                <button
                                    onClick={() => onClose()}
                                    style={{
                                        flex: 1,
                                        padding: 14,
                                        borderRadius: 10,
                                        border: "1px solid #374151",
                                        background: "transparent",
                                        color: mutedColor,
                                        fontWeight: 600,
                                        fontSize: 13,
                                        cursor: "pointer"
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleActivate}
                                    disabled={!canAffordFee}
                                    style={{
                                        flex: 1,
                                        padding: 14,
                                        borderRadius: 10,
                                        border: "none",
                                        background: canAffordFee ? "linear-gradient(135deg, #f59e0b, #ea580c)" : "#374151",
                                        color: canAffordFee ? "#fff" : "#6b7280",
                                        fontWeight: 700,
                                        fontSize: 13,
                                        cursor: canAffordFee ? "pointer" : "not-allowed",
                                        boxShadow: canAffordFee ? "0 0 20px rgba(245,158,11,0.4)" : "none"
                                    }}
                                >
                                    DEPLOY ({inventoryCount})
                                </button>
                            </div>
                        )}
                    </>
                )}
                
                {/* Step: Activating */}
                {step === "activating" && (
                    <div style={{ textAlign: "center", padding: 20 }}>
                        <div style={{ fontSize: 64, marginBottom: 16 }}>✈️</div>
                        <div style={{ fontSize: 16, color: "#f59e0b", fontWeight: 600, marginBottom: 16 }}>
                            {txStatus}
                        </div>
                        <div style={{ 
                            width: 40, 
                            height: 40, 
                            border: "3px solid #f59e0b",
                            borderTopColor: "transparent",
                            borderRadius: "50%",
                            margin: "0 auto"
                        }} />
                    </div>
                )}
                
                {/* Step: Target Selection */}
                {step === "select_targets" && (
                    <>
                        <div style={{ 
                            background: "rgba(245,158,11,0.1)", 
                            border: "1px solid rgba(245,158,11,0.3)", 
                            borderRadius: 10, 
                            padding: 12, 
                            marginBottom: 12,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                        }}>
                            <span style={{ fontSize: 12, color: "#f59e0b" }}>Select {CROP_DUSTER_TARGET_COUNT} targets:</span>
                            <span style={{ 
                                fontSize: 14, 
                                fontWeight: 700, 
                                color: selectedTargets.length === CROP_DUSTER_TARGET_COUNT ? "#22c55e" : "#f59e0b" 
                            }}>
                                {selectedTargets.length}/{CROP_DUSTER_TARGET_COUNT}
                            </span>
                        </div>
                        
                        {/* Search */}
                        <input
                            type="text"
                            placeholder="Search by address..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "10px 12px",
                                borderRadius: 8,
                                border: "1px solid #374151",
                                background: "rgba(0,0,0,0.2)",
                                color: textColor,
                                fontSize: 12,
                                marginBottom: 12,
                                boxSizing: "border-box",
                            }}
                        />
                        
                        {/* Stakers List */}
                        <div style={{ 
                            maxHeight: 300, 
                            overflowY: "auto", 
                            marginBottom: 16,
                            border: "1px solid #374151",
                            borderRadius: 10,
                        }}>
                            {loadingStakers ? (
                                <div style={{ padding: 20, textAlign: "center", color: mutedColor }}>
                                    Loading stakers...
                                </div>
                            ) : filteredStakers.length === 0 ? (
                                <div style={{ padding: 20, textAlign: "center", color: mutedColor }}>
                                    No eligible targets found
                                </div>
                            ) : (
                                filteredStakers.map((staker, idx) => {
                                    const isSelected = selectedTargets.includes(staker.address);
                                    return (
                                        <div
                                            key={staker.address}
                                            onClick={() => toggleTarget(staker.address)}
                                            style={{
                                                padding: "10px 12px",
                                                borderBottom: idx < filteredStakers.length - 1 ? "1px solid #374151" : "none",
                                                background: isSelected ? "rgba(245,158,11,0.15)" : "transparent",
                                                cursor: isSelected || selectedTargets.length < CROP_DUSTER_TARGET_COUNT ? "pointer" : "not-allowed",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                opacity: !isSelected && selectedTargets.length >= CROP_DUSTER_TARGET_COUNT ? 0.5 : 1,
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ 
                                                    fontSize: 11, 
                                                    fontFamily: "monospace", 
                                                    color: textColor,
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                }}>
                                                    {staker.address.slice(0, 8)}...{staker.address.slice(-6)}
                                                </div>
                                                <div style={{ fontSize: 10, color: mutedColor, marginTop: 2 }}>
                                                    {staker.plants} plants | {staker.avgHealth}% health
                                                </div>
                                            </div>
                                            <div style={{ textAlign: "right", marginLeft: 10 }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: "#10b981" }}>
                                                    {staker.pending}
                                                </div>
                                                <div style={{ fontSize: 9, color: mutedColor }}>pending</div>
                                            </div>
                                            <div style={{ 
                                                width: 24, 
                                                height: 24, 
                                                borderRadius: 6, 
                                                border: isSelected ? "2px solid #f59e0b" : "2px solid #374151",
                                                background: isSelected ? "#f59e0b" : "transparent",
                                                marginLeft: 10,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                            }}>
                                                {isSelected && <span style={{ color: "#000", fontWeight: 700 }}>✓</span>}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        
                        <div style={{ display: "flex", gap: 10 }}>
                            <button
                                onClick={() => {
                                    onClose();
                                }}
                                style={{
                                    flex: 1,
                                    padding: 14,
                                    borderRadius: 10,
                                    border: "1px solid #374151",
                                    background: "transparent",
                                    color: mutedColor,
                                    fontWeight: 600,
                                    fontSize: 13,
                                    cursor: "pointer"
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeAttack}
                                disabled={selectedTargets.length !== CROP_DUSTER_TARGET_COUNT || loading}
                                style={{
                                    flex: 1,
                                    padding: 14,
                                    borderRadius: 10,
                                    border: "none",
                                    background: selectedTargets.length === CROP_DUSTER_TARGET_COUNT 
                                        ? "linear-gradient(135deg, #f59e0b, #ea580c)" 
                                        : "#374151",
                                    color: selectedTargets.length === CROP_DUSTER_TARGET_COUNT ? "#fff" : "#6b7280",
                                    fontWeight: 700,
                                    fontSize: 13,
                                    cursor: selectedTargets.length === CROP_DUSTER_TARGET_COUNT ? "pointer" : "not-allowed",
                                    boxShadow: selectedTargets.length === CROP_DUSTER_TARGET_COUNT 
                                        ? "0 0 20px rgba(245,158,11,0.4)" 
                                        : "none"
                                }}
                            >
                                ATTACK!
                            </button>
                        </div>
                    </>
                )}
                
                {/* Step: Executing */}
                {step === "executing" && (
                    <div style={{ textAlign: "center", padding: 20 }}>
                        <div style={{ fontSize: 64, marginBottom: 16 }}>✈️</div>
                        <div style={{ fontSize: 16, color: "#f59e0b", fontWeight: 600, marginBottom: 8 }}>
                            {txStatus}
                        </div>
                        {loading && (
                            <div style={{ 
                                width: 40, 
                                height: 40, 
                                border: "3px solid #f59e0b",
                                borderTopColor: "transparent",
                                borderRadius: "50%",
                                margin: "0 auto"
                            }} />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default CropDusterModal;
