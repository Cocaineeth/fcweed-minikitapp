"use client";

import { useState } from "react";
import { ReferralsPanel } from "./ReferralsPanel";
import { QuestsPanel } from "./QuestsPanel";
import { SocialTasksPanel } from "./SocialTasksPanel";

type HubTab = "quests" | "social" | "referrals";

const tabConfig = {
  quests: { icon: "🎯", label: "QUESTS", color: "#60a5fa", border: "rgba(59,130,246,0.5)" },
  social: { icon: "📱", label: "SOCIAL", color: "#a78bfa", border: "rgba(139,92,246,0.5)" },
  referrals: { icon: "👥", label: "REFERRALS", color: "#fbbf24", border: "rgba(251,191,36,0.5)" },
};

function TabButton(props: { tab: HubTab; active: boolean; onClick: () => void }) {
  const cfg = tabConfig[props.tab];
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        flex: 1,
        padding: "12px 8px",
        borderRadius: 14,
        border: props.active ? `1px solid ${cfg.border}` : "1px solid rgba(107,114,128,0.25)",
        background: props.active 
          ? `linear-gradient(135deg, ${cfg.color}25, ${cfg.color}10)` 
          : "rgba(5,8,20,0.4)",
        color: props.active ? cfg.color : "#6b7280",
        fontWeight: 800,
        fontSize: 11,
        cursor: "pointer",
        letterSpacing: 0.5,
        transition: "all 0.2s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        boxShadow: props.active ? `0 0 20px ${cfg.color}20` : "none",
      }}
    >
      <span style={{ fontSize: 13 }}>{cfg.icon}</span>
      <span>{cfg.label}</span>
    </button>
  );
}

export function QuestHubPanel(props: {
  connected: boolean;
  userAddress?: string;
  signer: any;
  chainId: number;
  backendBaseUrl: string;
  theme?: "light" | "dark";
}) {
  const [tab, setTab] = useState<HubTab>("quests");

  return (
    <section style={{ maxWidth: 540, margin: "0 auto" }}>
      {/* Tab Navigation */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          padding: 8,
          borderRadius: 18,
          border: "1px solid rgba(107,114,128,0.2)",
          background: "linear-gradient(145deg, rgba(15,23,42,0.9), rgba(5,8,20,0.95))",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        <TabButton tab="quests" active={tab === "quests"} onClick={() => setTab("quests")} />
        <TabButton tab="social" active={tab === "social"} onClick={() => setTab("social")} />
        <TabButton tab="referrals" active={tab === "referrals"} onClick={() => setTab("referrals")} />
      </div>

      {/* Tab Content */}
      <div style={{ 
        animation: "fadeIn 0.2s ease",
      }}>
        {tab === "quests" && (
          <QuestsPanel
            connected={props.connected}
            userAddress={props.userAddress}
            signer={props.signer}
            chainId={props.chainId}
            backendBaseUrl={props.backendBaseUrl}
          />
        )}

        {tab === "social" && (
          <SocialTasksPanel
            connected={props.connected}
            userAddress={props.userAddress}
            signer={props.signer}
            chainId={props.chainId}
            backendBaseUrl={props.backendBaseUrl}
            theme={props.theme}
          />
        )}

        {tab === "referrals" && (
          <ReferralsPanel
            connected={props.connected}
            userAddress={props.userAddress}
            signer={props.signer}
            chainId={props.chainId}
            backendBaseUrl={props.backendBaseUrl}
          />
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}
