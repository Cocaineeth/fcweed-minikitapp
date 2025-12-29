// hooks/useWagmiTransaction.ts
"use client";

import { useAccount, useConnect, useSendTransaction, usePublicClient, useWalletClient } from 'wagmi';
import { useCallback, useEffect, useState } from 'react';
import { type Hex } from 'viem';
import { base } from 'wagmi/chains';

export interface TransactionResult {
  hash: string;
  wait: () => Promise<any>;
}

// Dummy hook for SSR - returns empty/disabled state
function useWagmiTransactionSSR() {
  return {
    address: undefined,
    isConnected: false,
    isReady: false,
    isPending: false,
    connectionError: null,
    chain: undefined,
    ensureWallet: async () => null,
    sendContractTx: async () => null,
    sendWalletCalls: async () => null,
    connect: () => Promise.reject('SSR'),
  };
}

// Actual hook implementation
function useWagmiTransactionClient() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors } = useConnect();
  const { sendTransactionAsync, isPending } = useSendTransaction();
  const publicClient = usePublicClient();
  
  const [isReady, setIsReady] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Auto-connect on mount if not connected
  useEffect(() => {
    const autoConnect = async () => {
      if (!isConnected && connectors.length > 0) {
        try {
          console.log('[Wagmi] Auto-connecting...');
          await connect({ connector: connectors[0] });
          console.log('[Wagmi] Auto-connected successfully');
        } catch (err: any) {
          console.warn('[Wagmi] Auto-connect failed:', err?.message);
        }
      }
      setIsReady(true);
    };
    
    autoConnect();
  }, [isConnected, connect, connectors]);

  // Ensure wallet is connected
  const ensureWallet = useCallback(async (): Promise<{ address: string } | null> => {
    if (isConnected && address) {
      return { address };
    }

    if (connectors.length === 0) {
      setConnectionError('No wallet connectors available');
      return null;
    }

    try {
      console.log('[Wagmi] Connecting wallet...');
      await connect({ connector: connectors[0] });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (address) {
        console.log('[Wagmi] Connected:', address);
        return { address };
      }
      
      setConnectionError('Failed to get wallet address');
      return null;
    } catch (err: any) {
      console.error('[Wagmi] Connection error:', err);
      setConnectionError(err?.message || 'Failed to connect wallet');
      return null;
    }
  }, [isConnected, address, connect, connectors]);

  // Send a contract transaction
  const sendContractTx = useCallback(async (
    to: string,
    data: string,
    gasLimit?: string
  ): Promise<TransactionResult | null> => {
    console.log('[Wagmi] sendContractTx called');
    console.log('[Wagmi] To:', to);
    console.log('[Wagmi] Chain:', chain?.id);

    const wallet = await ensureWallet();
    if (!wallet) {
      console.error('[Wagmi] No wallet connected');
      return null;
    }

    try {
      console.log('[Wagmi] Sending transaction...');
      
      const hash = await sendTransactionAsync({
        to: to as Hex,
        data: data as Hex,
        chainId: base.id,
      });

      console.log('[Wagmi] Transaction hash:', hash);

      return {
        hash,
        wait: async () => {
          if (!publicClient) {
            console.warn('[Wagmi] No public client for receipt');
            return null;
          }
          
          console.log('[Wagmi] Waiting for receipt...');
          
          try {
            const receipt = await publicClient.waitForTransactionReceipt({
              hash,
              confirmations: 1,
              timeout: 60_000,
            });
            
            console.log('[Wagmi] Got receipt:', receipt.status);
            
            return {
              ...receipt,
              confirmations: 1,
              status: receipt.status === 'success' ? 1 : 0,
            };
          } catch (err) {
            console.error('[Wagmi] Wait for receipt error:', err);
            return null;
          }
        },
      };
    } catch (err: any) {
      console.error('[Wagmi] Transaction error:', err);
      
      if (err?.message?.includes('rejected') || err?.message?.includes('denied')) {
        throw new Error('Transaction rejected');
      }
      
      throw err;
    }
  }, [ensureWallet, sendTransactionAsync, publicClient, chain]);

  // Send raw wallet call
  const sendWalletCalls = useCallback(async (
    from: string,
    to: string,
    data: string,
    gasLimit?: string
  ): Promise<TransactionResult | null> => {
    return sendContractTx(to, data, gasLimit);
  }, [sendContractTx]);

  return {
    address,
    isConnected,
    isReady,
    isPending,
    connectionError,
    chain,
    ensureWallet,
    sendContractTx,
    sendWalletCalls,
    connect: () => connectors.length > 0 ? connect({ connector: connectors[0] }) : Promise.reject('No connectors'),
  };
}

// Export a hook that checks for SSR
export function useWagmiTransaction() {
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  // During SSR or before mount, return dummy values
  const ssrHook = useWagmiTransactionSSR();
  const clientHook = useWagmiTransactionClient();
  
  // Return SSR-safe values until mounted
  if (!isMounted) {
    return ssrHook;
  }
  
  return clientHook;
}
