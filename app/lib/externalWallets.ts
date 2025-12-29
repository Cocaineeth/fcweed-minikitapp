// lib/externalWallets.ts
// External wallet support for Rabby, Phantom, Rainbow, MetaMask, etc.

import { ethers } from "ethers";

export type WalletType = 
    | 'farcaster'     // Farcaster SDK (primary)
    | 'coinbase'      // Coinbase Wallet
    | 'metamask'      // MetaMask
    | 'rabby'         // Rabby Wallet
    | 'phantom'       // Phantom
    | 'rainbow'       // Rainbow
    | 'walletconnect' // WalletConnect
    | 'injected'      // Generic injected
    | 'unknown';

export interface WalletInfo {
    type: WalletType;
    name: string;
    icon?: string;
    provider: any;
    isConnected: boolean;
}

export interface ConnectedWallet {
    type: WalletType;
    name: string;
    address: string;
    provider: ethers.providers.Web3Provider;
    signer: ethers.Signer;
    rawProvider: any;
}

// Detect all available wallets in the browser
export function detectAvailableWallets(): WalletInfo[] {
    if (typeof window === 'undefined') return [];
    
    const wallets: WalletInfo[] = [];
    const anyWindow = window as any;
    
    // Check for multiple provider scenario (EIP-6963 or providers array)
    const providers = anyWindow.ethereum?.providers || [];
    
    // Check Rabby first (often in providers array)
    const rabbyProvider = providers.find((p: any) => p.isRabby) || 
        (anyWindow.ethereum?.isRabby ? anyWindow.ethereum : null) ||
        anyWindow.rabby;
    if (rabbyProvider) {
        wallets.push({
            type: 'rabby',
            name: 'Rabby Wallet',
            icon: '🐰',
            provider: rabbyProvider,
            isConnected: false
        });
    }
    
    // Check Phantom
    const phantomProvider = anyWindow.phantom?.ethereum || 
        providers.find((p: any) => p.isPhantom) ||
        (anyWindow.ethereum?.isPhantom ? anyWindow.ethereum : null);
    if (phantomProvider) {
        wallets.push({
            type: 'phantom',
            name: 'Phantom',
            icon: '👻',
            provider: phantomProvider,
            isConnected: false
        });
    }
    
    // Check Rainbow
    const rainbowProvider = anyWindow.rainbow ||
        providers.find((p: any) => p.isRainbow) ||
        (anyWindow.ethereum?.isRainbow ? anyWindow.ethereum : null);
    if (rainbowProvider) {
        wallets.push({
            type: 'rainbow',
            name: 'Rainbow',
            icon: '🌈',
            provider: rainbowProvider,
            isConnected: false
        });
    }
    
    // Check MetaMask
    const metaMaskProvider = providers.find((p: any) => p.isMetaMask && !p.isRabby && !p.isPhantom) ||
        (anyWindow.ethereum?.isMetaMask && !anyWindow.ethereum?.isRabby ? anyWindow.ethereum : null);
    if (metaMaskProvider) {
        wallets.push({
            type: 'metamask',
            name: 'MetaMask',
            icon: '🦊',
            provider: metaMaskProvider,
            isConnected: false
        });
    }
    
    // Check Coinbase Wallet
    const coinbaseProvider = anyWindow.coinbaseWalletExtension ||
        providers.find((p: any) => p.isCoinbaseWallet) ||
        (anyWindow.ethereum?.isCoinbaseWallet ? anyWindow.ethereum : null);
    if (coinbaseProvider) {
        wallets.push({
            type: 'coinbase',
            name: 'Coinbase Wallet',
            icon: '💰',
            provider: coinbaseProvider,
            isConnected: false
        });
    }
    
    // Fallback to generic injected if we have ethereum but didn't match anything
    if (wallets.length === 0 && anyWindow.ethereum) {
        wallets.push({
            type: 'injected',
            name: 'Browser Wallet',
            icon: '🔗',
            provider: anyWindow.ethereum,
            isConnected: false
        });
    }
    
    return wallets;
}

// Get the primary/default wallet (what window.ethereum points to)
export function getPrimaryWallet(): WalletInfo | null {
    if (typeof window === 'undefined') return null;
    
    const anyWindow = window as any;
    if (!anyWindow.ethereum) return null;
    
    const eth = anyWindow.ethereum;
    
    let type: WalletType = 'unknown';
    let name = 'Browser Wallet';
    let icon = '🔗';
    
    if (eth.isRabby) {
        type = 'rabby';
        name = 'Rabby Wallet';
        icon = '🐰';
    } else if (eth.isPhantom) {
        type = 'phantom';
        name = 'Phantom';
        icon = '👻';
    } else if (eth.isRainbow) {
        type = 'rainbow';
        name = 'Rainbow';
        icon = '🌈';
    } else if (eth.isCoinbaseWallet) {
        type = 'coinbase';
        name = 'Coinbase Wallet';
        icon = '💰';
    } else if (eth.isMetaMask) {
        type = 'metamask';
        name = 'MetaMask';
        icon = '🦊';
    }
    
    return {
        type,
        name,
        icon,
        provider: eth,
        isConnected: false
    };
}

// Connect to a specific wallet
export async function connectWallet(
    wallet: WalletInfo,
    chainId: number = 8453 // Base mainnet
): Promise<ConnectedWallet | null> {
    try {
        const provider = wallet.provider;
        
        if (!provider) {
            console.error('[ExternalWallet] No provider for wallet:', wallet.type);
            return null;
        }
        
        console.log(`[ExternalWallet] Connecting to ${wallet.name}...`);
        
        // Request accounts
        let accounts: string[];
        try {
            accounts = await provider.request({ method: 'eth_requestAccounts' });
        } catch (err: any) {
            if (err.code === 4001) {
                console.log('[ExternalWallet] User rejected connection');
                return null;
            }
            throw err;
        }
        
        if (!accounts || accounts.length === 0) {
            console.error('[ExternalWallet] No accounts returned');
            return null;
        }
        
        const address = accounts[0];
        console.log(`[ExternalWallet] Connected: ${address}`);
        
        // Create ethers provider
        const web3Provider = new ethers.providers.Web3Provider(provider, 'any');
        const signer = web3Provider.getSigner();
        
        // Check chain and switch if necessary
        try {
            const network = await web3Provider.getNetwork();
            if (network.chainId !== chainId) {
                console.log(`[ExternalWallet] Wrong chain (${network.chainId}), switching to ${chainId}...`);
                await switchChain(provider, chainId);
                // Re-create provider after chain switch
                const newProvider = new ethers.providers.Web3Provider(provider, 'any');
                const newSigner = newProvider.getSigner();
                
                return {
                    type: wallet.type,
                    name: wallet.name,
                    address,
                    provider: newProvider,
                    signer: newSigner,
                    rawProvider: provider
                };
            }
        } catch (err) {
            console.warn('[ExternalWallet] Chain check failed:', err);
        }
        
        return {
            type: wallet.type,
            name: wallet.name,
            address,
            provider: web3Provider,
            signer,
            rawProvider: provider
        };
    } catch (err: any) {
        console.error('[ExternalWallet] Connection failed:', err);
        return null;
    }
}

// Switch to the correct chain
export async function switchChain(provider: any, chainId: number): Promise<boolean> {
    const hexChainId = '0x' + chainId.toString(16);
    
    try {
        await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: hexChainId }]
        });
        return true;
    } catch (switchError: any) {
        // Chain not added to wallet
        if (switchError.code === 4902) {
            try {
                await provider.request({
                    method: 'wallet_addEthereumChain',
                    params: [getChainConfig(chainId)]
                });
                return true;
            } catch (addError) {
                console.error('[ExternalWallet] Failed to add chain:', addError);
                return false;
            }
        }
        console.error('[ExternalWallet] Failed to switch chain:', switchError);
        return false;
    }
}

// Get chain configuration for wallet_addEthereumChain
function getChainConfig(chainId: number): any {
    const configs: Record<number, any> = {
        8453: {
            chainId: '0x2105',
            chainName: 'Base',
            nativeCurrency: {
                name: 'Ethereum',
                symbol: 'ETH',
                decimals: 18
            },
            rpcUrls: ['https://mainnet.base.org', 'https://base.publicnode.com'],
            blockExplorerUrls: ['https://basescan.org']
        },
        84532: {
            chainId: '0x14a34',
            chainName: 'Base Sepolia',
            nativeCurrency: {
                name: 'Ethereum',
                symbol: 'ETH',
                decimals: 18
            },
            rpcUrls: ['https://sepolia.base.org'],
            blockExplorerUrls: ['https://sepolia.basescan.org']
        }
    };
    
    return configs[chainId] || configs[8453];
}

// Disconnect wallet (where supported)
export async function disconnectWallet(wallet: ConnectedWallet): Promise<void> {
    try {
        // Some wallets support disconnect
        if (wallet.rawProvider?.disconnect) {
            await wallet.rawProvider.disconnect();
        }
        // For wallets that don't support disconnect, we just clear local state
        console.log('[ExternalWallet] Disconnected from', wallet.name);
    } catch (err) {
        console.warn('[ExternalWallet] Disconnect failed:', err);
    }
}

// Listen for account changes
export function onAccountsChanged(
    provider: any, 
    callback: (accounts: string[]) => void
): () => void {
    const handler = (accounts: string[]) => {
        console.log('[ExternalWallet] Accounts changed:', accounts);
        callback(accounts);
    };
    
    provider.on?.('accountsChanged', handler);
    
    return () => {
        provider.removeListener?.('accountsChanged', handler);
    };
}

// Listen for chain changes
export function onChainChanged(
    provider: any,
    callback: (chainId: string) => void
): () => void {
    const handler = (chainId: string) => {
        console.log('[ExternalWallet] Chain changed:', chainId);
        callback(chainId);
    };
    
    provider.on?.('chainChanged', handler);
    
    return () => {
        provider.removeListener?.('chainChanged', handler);
    };
}

// Listen for disconnect
export function onDisconnect(
    provider: any,
    callback: (error: any) => void
): () => void {
    const handler = (error: any) => {
        console.log('[ExternalWallet] Disconnected:', error);
        callback(error);
    };
    
    provider.on?.('disconnect', handler);
    
    return () => {
        provider.removeListener?.('disconnect', handler);
    };
}

// Check if wallet supports sponsored transactions (EIP-5792)
export async function checkSponsorshipSupport(
    provider: any,
    address: string
): Promise<boolean> {
    try {
        const capabilities = await provider.request({
            method: 'wallet_getCapabilities',
            params: [address]
        });
        
        // Check for paymasterService on Base (chainId 8453 = 0x2105)
        return !!(
            capabilities?.['0x2105']?.paymasterService?.supported ||
            capabilities?.['8453']?.paymasterService?.supported
        );
    } catch {
        return false;
    }
}

// Send transaction with optional sponsorship
export async function sendTransaction(
    wallet: ConnectedWallet,
    to: string,
    data: string,
    options?: {
        value?: string;
        gasLimit?: string;
        paymasterUrl?: string;
    }
): Promise<ethers.providers.TransactionResponse | null> {
    const { value = '0x0', gasLimit = '0x4C4B40', paymasterUrl } = options || {};
    
    try {
        // Try sponsored transaction if paymaster URL provided
        if (paymasterUrl) {
            const supportsSponsorship = await checkSponsorshipSupport(
                wallet.rawProvider, 
                wallet.address
            );
            
            if (supportsSponsorship) {
                console.log('[ExternalWallet] Attempting sponsored transaction...');
                const result = await wallet.rawProvider.request({
                    method: 'wallet_sendCalls',
                    params: [{
                        version: '1.0',
                        chainId: '0x2105',
                        from: wallet.address,
                        calls: [{ to, data, value }],
                        capabilities: {
                            paymasterService: { url: paymasterUrl }
                        }
                    }]
                });
                
                if (result && typeof result === 'string') {
                    return { hash: result } as any;
                }
            }
        }
        
        // Regular transaction
        const tx = await wallet.signer.sendTransaction({
            to,
            data,
            value: ethers.BigNumber.from(value),
            gasLimit: ethers.BigNumber.from(gasLimit)
        });
        
        return tx;
    } catch (err: any) {
        console.error('[ExternalWallet] Transaction failed:', err);
        throw err;
    }
}
