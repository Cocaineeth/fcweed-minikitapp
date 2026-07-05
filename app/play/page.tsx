"use client";

import dynamic from "next/dynamic";

const App = dynamic(() => import("../App"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#050812",
        color: "#f2496b",
        fontWeight: 800,
        letterSpacing: "0.4em",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      CARTEL
    </div>
  ),
});

export default function PlayPage() {
  return <App />;
}
