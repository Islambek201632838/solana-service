const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: #0a0a1a;
    color: #e5e7eb;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 40px 50px;
    position: relative;
    background: linear-gradient(135deg, #0f0f2e 0%, #0a0a1a 50%, #1a0a2e 100%);
    page-break-after: always;
    overflow: hidden;
  }
  .page:last-child { page-break-after: avoid; }

  .page::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, #9945FF, #14F195, #9945FF);
  }
  .page::after {
    content: '';
    position: absolute; top: 0; left: 0; bottom: 0; width: 3px;
    background: linear-gradient(180deg, #9945FF, #14F195);
  }

  /* ── Cover ── */
  .cover {
    display: flex; flex-direction: column;
    justify-content: center; align-items: center;
    text-align: center;
    min-height: calc(297mm - 80px);
  }
  .cover-frame {
    border: 1px solid #2a2a50;
    border-radius: 20px;
    padding: 50px 60px;
    position: relative;
    background: rgba(153, 69, 255, 0.03);
  }
  .cover-frame::before {
    content: '';
    position: absolute; inset: 3px;
    border: 1px solid rgba(153, 69, 255, 0.12);
    border-radius: 18px;
  }
  .cover-label {
    font-size: 12px; font-weight: 600;
    color: #6b7280; letter-spacing: 3px;
    margin-bottom: 16px;
  }
  .cover-title {
    font-size: 44px; font-weight: 900;
    background: linear-gradient(135deg, #9945FF, #14F195);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    margin-bottom: 8px;
  }
  .cover-line {
    width: 180px; height: 2px; margin: 16px auto;
    background: linear-gradient(90deg, #14F195, #9945FF);
  }
  .cover-subtitle { font-size: 18px; color: #e5e7eb; margin-bottom: 6px; }
  .cover-desc { font-size: 13px; color: #6b7280; }

  .badges { display: flex; gap: 10px; justify-content: center; margin: 24px 0; flex-wrap: wrap; }
  .badge {
    display: inline-block; padding: 5px 14px; border-radius: 20px;
    font-size: 11px; font-weight: 600; border: 1px solid;
  }
  .badge-purple { color: #9945FF; border-color: rgba(153,69,255,0.35); background: rgba(153,69,255,0.08); }
  .badge-cyan { color: #14F195; border-color: rgba(20,241,149,0.35); background: rgba(20,241,149,0.08); }
  .badge-green { color: #22c55e; border-color: rgba(34,197,94,0.35); background: rgba(34,197,94,0.08); }
  .badge-orange { color: #f59e0b; border-color: rgba(245,158,11,0.35); background: rgba(245,158,11,0.08); }
  .badge-red { color: #ef4444; border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.08); }

  .live-box {
    background: rgba(20,241,149,0.06);
    border: 1px solid rgba(20,241,149,0.2);
    border-radius: 10px; padding: 10px 30px;
    margin: 20px auto; display: inline-block;
  }
  .live-box a { color: #14F195; font-size: 13px; text-decoration: none; font-weight: 600; }

  .cover-footer { margin-top: 30px; }
  .cover-footer p { font-size: 11px; color: #4b5563; margin: 4px 0; }
  .cover-footer .gh { color: #9945FF; }

  /* ── Section Headers ── */
  .section-header {
    display: flex; align-items: center; gap: 16px;
    margin-bottom: 20px; margin-top: 8px;
  }
  .time-badge {
    padding: 5px 14px; border-radius: 6px;
    font-size: 12px; font-weight: 700;
    white-space: nowrap; flex-shrink: 0;
  }
  .time-purple { background: #9945FF; color: #0a0a1a; }
  .time-cyan { background: #14F195; color: #0a0a1a; }
  .time-orange { background: #f59e0b; color: #0a0a1a; }
  .time-red { background: #ef4444; color: #0a0a1a; }
  .time-green { background: #22c55e; color: #0a0a1a; }

  .section-title {
    font-size: 22px; font-weight: 700; color: #fff;
  }

  /* ── Speech Block ── */
  .speech {
    background: rgba(153,69,255,0.04);
    border: 1px solid rgba(153,69,255,0.2);
    border-left: 3px solid #9945FF;
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 20px;
    position: relative;
  }
  .speech::before {
    content: '\\201C';
    font-size: 36px; color: rgba(153,69,255,0.25);
    position: absolute; top: 2px; left: 10px; line-height: 1;
  }
  .speech p {
    font-size: 12.5px; line-height: 1.7; color: #d1d5db;
    padding-left: 16px;
  }

  /* ── Action Items ── */
  .action-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
  .action-item {
    display: flex; align-items: flex-start; gap: 14px;
  }
  .action-tag {
    padding: 3px 10px; border-radius: 5px;
    font-size: 9px; font-weight: 700;
    white-space: nowrap; flex-shrink: 0;
    margin-top: 2px; min-width: 48px; text-align: center;
    letter-spacing: 0.5px;
  }
  .tag-show { background: rgba(20,241,149,0.15); color: #14F195; }
  .tag-say { background: rgba(153,69,255,0.15); color: #c084fc; }
  .tag-point { background: rgba(245,158,11,0.15); color: #f59e0b; }
  .tag-click { background: rgba(239,68,68,0.15); color: #ef4444; }
  .action-text { font-size: 12px; line-height: 1.6; color: #d1d5db; }

  /* ── Divider ── */
  .divider {
    border: none; border-top: 1px solid rgba(255,255,255,0.06);
    margin: 24px 0;
  }

  /* ── Cards ── */
  .card {
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 18px 20px;
    margin-bottom: 14px;
  }
  .card-title { font-size: 14px; font-weight: 700; margin-bottom: 6px; }

  /* ── Safety Layers ── */
  .layers { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
  .layer {
    display: flex; align-items: center; gap: 14px;
    background: rgba(255,255,255,0.02);
    border-radius: 8px; padding: 10px 14px;
    border: 1px solid rgba(255,255,255,0.04);
  }
  .layer-num {
    width: 28px; height: 28px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 800; flex-shrink: 0;
  }
  .layer-title { font-size: 12px; font-weight: 700; min-width: 90px; }
  .layer-desc { font-size: 11px; color: #9ca3af; }

  /* ── Feature Cards ── */
  .features { display: flex; flex-direction: column; gap: 14px; }
  .feature-card {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    padding: 16px 20px;
  }
  .feature-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .feature-title { font-size: 15px; font-weight: 700; }
  .feature-desc { font-size: 11.5px; line-height: 1.6; color: #9ca3af; }
  .feature-action {
    font-size: 11px; margin-top: 8px; font-weight: 500;
  }

  /* ── Container Row ── */
  .container-row {
    display: flex; gap: 10px; margin-bottom: 16px;
  }
  .container-box {
    flex: 1; text-align: center;
    border-radius: 10px; padding: 12px 8px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
  }
  .container-name { font-size: 11px; font-weight: 700; margin-bottom: 4px; }
  .container-desc { font-size: 9px; color: #6b7280; }

  /* ── Resilience Box ── */
  .resilience {
    background: rgba(20,241,149,0.03);
    border: 1px solid rgba(20,241,149,0.15);
    border-radius: 10px;
    padding: 14px 18px;
    margin-bottom: 20px;
  }
  .resilience-title { color: #14F195; font-size: 13px; font-weight: 700; margin-bottom: 6px; }
  .resilience p { font-size: 11.5px; line-height: 1.7; color: #d1d5db; }

  /* ── Closing ── */
  .closing-box {
    text-align: center;
    background: rgba(153,69,255,0.05);
    border: 1px solid rgba(153,69,255,0.2);
    border-radius: 14px;
    padding: 24px 30px;
    margin-bottom: 24px;
  }
  .closing-quote {
    font-size: 18px; font-weight: 700; color: #9945FF;
    margin-bottom: 8px;
  }
  .closing-sub { font-size: 13px; color: #d1d5db; margin-bottom: 12px; }
  .closing-links a { font-size: 12px; text-decoration: none; display: block; margin: 4px 0; }

  /* ── Screenshots ── */
  .screenshots { margin-top: 20px; }
  .screenshots h3 { font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 14px; }
  .screenshot-list {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  }
  .screenshot-item {
    display: flex; align-items: center; gap: 10px;
    background: rgba(255,255,255,0.02);
    border-radius: 6px; padding: 8px 12px;
    border: 1px solid rgba(255,255,255,0.04);
  }
  .screenshot-num {
    font-size: 14px; font-weight: 800; color: #14F195;
    min-width: 20px;
  }
  .screenshot-text { font-size: 10.5px; color: #9ca3af; }

  /* ── Page Footer ── */
  .page-footer {
    position: absolute; bottom: 20px; left: 50px; right: 50px;
    display: flex; justify-content: space-between;
    font-size: 10px; color: #4b5563;
    border-top: 1px solid rgba(255,255,255,0.05);
    padding-top: 10px;
  }

  @media print {
    body { background: #0a0a1a; }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: avoid; }
  }
</style>
</head>
<body>

<!-- ═══════ PAGE 1: COVER ═══════ -->
<div class="page">
  <div class="cover">
    <div class="cover-frame">
      <div class="cover-label">DEMO SCRIPT</div>
      <div class="cover-title">SolanaAI Lend</div>
      <div class="cover-line"></div>
      <div class="cover-subtitle">3-Minute Video Demo Script</div>
      <div class="cover-desc">AI-Powered Autonomous Lending on Solana</div>
      <div class="badges">
        <span class="badge badge-purple">Gemini AI</span>
        <span class="badge badge-cyan">6 ML Models</span>
        <span class="badge badge-green">Guard Rails</span>
        <span class="badge badge-orange">Live Devnet</span>
      </div>
      <div class="live-box"><a>Live: http://89.207.255.254</a></div>
    </div>
    <div class="cover-footer">
      <p>National Solana Hackathon by Decentrathon 2026</p>
      <p class="gh">github.com/Islambek201632838/solana-service</p>
    </div>
  </div>
</div>

<!-- ═══════ PAGE 2: OPENING + DASHBOARD ═══════ -->
<div class="page">
  <div class="section-header">
    <span class="time-badge time-purple">0:00 — 0:15</span>
    <span class="section-title">Opening</span>
  </div>
  <div class="speech">
    <p>SolanaAI Lend — an autonomous AI-powered lending protocol on Solana.
    AI manages interest rates, collateral ratios, and borrow limits in real time,
    while the smart contract enforces strict safety guardrails.
    Let me show you how it works.</p>
  </div>

  <hr class="divider">

  <div class="section-header">
    <span class="time-badge time-cyan">0:15 — 0:45</span>
    <span class="section-title">Dashboard Overview</span>
  </div>
  <div class="action-list">
    <div class="action-item">
      <span class="action-tag tag-show">SHOW</span>
      <span class="action-text">Interest rate, total deposits, total borrows, SOL price, utilization %</span>
    </div>
    <div class="action-item">
      <span class="action-tag tag-say">SAY</span>
      <span class="action-text">"Here's our live dashboard. The protocol is running on Solana devnet right now."</span>
    </div>
    <div class="action-item">
      <span class="action-tag tag-point">POINT</span>
      <span class="action-text">Protocol Mood badge: "This mood indicator — Calm, Cautious, Stressed, or Crisis — reflects the AI's real-time risk assessment."</span>
    </div>
    <div class="action-item">
      <span class="action-tag tag-point">POINT</span>
      <span class="action-text">Insurance Fund: "10% of all interest flows into this insurance fund to cover bad debt — just like production protocols."</span>
    </div>
    <div class="action-item">
      <span class="action-tag tag-show">SHOW</span>
      <span class="action-text">Health Factor bar, Liquidation Queue widget</span>
    </div>
    <div class="action-item">
      <span class="action-tag tag-say">SAY</span>
      <span class="action-text">"Users can see their position health and liquidation risk at a glance."</span>
    </div>
  </div>

  <hr class="divider">

  <div class="section-header">
    <span class="time-badge time-orange">0:45 — 1:20</span>
    <span class="section-title">AI Decisions Page</span>
  </div>
  <div class="action-list">
    <div class="action-item">
      <span class="action-tag tag-click">CLICK</span>
      <span class="action-text">"AI Decisions" in navigation</span>
    </div>
    <div class="action-item">
      <span class="action-tag tag-show">SHOW</span>
      <span class="action-text">A decision card with full details</span>
    </div>
    <div class="action-item">
      <span class="action-tag tag-say">SAY</span>
      <span class="action-text">"Every 2 minutes, the AI agent runs a complete analysis pipeline: 5 technical indicators — RSI, MACD, Bollinger Bands, ATR, EMA — plus 6 ML models for trend prediction, anomaly detection, volatility regime, crash probability, risk scoring, and utilization forecasting."</span>
    </div>
    <div class="action-item">
      <span class="action-tag tag-point">POINT</span>
      <span class="action-text">Reasoning text: "Gemini 2.0 Flash generates a human-readable explanation for every decision — in English and Russian."</span>
    </div>
    <div class="action-item">
      <span class="action-tag tag-show">SHOW</span>
      <span class="action-text">Model Performance widget: "The AI tracks each model's accuracy over time and dynamically adjusts their weights. A model that's been wrong loses influence; one that's been right gains it. Self-improving AI."</span>
    </div>
    <div class="action-item">
      <span class="action-tag tag-click">CLICK</span>
      <span class="action-text">"View TX" → Solana Explorer: "Every parameter change is an on-chain transaction — fully verifiable."</span>
    </div>
  </div>
  <div class="page-footer">
    <span>SolanaAI Lend — Demo Script</span>
    <span>2 / 5</span>
  </div>
</div>

<!-- ═══════ PAGE 3: SAFETY ARCHITECTURE ═══════ -->
<div class="page">
  <div class="section-header">
    <span class="time-badge time-red">1:20 — 1:50</span>
    <span class="section-title">Safety Architecture</span>
  </div>

  <div class="card" style="border-color: rgba(34,197,94,0.2); background: rgba(34,197,94,0.03); margin-bottom: 16px;">
    <p style="font-size: 12.5px; color: #22c55e; font-weight: 500;">"What makes this different from 'trust the AI' is our 7-layer safety system:"</p>
  </div>

  <div class="layers">
    <div class="layer">
      <div class="layer-num" style="background: rgba(153,69,255,0.15); color: #9945FF;">1</div>
      <div class="layer-title" style="color: #9945FF;">Prompt</div>
      <div class="layer-desc">Prompt engineering constrains Gemini's output format.</div>
    </div>
    <div class="layer">
      <div class="layer-num" style="background: rgba(20,241,149,0.15); color: #14F195;">2</div>
      <div class="layer-title" style="color: #14F195;">Validator</div>
      <div class="layer-desc">A validator checks 11 rules — rate bounds, collateral bounds, max change per update.</div>
    </div>
    <div class="layer">
      <div class="layer-num" style="background: rgba(20,241,149,0.15); color: #14F195;">3</div>
      <div class="layer-title" style="color: #14F195;">Contract</div>
      <div class="layer-desc">The smart contract enforces the same limits on-chain — impossible to bypass.</div>
    </div>
    <div class="layer">
      <div class="layer-num" style="background: rgba(239,68,68,0.15); color: #ef4444;">4</div>
      <div class="layer-title" style="color: #ef4444;">AI Freeze</div>
      <div class="layer-desc">AI can emergency-freeze the protocol if crash probability exceeds 80%.</div>
    </div>
    <div class="layer">
      <div class="layer-num" style="background: rgba(245,158,11,0.15); color: #f59e0b;">5</div>
      <div class="layer-title" style="color: #f59e0b;">Auto-Rate</div>
      <div class="layer-desc">If the AI agent dies, the contract has an auto-rate mechanism to protect liquidity.</div>
    </div>
    <div class="layer">
      <div class="layer-num" style="background: rgba(34,197,94,0.15); color: #22c55e;">6</div>
      <div class="layer-title" style="color: #22c55e;">Insurance</div>
      <div class="layer-desc">Insurance fund covers bad debt from failed liquidations.</div>
    </div>
    <div class="layer">
      <div class="layer-num" style="background: rgba(153,69,255,0.15); color: #9945FF;">7</div>
      <div class="layer-title" style="color: #9945FF;">Guardrail PDA</div>
      <div class="layer-desc">Guardrail parameters are stored in a separate PDA — only authority can modify.</div>
    </div>
  </div>

  <div class="card" style="border-color: rgba(245,158,11,0.15); background: rgba(245,158,11,0.03);">
    <p style="font-size: 11px; color: #f59e0b;">Show log: "CooldownActive — the contract rejected an update because the cooldown hadn't passed. The AI doesn't get to override safety."</p>
  </div>
  <div class="page-footer">
    <span>SolanaAI Lend — Demo Script</span>
    <span>3 / 5</span>
  </div>
</div>

<!-- ═══════ PAGE 4: SMART FEATURES ═══════ -->
<div class="page">
  <div class="section-header">
    <span class="time-badge time-purple">1:50 — 2:30</span>
    <span class="section-title">Smart Features</span>
  </div>

  <div class="features">
    <div class="feature-card" style="border-color: rgba(245,158,11,0.15);">
      <div class="feature-header">
        <span class="feature-title" style="color: #fff;">Dynamic LTV</span>
        <span class="badge badge-orange">VOLATILITY-AWARE</span>
      </div>
      <div class="feature-desc">"AI automatically adjusts collateral requirements based on volatility. In calm markets — lower collateral to attract borrowers. In a storm — collateral goes up 10-20% to protect the pool."</div>
      <div class="feature-action" style="color: #f59e0b;">→ Show LTV Mode badge (Calm / Normal / Storm / Extreme)</div>
    </div>
    <div class="feature-card" style="border-color: rgba(20,241,149,0.15);">
      <div class="feature-header">
        <span class="feature-title" style="color: #fff;">Credit Score</span>
        <span class="badge badge-cyan">ON-CHAIN IDENTITY</span>
      </div>
      <div class="feature-desc">"Every wallet gets an on-chain credit score based on 5 factors: account age, transaction count, repayment history, liquidation record, and position size."</div>
      <div class="feature-action" style="color: #14F195;">→ Show Credit Score widget: "Platinum users get 15% lower collateral and 10% lower rates."</div>
    </div>
    <div class="feature-card" style="border-color: rgba(239,68,68,0.15);">
      <div class="feature-header">
        <span class="feature-title" style="color: #fff;">Crash Detection</span>
        <span class="badge badge-red">6 SIGNALS</span>
      </div>
      <div class="feature-desc">"Six signals — price momentum, volume spikes, consecutive red candles, SMA deviation, short-term volatility, and trend acceleration — feed into a crash probability score. Above 80%? The AI freezes the protocol automatically."</div>
    </div>
    <div class="feature-card" style="border-color: rgba(153,69,255,0.15);">
      <div class="feature-header">
        <span class="feature-title" style="color: #fff;">Liquidation Predictor</span>
        <span class="badge badge-purple">MONTE CARLO</span>
      </div>
      <div class="feature-desc">"Monte Carlo simulation with 500 price paths predicts liquidation probability at 1-hour, 4-hour, and 24-hour horizons. Users get warnings before they're in danger."</div>
    </div>
  </div>
  <div class="page-footer">
    <span>SolanaAI Lend — Demo Script</span>
    <span>4 / 5</span>
  </div>
</div>

<!-- ═══════ PAGE 5: ARCHITECTURE + CLOSING ═══════ -->
<div class="page">
  <div class="section-header">
    <span class="time-badge time-cyan">2:30 — 2:50</span>
    <span class="section-title">Architecture & Resilience</span>
  </div>

  <div class="container-row">
    <div class="container-box" style="border-color: rgba(20,241,149,0.2);">
      <div class="container-name" style="color: #14F195;">Nginx</div>
      <div class="container-desc">Reverse proxy</div>
    </div>
    <div class="container-box" style="border-color: rgba(153,69,255,0.2);">
      <div class="container-name" style="color: #9945FF;">React</div>
      <div class="container-desc">Frontend dashboard</div>
    </div>
    <div class="container-box" style="border-color: rgba(34,197,94,0.2);">
      <div class="container-name" style="color: #22c55e;">FastAPI</div>
      <div class="container-desc">Backend + WebSocket</div>
    </div>
    <div class="container-box" style="border-color: rgba(245,158,11,0.2);">
      <div class="container-name" style="color: #f59e0b;">AI Agent</div>
      <div class="container-desc">ML pipeline + Gemini</div>
    </div>
    <div class="container-box" style="border-color: rgba(239,68,68,0.2);">
      <div class="container-name" style="color: #ef4444;">Simulator</div>
      <div class="container-desc">Activity generator</div>
    </div>
  </div>

  <div class="resilience">
    <div class="resilience-title">Resilience</div>
    <p>If Gemini goes down → ML-only fallback decisions.<br>
    If the entire agent dies → contract's auto-rate kicks in.<br>
    <strong style="color: #14F195;">The protocol NEVER stops.</strong></p>
  </div>

  <hr class="divider">

  <div class="section-header">
    <span class="time-badge time-purple">2:50 — 3:00</span>
    <span class="section-title">Closing</span>
  </div>

  <div class="closing-box">
    <div class="closing-quote">"SolanaAI Lend: AI thinks, the contract controls."</div>
    <div style="width: 140px; height: 2px; margin: 12px auto; background: linear-gradient(90deg, #14F195, #9945FF);"></div>
    <div class="closing-sub">"Not 'trust the AI' — but 'verify on-chain'."</div>
    <div class="closing-links">
      <a style="color: #14F195;">Live: http://89.207.255.254</a>
      <a style="color: #9945FF;">github.com/Islambek201632838/solana-service</a>
    </div>
  </div>

  <div class="screenshots">
    <h3>Recommended Screenshots</h3>
    <div class="screenshot-list">
      <div class="screenshot-item">
        <span class="screenshot-num">1</span>
        <span class="screenshot-text">Dashboard with live data (desktop)</span>
      </div>
      <div class="screenshot-item">
        <span class="screenshot-num">2</span>
        <span class="screenshot-text">AI Decision card with ML metrics + reasoning</span>
      </div>
      <div class="screenshot-item">
        <span class="screenshot-num">3</span>
        <span class="screenshot-text">Solana Explorer — TX proof</span>
      </div>
      <div class="screenshot-item">
        <span class="screenshot-num">4</span>
        <span class="screenshot-text">Credit Score widget showing tier</span>
      </div>
      <div class="screenshot-item">
        <span class="screenshot-num">5</span>
        <span class="screenshot-text">Liquidation Warning with Monte Carlo</span>
      </div>
      <div class="screenshot-item">
        <span class="screenshot-num">6</span>
        <span class="screenshot-text">LTV Mode badge changing with volatility</span>
      </div>
      <div class="screenshot-item">
        <span class="screenshot-num">7</span>
        <span class="screenshot-text">Mobile responsive view</span>
      </div>
      <div class="screenshot-item">
        <span class="screenshot-num">8</span>
        <span class="screenshot-text">Architecture diagram</span>
      </div>
    </div>
  </div>
  <div class="page-footer">
    <span>SolanaAI Lend — Demo Script</span>
    <span>5 / 5</span>
  </div>
</div>

</body>
</html>`;

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.pdf({
    path: path.join(__dirname, "SolanaAI_Lend_Demo_Script.pdf"),
    format: "A4",
    printBackground: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  await browser.close();
  console.log("Generated: docs/SolanaAI_Lend_Demo_Script.pdf (4 pages)");
})();
