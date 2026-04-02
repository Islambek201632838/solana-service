import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import PoolStats from "../components/dashboard/PoolStats";
import ProtocolMoodBadge from "../components/dashboard/ProtocolMoodBadge";
import AiDecisionCard from "../components/dashboard/AiDecisionCard";
import BottomNav from "../components/layout/BottomNav";
import MobileDrawer from "../components/layout/MobileDrawer";

describe("PoolStats", () => {
  it("renders loading skeleton", () => {
    const { container } = render(<PoolStats stats={null} loading={true} />);
    expect(container.querySelectorAll(".animate-pulse").length).toBe(4);
  });

  it("renders no-pool message when stats is null", () => {
    render(<PoolStats stats={null} loading={false} />);
    expect(screen.getByText(/Pool not connected/)).toBeTruthy();
  });

  it("renders stats grid with data", () => {
    const stats = {
      total_deposits_usd: 5000,
      total_borrows_usd: 2000,
      available_liquidity_usd: 3000,
      utilization_pct: 40,
      interest_rate_pct: 5,
      collateral_ratio_pct: 150,
      total_ai_updates: 12,
      total_liquidations: 1,
    };
    render(<PoolStats stats={stats} loading={false} />);
    expect(screen.getByText("$5,000")).toBeTruthy();
    expect(screen.getByText("5.00%")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
  });
});

describe("ProtocolMoodBadge", () => {
  it("renders mood text", () => {
    render(<ProtocolMoodBadge mood="Thriving" />);
    expect(screen.getByText("Thriving")).toBeTruthy();
  });

  it("shows FROZEN badge when frozen", () => {
    render(<ProtocolMoodBadge mood="Emergency" frozen={true} />);
    expect(screen.getByText("FROZEN")).toBeTruthy();
    expect(screen.getByText("Emergency")).toBeTruthy();
  });

  it("hides FROZEN badge when not frozen", () => {
    render(<ProtocolMoodBadge mood="Calm" frozen={false} />);
    expect(screen.queryByText("FROZEN")).toBeNull();
  });
});

describe("AiDecisionCard", () => {
  const decision = {
    id: 1,
    timestamp: "2026-04-01T12:00:00",
    old_rate: 500,
    new_rate: 550,
    reasoning: "RSI=65, bullish MACD crossover",
    confidence: 85,
    risk_level: "medium",
    tx_signature: "abc123",
  };

  it("renders rate change", () => {
    render(<AiDecisionCard decision={decision} />);
    expect(screen.getByText("5.50%")).toBeTruthy();
    expect(screen.getByText("+0.50%")).toBeTruthy();
  });

  it("renders reasoning", () => {
    render(<AiDecisionCard decision={decision} />);
    expect(screen.getByText(/RSI=65/)).toBeTruthy();
  });

  it("renders tx link", () => {
    render(<AiDecisionCard decision={decision} />);
    expect(screen.getByText("View TX")).toBeTruthy();
  });

  it("hides tx link when no signature", () => {
    render(<AiDecisionCard decision={{ ...decision, tx_signature: undefined }} />);
    expect(screen.queryByText("View TX")).toBeNull();
  });
});

describe("BottomNav", () => {
  it("renders all tabs", () => {
    render(<BottomNav active="dashboard" onChange={() => {}} />);
    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.getByText("AI Log")).toBeTruthy();
    expect(screen.getByText("Charts")).toBeTruthy();
  });

  it("highlights active tab", () => {
    const { container } = render(<BottomNav active="decisions" onChange={() => {}} />);
    const buttons = container.querySelectorAll("button");
    expect(buttons[1].className).toContain("text-purple-400");
  });
});

describe("MobileDrawer", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<MobileDrawer open={false} onClose={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nav links when open", () => {
    render(<MobileDrawer open={true} onClose={() => {}} />);
    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.getByText("AI Decisions")).toBeTruthy();
    expect(screen.getByText("Analytics")).toBeTruthy();
  });
});
