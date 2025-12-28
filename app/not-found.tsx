// app/not-found.tsx
export default function NotFound() {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      backgroundColor: '#050812',
      color: 'white',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>404</h1>
      <p style={{ fontSize: '1.25rem', color: '#888' }}>Page not found</p>
      <a 
        href="/" 
        style={{ 
          marginTop: '2rem', 
          padding: '0.75rem 1.5rem', 
          backgroundColor: '#22c55e', 
          color: 'white', 
          borderRadius: '0.5rem',
          textDecoration: 'none'
        }}
      >
        Go Home
      </a>
    </div>
  );
}
