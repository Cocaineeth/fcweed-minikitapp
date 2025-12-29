"use client";

import dynamic from 'next/dynamic';

// Dynamically import the main app component with SSR disabled
const FCWeedApp = dynamic(
  () => import('./FCWeedApp').then(mod => mod.default),
  { 
    ssr: false,
    loading: () => (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#050812',
        color: '#c0c9f4',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌿</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>Loading FCWeed...</div>
        </div>
      </div>
    ),
  }
);

export default function Page() {
  return <FCWeedApp />;
}
