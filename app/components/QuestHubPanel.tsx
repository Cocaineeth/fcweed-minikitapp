"use client";

import { useState } from "react";
import { ReferralsPanel } from "./ReferralsPanel";
import { QuestsPanel } from "./QuestsPanel";

type HubTab = "quests" | "referrals";

function TabButton(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        flex: 1,
        padding: "10px 6px",
        borderRadius: 12,
        border: props.active ? "1px solid rgba(59,130,246,0.7)" : "1px solid rgba(107,114,128,0.35)",
        background: props.active ? "rgba(59,130,246,0.18)" : "rgba(5,8,20,0.25)",
        color: props.active ? "#3b82f6" : "#9ca3af",
        fontWeight: 800,
        fontSize: 11,
        cursor: "pointer",
        letterSpacing: 0.3,
      }}
    >
      {props.label}
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
    <section style={{ maxWidth: 520, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          padding: 10,
          borderRadius: 16,
          border: "1px solid rgba(59,130,246,0.25)",
          background: "linear-gradient(135deg, rgba(15,23,42,0.8), rgba(5,8,20,0.75))",
        }}
      >
        <TabButton label="🎯 QUESTS" active={tab === "quests"} onClick={() => setTab("quests")} />
        <TabButton label="👥 REFERRALS" active={tab === "referrals"} onClick={() => setTab("referrals")} />
      </div>

      {tab === "quests" && (
        <QuestsPanel
          connected={props.connected}
          userAddress={props.userAddress}
          signer={props.signer}
          chainId={props.chainId}
          backendBaseUrl={props.backendBaseUrl}
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
    </section>
  );
}
