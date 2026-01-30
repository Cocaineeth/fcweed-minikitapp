"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { 
    V6_BATTLES_ADDRESS, 
    V6_STAKING_ADDRESS,
    FCWEED_ADDRESS,
    USDC_ADDRESS,
    DROUGHT_COOLDOWN,
    DROUGHT_COST_XFCWEED,
    DROUGHT_COST_FCWEED,
    DROUGHT_COST_USDC,
    DROUGHT_TAKE_PERCENT,
    DROUGHT_REWARD_PERCENT,
} from "../lib/constants";
import { V5_BATTLES_ABI, V6_STAKING_ABI, ERC20_ABI, USDC_ABI } from "../lib/abis";

interface DroughtButtonProps {
    address: string | undefined;
    signer: ethers.Signer | null;
    provider: ethers.providers.Provider;
    onSuccess?: () => void;
    xFcweedBalance?: ethers.BigNumber;
    fcweedBalance?: ethers.BigNumber;
    usdcBalance?: ethers.BigNumber;
}

export function DroughtButton({ 
    address, 
    signer, 
    provider, 
    onSuccess,
    xFcweedBalance,
    fcweedBalance,
    usdcBalance,
}: DroughtButtonProps) {
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [txStatus, setTxStatus] = useState<string>("");
    
    // Drought state
    const [canDrought, setCanDrought] = useState(false);
    const [timeToDrought, setTimeToDrought] = useState(0);
    const [droughtOn, setDroughtOn] = useState(false);
    const [lastDrought, setLastDrought] = useState(0);
    
    // Format time remaining
    const formatTimeRemaining = (seconds: number) => {
        if (seconds <= 0) return "Ready!";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h}h ${m}m ${s}s`;
    };
    
    // Format large numbers
    const formatBigNumber = (bn: ethers.BigNumber | undefined, decimals = 18) => {
        if (!bn) return "0";
        const formatted = ethers.utils.formatUnits(bn, decimals);
        const num = parseFloat(formatted);
        if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
        if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
        return num.toFixed(2);
    };
    
    // Load drought state
    const loadDroughtState = useCallback(async () => {
        if (!provider) return;
        
        try {
            const battlesContract = new ethers.Contract(V6_BATTLES_ADDRESS, V5_BATTLES_ABI, provider);
            
            const [canDroughtResult, timeToDroughtResult, droughtOnResult, lastDroughtResult] = await Promise.all([
                battlesContract.canDrought().catch(() => false),
                battlesContract.timeToDrought().catch(() => ethers.BigNumber.from(0)),
                battlesContract.droughtOn().catch(() => false),
                battlesContract.lastDrought().catch(() => ethers.BigNumber.from(0)),
            ]);
            
            setCanDrought(canDroughtResult);
            setTimeToDrought(timeToDroughtResult.toNumber?.() || 0);
            setDroughtOn(droughtOnResult);
            setLastDrought(lastDroughtResult.toNumber?.() || 0);
        } catch (err) {
            console.error("Error loading drought state:", err);
        }
    }, [provider]);
    
    // Load state on mount and periodically
    useEffect(() => {
        loadDroughtState();
        const interval = setInterval(loadDroughtState, 10000);
        return () => clearInterval(interval);
    }, [loadDroughtState]);
    
    // Countdown timer
    useEffect(() => {
        if (timeToDrought <= 0) return;
        
        const interval = setInterval(() => {
            setTimeToDrought(prev => Math.max(0, prev - 1));
        }, 1000);
        
        return () => clearInterval(interval);
    }, [timeToDrought]);
    
    // Activate drought
    const activateDrought = async (paymentType: number) => {
        if (!signer || !address) {
            alert("Please connect your wallet");
            return;
        }
        
        setLoading(true);
        setTxStatus("Preparing transaction...");
        
        try {
            const battlesContract = new ethers.Contract(V6_BATTLES_ADDRESS, V5_BATTLES_ABI, signer);
            
            // Check/approve tokens based on payment type
            if (paymentType === 1) {
                // FCWEED payment
                setTxStatus("Checking FCWEED approval...");
                // Use provider for read calls (allowance), signer for write calls (approve)
                const fcweedRead = new ethers.Contract(FCWEED_ADDRESS, ERC20_ABI, provider);
                const allowance = await fcweedRead.allowance(address, V6_BATTLES_ADDRESS);
                if (allowance.lt(DROUGHT_COST_FCWEED)) {
                    setTxStatus("Approving FCWEED...");
                    const fcweedWrite = new ethers.Contract(FCWEED_ADDRESS, ERC20_ABI, signer);
                    const approveTx = await fcweedWrite.approve(V6_BATTLES_ADDRESS, ethers.constants.MaxUint256);
                    await approveTx.wait();
                }
            } else if (paymentType === 2) {
                // USDC payment
                setTxStatus("Checking USDC approval...");
                // Use provider for read calls (allowance), signer for write calls (approve)
                const usdcRead = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
                const allowance = await usdcRead.allowance(address, V6_BATTLES_ADDRESS);
                if (allowance.lt(DROUGHT_COST_USDC)) {
                    setTxStatus("Approving USDC...");
                    const usdcWrite = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
                    const approveTx = await usdcWrite.approve(V6_BATTLES_ADDRESS, ethers.constants.MaxUint256);
                    await approveTx.wait();
                }
            }
            
            setTxStatus("Activating drought...");
            const tx = await battlesContract.activateDrought(paymentType);
            
            setTxStatus("Waiting for confirmation...");
            await tx.wait();
            
            setTxStatus("Drought activated! 🌵");
            await loadDroughtState();
            
            setTimeout(() => {
                setShowModal(false);
                setTxStatus("");
                onSuccess?.();
            }, 2000);
            
        } catch (err: any) {
            console.error("Drought activation failed:", err);
            setTxStatus(`Failed: ${err.reason || err.message || "Unknown error"}`);
        } finally {
            setLoading(false);
        }
    };
    
    // Check if user can afford each payment type
    const canAffordXFcweed = xFcweedBalance?.gte(DROUGHT_COST_XFCWEED) || false;
    const canAffordFcweed = fcweedBalance?.gte(DROUGHT_COST_FCWEED) || false;
    const canAffordUsdc = usdcBalance?.gte(DROUGHT_COST_USDC) || false;
    
    if (!droughtOn) {
        return null; // Don't show if drought is disabled
    }
    
    return (
        <>
            {/* Drought Button */}
            <div 
                className="relative overflow-hidden rounded-xl p-4 cursor-pointer transition-all duration-300 hover:scale-[1.02]"
                style={{
                    background: canDrought 
                        ? "linear-gradient(135deg, #7c2d12 0%, #b91c1c 50%, #dc2626 100%)"
                        : "linear-gradient(135deg, #374151 0%, #4b5563 50%, #6b7280 100%)",
                    border: canDrought ? "2px solid #ef4444" : "2px solid #6b7280",
                    boxShadow: canDrought ? "0 0 20px rgba(239, 68, 68, 0.4)" : "none",
                }}
                onClick={() => setShowModal(true)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="text-3xl">🌵</div>
                        <div>
                            <div className="text-lg font-bold text-white">DROUGHT</div>
                            <div className="text-sm text-gray-200">
                                {canDrought 
                                    ? "Ready to activate!" 
                                    : `Cooldown: ${formatTimeRemaining(timeToDrought)}`
                                }
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-gray-200">Steals {DROUGHT_TAKE_PERCENT}% rewards</div>
                        <div className="text-xs text-gray-200">You keep {DROUGHT_REWARD_PERCENT}%</div>
                    </div>
                </div>
                
                {/* Animated pulse when ready */}
                {canDrought && (
                    <div 
                        className="absolute inset-0 rounded-xl animate-pulse"
                        style={{
                            background: "radial-gradient(circle at center, rgba(239, 68, 68, 0.3) 0%, transparent 70%)",
                            pointerEvents: "none",
                        }}
                    />
                )}
            </div>
            
            {/* Drought Modal */}
            {showModal && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ backgroundColor: "rgba(0, 0, 0, 0.8)" }}
                    onClick={() => !loading && setShowModal(false)}
                >
                    <div 
                        className="relative w-full max-w-md rounded-2xl p-6"
                        style={{
                            background: "linear-gradient(180deg, #1f1f1f 0%, #0f0f0f 100%)",
                            border: "2px solid #ef4444",
                            boxShadow: "0 0 40px rgba(239, 68, 68, 0.3)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Close button */}
                        <button 
                            className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl"
                            onClick={() => !loading && setShowModal(false)}
                            disabled={loading}
                        >
                            ×
                        </button>
                        
                        {/* Header */}
                        <div className="text-center mb-6">
                            <div className="text-5xl mb-2">🌵</div>
                            <h2 className="text-2xl font-bold text-red-500">ACTIVATE DROUGHT</h2>
                            <p className="text-gray-400 text-sm mt-2">
                                A drought will steal {DROUGHT_TAKE_PERCENT}% of ALL players' pending rewards!
                            </p>
                        </div>
                        
                        {/* Status */}
                        {!canDrought && (
                            <div className="bg-gray-800 rounded-lg p-4 mb-4 text-center">
                                <div className="text-yellow-500 font-bold">⏱️ COOLDOWN ACTIVE</div>
                                <div className="text-2xl font-mono text-white mt-2">
                                    {formatTimeRemaining(timeToDrought)}
                                </div>
                            </div>
                        )}
                        
                        {/* Transaction Status */}
                        {txStatus && (
                            <div className="bg-gray-800 rounded-lg p-3 mb-4 text-center">
                                <div className="text-yellow-400">{txStatus}</div>
                            </div>
                        )}
                        
                        {/* Payment Options */}
                        {canDrought && !loading && (
                            <div className="space-y-3">
                                <div className="text-sm text-gray-400 text-center mb-2">Choose payment method:</div>
                                
                                {/* xFCWEED Option */}
                                <button
                                    className={`w-full p-4 rounded-xl flex items-center justify-between transition-all ${
                                        canAffordXFcweed 
                                            ? "bg-gradient-to-r from-purple-900 to-purple-700 hover:from-purple-800 hover:to-purple-600 border border-purple-500"
                                            : "bg-gray-800 opacity-50 cursor-not-allowed border border-gray-600"
                                    }`}
                                    onClick={() => canAffordXFcweed && activateDrought(0)}
                                    disabled={!canAffordXFcweed}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">💎</span>
                                        <div className="text-left">
                                            <div className="font-bold text-white">100M xFCWEED</div>
                                            <div className="text-xs text-gray-300">
                                                Balance: {formatBigNumber(xFcweedBalance)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-green-400">
                                        {canAffordXFcweed ? "✓" : "✗"}
                                    </div>
                                </button>
                                
                                {/* FCWEED Option */}
                                <button
                                    className={`w-full p-4 rounded-xl flex items-center justify-between transition-all ${
                                        canAffordFcweed 
                                            ? "bg-gradient-to-r from-green-900 to-green-700 hover:from-green-800 hover:to-green-600 border border-green-500"
                                            : "bg-gray-800 opacity-50 cursor-not-allowed border border-gray-600"
                                    }`}
                                    onClick={() => canAffordFcweed && activateDrought(1)}
                                    disabled={!canAffordFcweed}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">🌿</span>
                                        <div className="text-left">
                                            <div className="font-bold text-white">100M FCWEED</div>
                                            <div className="text-xs text-gray-300">
                                                Balance: {formatBigNumber(fcweedBalance)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-green-400">
                                        {canAffordFcweed ? "✓" : "✗"}
                                    </div>
                                </button>
                                
                                {/* USDC Option */}
                                <button
                                    className={`w-full p-4 rounded-xl flex items-center justify-between transition-all ${
                                        canAffordUsdc 
                                            ? "bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 border border-blue-500"
                                            : "bg-gray-800 opacity-50 cursor-not-allowed border border-gray-600"
                                    }`}
                                    onClick={() => canAffordUsdc && activateDrought(2)}
                                    disabled={!canAffordUsdc}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">💵</span>
                                        <div className="text-left">
                                            <div className="font-bold text-white">$300 USDC</div>
                                            <div className="text-xs text-gray-300">
                                                Balance: ${formatBigNumber(usdcBalance, 6)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-green-400">
                                        {canAffordUsdc ? "✓" : "✗"}
                                    </div>
                                </button>
                            </div>
                        )}
                        
                        {/* Loading State */}
                        {loading && (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-500 border-t-transparent"></div>
                            </div>
                        )}
                        
                        {/* Info */}
                        <div className="mt-6 p-3 bg-red-900/30 rounded-lg border border-red-800">
                            <div className="text-xs text-red-300">
                                ⚠️ <strong>Warning:</strong> Activating a drought will damage ALL players' plant health by 30% and steal 30% of their pending rewards. You'll receive 50% of the stolen amount.
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default DroughtButton;
