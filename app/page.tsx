import dynamic from "next/dynamic";

// Completely disable SSR for the entire app
// This is necessary because MiniKitProvider requires browser context
const App = dynamic(() => import("./App"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#050812",
        color: "#c0c9f4",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🌿</div>
        <div style={{ fontSize: "18px", fontWeight: "bold" }}>Loading FCWeed...</div>
      </div>
    </div>
  ),
});

export default function Page() {
  return <App />;
}
