// components/WalletSelector.tsx
// Wallet selector modal with support for multiple external wallets
// Maintains primary Farcaster/miniapp connection flow while adding external wallet options

"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { 
    detectAvailableWallets, 
    connectWallet, 
    WalletInfo, 
    ConnectedWallet,
    WalletType 
} from "../lib/externalWallets";
import { sdk } from "@farcaster/miniapp-sdk";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConnect: (wallet: ConnectedWallet) => void;
    theme: "light" | "dark";
    chainId?: number;
}

export function WalletSelector({ isOpen, onClose, onConnect, theme, chainId = 8453 }: Props) {
    const [availableWallets, setAvailableWallets] = useState<WalletInfo[]>([]);
    const [connecting, setConnecting] = useState<WalletType | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isFarcasterAvailable, setIsFarcasterAvailable] = useState(false);

    // Detect available wallets on mount
    useEffect(() => {
        if (!isOpen) return;
        
        const wallets = detectAvailableWallets();
        setAvailableWallets(wallets);
        setError(null);
        
        // Check if we're in a Farcaster miniapp context
        const checkFarcaster = async () => {
            try {
                const context = await sdk.context;
                if (context) {
                    setIsFarcasterAvailable(true);
                }
            } catch {
                setIsFarcasterAvailable(false);
            }
        };
        checkFarcaster();
    }, [isOpen]);

    // Handle Farcaster connection (primary method)
    const handleFarcasterConnect = useCallback(async () => {
        setConnecting('farcaster');
        setError(null);
        
        try {
            await sdk.actions.ready();
            const ethProvider = await sdk.wallet.getEthereumProvider();
            
            if (!ethProvider) {
                throw new Error("No wallet provider from Farcaster");
            }
            
            const accounts = await ethProvider.request({ method: 'eth_requestAccounts' });
            if (!accounts || accounts.length === 0) {
                throw new Error("No accounts returned");
            }
            
            const address = accounts[0];
            const web3Provider = new ethers.providers.Web3Provider(ethProvider as any, 'any');
            const signer = web3Provider.getSigner();
            
            onConnect({
                type: 'farcaster',
                name: 'Farcaster Wallet',
                address,
                provider: web3Provider,
                signer,
                rawProvider: ethProvider
            });
            onClose();
        } catch (err: any) {
            console.error('[WalletSelector] Farcaster connection failed:', err);
            setError(err?.message || "Failed to connect to Farcaster wallet");
        } finally {
            setConnecting(null);
        }
    }, [onConnect, onClose]);

    // Handle external wallet connection
    const handleWalletConnect = useCallback(async (wallet: WalletInfo) => {
        setConnecting(wallet.type);
        setError(null);
        
        try {
            const connected = await connectWallet(wallet, chainId);
            
            if (!connected) {
                throw new Error("Connection was rejected or failed");
            }
            
            onConnect(connected);
            onClose();
        } catch (err: any) {
            console.error('[WalletSelector] Wallet connection failed:', err);
            if (err?.code === 4001) {
                setError("Connection rejected. Please approve the connection request.");
            } else {
                setError(err?.message || "Failed to connect wallet");
            }
        } finally {
            setConnecting(null);
        }
    }, [chainId, onConnect, onClose]);

    if (!isOpen) return null;

    // Theme colors
    const bgColor = theme === "light" ? "rgba(255,255,255,0.98)" : "rgba(15,20,30,0.98)";
    const cardBg = theme === "light" ? "#f8fafc" : "rgba(30,35,45,0.95)";
    const borderColor = theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.1)";
    const textPrimary = theme === "light" ? "#1e293b" : "#ffffff";
    const textMuted = theme === "light" ? "#64748b" : "#94a3b8";

    return (
        <div 
            style={{ 
                position: "fixed", 
                top: 0, 
                left: 0, 
                right: 0, 
                bottom: 0, 
                background: "rgba(0,0,0,0.85)", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center", 
                zIndex: 10000, 
                padding: 16 
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget && !connecting) {
                    onClose();
                }
            }}
        >
            <div 
                style={{ 
                    background: bgColor, 
                    borderRadius: 16, 
                    padding: 24, 
                    maxWidth: 380, 
                    width: "100%", 
                    border: `1px solid ${borderColor}`,
                    maxHeight: "80vh",
                    overflow: "auto"
                }}
            >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: textPrimary, margin: 0 }}>
                        Connect Wallet
                    </h2>
                    <button
                        onClick={onClose}
                        disabled={!!connecting}
                        style={{
                            background: "transparent",
                            border: "none",
                            fontSize: 20,
                            color: textMuted,
                            cursor: connecting ? "not-allowed" : "pointer",
                            padding: 4
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Error message */}
                {error && (
                    <div style={{
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        borderRadius: 8,
                        padding: 12,
                        marginBottom: 16
                    }}>
                        <div style={{ fontSize: 12, color: "#ef4444" }}>{error}</div>
                    </div>
                )}

                {/* Primary: Farcaster/MiniApp wallet */}
                {isFarcasterAvailable && (
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, color: textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                            Recommended
                        </div>
                        <button
                            onClick={handleFarcasterConnect}
                            disabled={!!connecting}
                            style={{
                                width: "100%",
                                padding: "14px 16px",
                                background: connecting === 'farcaster' 
                                    ? "linear-gradient(135deg, #6366f1, #8b5cf6)" 
                                    : "linear-gradient(135deg, #8b5cf6, #6366f1)",
                                border: "none",
                                borderRadius: 12,
                                color: "#fff",
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: connecting ? "not-allowed" : "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 12,
                                opacity: connecting && connecting !== 'farcaster' ? 0.5 : 1
                            }}
                        >
                            <span style={{ fontSize: 24 }}>🟣</span>
                            <div style={{ textAlign: "left" }}>
                                <div>Farcaster Wallet</div>
                                <div style={{ fontSize: 10, opacity: 0.8 }}>
                                    {connecting === 'farcaster' ? "Connecting..." : "Uses your Farcaster wallet settings"}
                                </div>
                            </div>
                        </button>
                    </div>
                )}

                {/* External Wallets */}
                {availableWallets.length > 0 && (
                    <div>
                        <div style={{ fontSize: 10, color: textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                            {isFarcasterAvailable ? "Other Wallets" : "Available Wallets"}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {availableWallets.map((wallet) => (
                                <button
                                    key={wallet.type}
                                    onClick={() => handleWalletConnect(wallet)}
                                    disabled={!!connecting}
                                    style={{
                                        width: "100%",
                                        padding: "12px 16px",
                                        background: cardBg,
                                        border: `1px solid ${connecting === wallet.type ? "#8b5cf6" : borderColor}`,
                                        borderRadius: 10,
                                        color: textPrimary,
                                        fontSize: 13,
                                        fontWeight: 500,
                                        cursor: connecting ? "not-allowed" : "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 12,
                                        opacity: connecting && connecting !== wallet.type ? 0.5 : 1,
                                        transition: "all 0.2s"
                                    }}
                                >
                                    <span style={{ fontSize: 22 }}>{wallet.icon}</span>
                                    <div style={{ flex: 1, textAlign: "left" }}>
                                        <div>{wallet.name}</div>
                                        {connecting === wallet.type && (
                                            <div style={{ fontSize: 10, color: "#8b5cf6" }}>Connecting...</div>
                                        )}
                                    </div>
                                    {connecting === wallet.type && (
                                        <div style={{ 
                                            width: 16, 
                                            height: 16, 
                                            border: "2px solid #8b5cf6",
                                            borderTopColor: "transparent",
                                            borderRadius: "50%",
                                            animation: "spin 1s linear infinite"
                                        }} />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* No wallets found */}
                {!isFarcasterAvailable && availableWallets.length === 0 && (
                    <div style={{ textAlign: "center", padding: 24, color: textMuted }}>
                        <div style={{ fontSize: 36, marginBottom: 12 }}>🔗</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary, marginBottom: 8 }}>
                            No Wallet Detected
                        </div>
                        <div style={{ fontSize: 12 }}>
                            Please install a Web3 wallet like MetaMask, Rabby, or Coinbase Wallet.
                        </div>
                    </div>
                )}

                {/* Info section */}
                <div style={{ marginTop: 20, padding: 12, background: cardBg, borderRadius: 8, border: `1px solid ${borderColor}` }}>
                    <div style={{ fontSize: 10, color: textMuted, textAlign: "center" }}>
                        🔒 Your wallet will connect to Base network
                    </div>
                </div>
            </div>

            {/* Spinner animation */}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
