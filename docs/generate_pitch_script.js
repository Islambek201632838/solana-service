const puppeteer = require("puppeteer");
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
    margin-bottom: 8px;
  }
  .cover-audience {
    font-size: 11px; color: #9ca3af; margin-bottom: 20px;
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
  .cover-subtitle { font-size: 16px; color: #e5e7eb; margin-bottom: 6px; }
  .cover-desc { font-size: 13px; color: #6b7280; }

  .stats-row { display: flex; gap: 14px; justify-content: center; margin: 28px 0; }
  .stat-box {
    text-align: center; padding: 14px 20px;
    border-radius: 12px; min-width: 90px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
  }
  .stat-num { font-size: 28px; font-weight: 900; }
  .stat-label { font-size: 9px; color: #6b7280; margin-top: 4px; letter-spacing: 0.5px; }

  .badges { display: flex; gap: 10px; justify-content: center; margin: 16px 0; flex-wrap: wrap; }
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
    margin: 16px auto; display: inline-block;
  }
  .live-box span { color: #14F195; font-size: 13px; font-weight: 600; }

  .cover-footer { margin-top: 24px; }
  .cover-footer p { font-size: 11px; color: #4b5563; margin: 4px 0; }
  .cover-footer .gh { color: #9945FF; }

  /* ── Section Headers ── */
  .section-header {
    display: flex; align-items: center; gap: 16px;
    margin-bottom: 18px; margin-top: 8px;
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

  .section-title { font-size: 22px; font-weight: 700; color: #fff; }

  /* ── Speech Block ── */
  .speech {
    background: rgba(153,69,255,0.04);
    border: 1px solid rgba(153,69,255,0.2);
    border-left: 3px solid #9945FF;
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 18px;
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

  /* ── Divider ── */
  .divider {
    border: none; border-top: 1px solid rgba(255,255,255,0.06);
    margin: 22px 0;
  }

  /* ── Problem Cards Row ── */
  .problem-row { display: flex; gap: 12px; margin-bottom: 18px; }
  .problem-card {
    flex: 1; text-align: center;
    background: rgba(239,68,68,0.04);
    border: 1px solid rgba(239,68,68,0.12);
    border-radius: 10px; padding: 14px 12px;
  }
  .problem-icon { font-size: 11px; font-weight: 800; color: #ef4444; margin-bottom: 4px; letter-spacing: 1px; }
  .problem-text { font-size: 10px; color: #6b7280; line-height: 1.5; }

  /* ── Pipeline ── */
  .pipeline {
    display: flex; align-items: center; gap: 4px;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px; padding: 10px 16px;
    margin-bottom: 18px; justify-content: center;
  }
  .pipe-step {
    padding: 5px 12px; border-radius: 6px;
    font-size: 9px; font-weight: 600;
    border: 1px solid;
  }
  .pipe-arrow { color: #4b5563; font-size: 11px; }

  /* ── Differentiator Cards ── */
  .diff-cards { display: flex; flex-direction: column; gap: 12px; margin-bottom: 18px; }
  .diff-card {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    padding: 16px 20px;
    display: flex; gap: 16px; align-items: flex-start;
  }
  .diff-num {
    width: 32px; height: 32px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; font-weight: 900; flex-shrink: 0;
  }
  .diff-content { flex: 1; }
  .diff-title { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
  .diff-text { font-size: 11.5px; line-height: 1.6; color: #9ca3af; }

  /* ── Tech Stats ── */
  .tech-stats { display: flex; gap: 10px; margin: 18px 0; }
  .tech-stat {
    flex: 1; text-align: center;
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px; padding: 12px 8px;
  }
  .tech-num { font-size: 22px; font-weight: 900; }
  .tech-label { font-size: 8px; color: #6b7280; margin-top: 3px; line-height: 1.4; }

  /* ── Closing ── */
  .closing-box {
    text-align: center;
    background: rgba(153,69,255,0.05);
    border: 1px solid rgba(153,69,255,0.2);
    border-radius: 14px;
    padding: 24px 30px;
    margin-bottom: 20px;
  }
  .closing-quote {
    font-size: 18px; font-weight: 700; color: #9945FF;
    margin-bottom: 8px;
  }
  .closing-sub { font-size: 13px; color: #d1d5db; margin-bottom: 12px; }
  .closing-link-cyan { font-size: 12px; color: #14F195; display: block; margin: 3px 0; }
  .closing-link-purple { font-size: 12px; color: #9945FF; display: block; margin: 3px 0; }

  /* ── Key Stats ── */
  .key-stats { display: flex; flex-direction: column; gap: 10px; }
  .key-stat {
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px;
    padding: 14px 20px;
    display: flex; align-items: baseline; gap: 16px;
  }
  .key-stat-value { font-size: 15px; font-weight: 800; min-width: 220px; }
  .key-stat-detail { font-size: 11px; color: #6b7280; }

  /* ── Branding Footer ── */
  .branding {
    text-align: center; margin-top: 30px;
    padding-top: 16px;
    border-top: 1px solid rgba(153,69,255,0.3);
  }
  .branding-title { font-size: 16px; font-weight: 700; color: #9945FF; margin-bottom: 4px; }
  .branding-tagline { font-size: 11px; color: #6b7280; margin-bottom: 6px; }
  .branding-gh { font-size: 10px; color: #4b5563; }

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
      <div class="cover-label">PITCH SCRIPT — 2 MINUTES</div>
      <div class="cover-audience">For hackathon judges, investors, live pitch presentations</div>
      <div class="cover-title">SolanaAI Lend</div>
      <div class="cover-line"></div>
      <div class="cover-subtitle">AI-Powered Autonomous Lending Protocol</div>
      <div class="cover-desc">AI agent autonomously manages a lending protocol in real time</div>

      <div class="stats-row">
        <div class="stat-box" style="border-color: rgba(20,241,149,0.15);">
          <div class="stat-num" style="color: #14F195;">6</div>
          <div class="stat-label">ML MODELS</div>
        </div>
        <div class="stat-box" style="border-color: rgba(34,197,94,0.15);">
          <div class="stat-num" style="color: #22c55e;">7</div>
          <div class="stat-label">SAFETY LAYERS</div>
        </div>
        <div class="stat-box" style="border-color: rgba(153,69,255,0.15);">
          <div class="stat-num" style="color: #9945FF;">23</div>
          <div class="stat-label">INSTRUCTIONS</div>
        </div>
        <div class="stat-box" style="border-color: rgba(245,158,11,0.15);">
          <div class="stat-num" style="color: #f59e0b;">2m</div>
          <div class="stat-label">DECISION CYCLE</div>
        </div>
      </div>

      <div class="live-box"><span>Live: http://89.207.255.254</span></div>
    </div>
    <div class="cover-footer">
      <p>National Solana Hackathon by Decentrathon 2026</p>
      <p class="gh">github.com/Islambek201632838/solana-service</p>
    </div>
  </div>
</div>

<!-- ═══════ PAGE 2: PROBLEM + SOLUTION + HOW IT WORKS ═══════ -->
<div class="page">
  <div class="section-header">
    <span class="time-badge time-red">0:00 — 0:20</span>
    <span class="section-title">The Problem</span>
  </div>
  <div class="speech">
    <p>DeFi lending protocols today use static parameters. Fixed interest rates. Fixed collateral ratios.
    When the market crashes, these protocols can't adapt — leading to cascading liquidations and
    billions in losses. Aave lost $1.6 million in bad debt in a single event. The problem is clear:
    DeFi needs intelligence.</p>
  </div>
  <div class="problem-row">
    <div class="problem-card">
      <div class="problem-icon">STATIC</div>
      <div class="problem-text">Fixed curves don't react to market</div>
    </div>
    <div class="problem-card">
      <div class="problem-icon">SLOW</div>
      <div class="problem-text">DAO votes take days/weeks</div>
    </div>
    <div class="problem-card">
      <div class="problem-icon">BLIND</div>
      <div class="problem-text">No real-time adaptation</div>
    </div>
  </div>

  <hr class="divider">

  <div class="section-header">
    <span class="time-badge time-cyan">0:20 — 0:40</span>
    <span class="section-title">The Solution</span>
  </div>
  <div class="speech">
    <p>SolanaAI Lend is an autonomous AI-powered lending protocol on Solana. Every 2 minutes,
    our AI agent analyzes the market using 5 technical indicators, 6 machine learning models,
    news sentiment analysis, and Google Gemini — then writes optimized parameters directly
    to the blockchain. Interest rates, collateral ratios, and borrow limits adjust in real time
    to market conditions. Not in hours. Not with governance votes. In minutes.</p>
  </div>
  <div class="pipeline">
    <span class="pipe-step" style="color: #6b7280; border-color: #4b5563;">Data</span>
    <span class="pipe-arrow">→</span>
    <span class="pipe-step" style="color: #14F195; border-color: rgba(20,241,149,0.3);">RSI · MACD</span>
    <span class="pipe-arrow">→</span>
    <span class="pipe-step" style="color: #9945FF; border-color: rgba(153,69,255,0.3);">6 ML</span>
    <span class="pipe-arrow">→</span>
    <span class="pipe-step" style="color: #f59e0b; border-color: rgba(245,158,11,0.3);">Sentiment</span>
    <span class="pipe-arrow">→</span>
    <span class="pipe-step" style="color: #14F195; border-color: rgba(20,241,149,0.3);">Gemini</span>
    <span class="pipe-arrow">→</span>
    <span class="pipe-step" style="color: #ef4444; border-color: rgba(239,68,68,0.3);">Validator</span>
    <span class="pipe-arrow">→</span>
    <span class="pipe-step" style="color: #22c55e; border-color: rgba(34,197,94,0.3);">TX ✓</span>
  </div>

  <hr class="divider">

  <div class="section-header">
    <span class="time-badge time-purple">0:40 — 1:05</span>
    <span class="section-title">How It Works</span>
  </div>
  <div class="speech">
    <p>The pipeline: CoinGecko price data flows into RSI, MACD, and Bollinger Bands. Six ML models
    — RandomForest for trend, IsolationForest for anomalies, EWMA for volatility, a crash detector,
    risk scorer, and utilization predictor — generate signals. Gemini synthesizes everything into
    a decision. A validator checks 11 safety rules. The smart contract enforces hard limits on-chain.
    Seven layers of safety — from prompt to contract to insurance fund. If the AI tries anything
    outside bounds, the transaction is rejected.</p>
  </div>
  <div class="page-footer">
    <span>SolanaAI Lend — Pitch Script</span>
    <span>2 / 5</span>
  </div>
</div>

<!-- ═══════ PAGE 3: DIFFERENTIATORS ═══════ -->
<div class="page">
  <div class="section-header">
    <span class="time-badge time-orange">1:05 — 1:35</span>
    <span class="section-title">What Makes Us Different</span>
  </div>

  <div style="background: rgba(153,69,255,0.04); border: 1px solid rgba(153,69,255,0.15);
    border-radius: 8px; padding: 10px 16px; margin-bottom: 14px;">
    <p style="font-size: 12px; color: #9945FF; font-weight: 600;">"Four things set us apart:"</p>
  </div>

  <div class="diff-cards">
    <div class="diff-card" style="border-color: rgba(20,241,149,0.12);">
      <div class="diff-num" style="background: rgba(20,241,149,0.12); color: #14F195;">1</div>
      <div class="diff-content">
        <div class="diff-title" style="color: #14F195;">Self-Improving AI</div>
        <div class="diff-text">We track each model's prediction accuracy over time and dynamically reweight them. The AI gets smarter every cycle.</div>
      </div>
    </div>
    <div class="diff-card" style="border-color: rgba(239,68,68,0.12);">
      <div class="diff-num" style="background: rgba(239,68,68,0.12); color: #ef4444;">2</div>
      <div class="diff-content">
        <div class="diff-title" style="color: #ef4444;">Crash Detection</div>
        <div class="diff-text">Six signals predict market crashes before they happen. Above 80% crash probability, the protocol freezes automatically. No human intervention needed.</div>
      </div>
    </div>
    <div class="diff-card" style="border-color: rgba(34,197,94,0.12);">
      <div class="diff-num" style="background: rgba(34,197,94,0.12); color: #22c55e;">3</div>
      <div class="diff-content">
        <div class="diff-title" style="color: #22c55e;">On-Chain Credit Scores</div>
        <div class="diff-text">Five factors give every wallet a reputation tier — Platinum users earn lower collateral requirements and better rates. DeFi with personalized risk.</div>
      </div>
    </div>
    <div class="diff-card" style="border-color: rgba(245,158,11,0.12);">
      <div class="diff-num" style="background: rgba(245,158,11,0.12); color: #f59e0b;">4</div>
      <div class="diff-content">
        <div class="diff-title" style="color: #f59e0b;">Real Safety, Not Theater</div>
        <div class="diff-text">Smart contract has guardrails in a separate PDA, insurance fund from 10% of all interest, auto-rate fallback if the AI dies, and emergency freeze. The protocol never stops, and it never trusts the AI blindly.</div>
      </div>
    </div>
  </div>
  <div class="page-footer">
    <span>SolanaAI Lend — Pitch Script</span>
    <span>3 / 5</span>
  </div>
</div>

<!-- ═══════ PAGE 4: TRACTION + CLOSING ═══════ -->
<div class="page">
  <div class="section-header">
    <span class="time-badge time-green">1:35 — 1:50</span>
    <span class="section-title">Traction & Technical Depth</span>
  </div>
  <div class="speech">
    <p>This is live on Solana devnet right now. 23 smart contract instructions in Rust with Anchor.
    A full React dashboard with real-time WebSocket updates. Five Docker containers.
    The AI agent has made hundreds of on-chain decisions — every single one verifiable on
    Solana Explorer. This is not a mockup — it's a working protocol.</p>
  </div>

  <div class="tech-stats">
    <div class="tech-stat" style="border-color: rgba(153,69,255,0.15);">
      <div class="tech-num" style="color: #9945FF;">23</div>
      <div class="tech-label">Contract<br>Instructions</div>
    </div>
    <div class="tech-stat" style="border-color: rgba(20,241,149,0.15);">
      <div class="tech-num" style="color: #14F195;">5</div>
      <div class="tech-label">Docker<br>Containers</div>
    </div>
    <div class="tech-stat" style="border-color: rgba(239,68,68,0.15);">
      <div class="tech-num" style="color: #ef4444;">11</div>
      <div class="tech-label">Validation<br>Rules</div>
    </div>
    <div class="tech-stat" style="border-color: rgba(245,158,11,0.15);">
      <div class="tech-num" style="color: #f59e0b;">500</div>
      <div class="tech-label">Monte Carlo<br>Simulations</div>
    </div>
    <div class="tech-stat" style="border-color: rgba(34,197,94,0.15);">
      <div class="tech-num" style="color: #22c55e;">5</div>
      <div class="tech-label">Credit Score<br>Factors</div>
    </div>
  </div>

  <hr class="divider">

  <div class="section-header">
    <span class="time-badge time-purple">1:50 — 2:00</span>
    <span class="section-title">Closing</span>
  </div>
  <div class="speech">
    <p>Current DeFi is static. Markets are dynamic. SolanaAI Lend bridges that gap — AI that adapts
    in real time, controlled by a smart contract that never compromises on safety. AI thinks.
    The contract controls. Verify on-chain.</p>
  </div>
  <div class="speech" style="border-color: rgba(20,241,149,0.2); border-left-color: #14F195;">
    <p>Live at 89.207.255.254. Open source on GitHub. Thank you.</p>
  </div>

  <div class="closing-box">
    <div class="closing-quote">AI thinks. The contract controls.</div>
    <div style="width: 140px; height: 2px; margin: 10px auto; background: linear-gradient(90deg, #14F195, #9945FF);"></div>
    <div class="closing-sub">Verify on-chain.</div>
    <div class="closing-link-cyan">http://89.207.255.254</div>
    <div class="closing-link-purple">github.com/Islambek201632838/solana-service</div>
  </div>
  <div class="page-footer">
    <span>SolanaAI Lend — Pitch Script</span>
    <span>4 / 5</span>
  </div>
</div>

<!-- ═══════ PAGE 5: KEY STATS CHEAT SHEET ═══════ -->
<div class="page">
  <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 28px;">
    <span class="section-title" style="font-size: 24px;">Key Stats — Cheat Sheet</span>
    <span class="badge badge-orange">MEMORIZE THESE</span>
  </div>

  <div class="key-stats">
    <div class="key-stat" style="border-color: rgba(20,241,149,0.12);">
      <span class="key-stat-value" style="color: #14F195;">6 ML models</span>
      <span class="key-stat-detail">with dynamic reputation weights</span>
    </div>
    <div class="key-stat" style="border-color: rgba(34,197,94,0.12);">
      <span class="key-stat-value" style="color: #22c55e;">7 layers of safety</span>
      <span class="key-stat-detail">prompt → validator → contract → freeze → auto-rate → insurance → guardrail PDA</span>
    </div>
    <div class="key-stat" style="border-color: rgba(153,69,255,0.12);">
      <span class="key-stat-value" style="color: #9945FF;">23 smart contract instructions</span>
      <span class="key-stat-detail">in Rust with Anchor framework</span>
    </div>
    <div class="key-stat" style="border-color: rgba(20,241,149,0.12);">
      <span class="key-stat-value" style="color: #14F195;">5 Docker containers</span>
      <span class="key-stat-detail">nginx, react, fastapi, ai-agent, simulator</span>
    </div>
    <div class="key-stat" style="border-color: rgba(245,158,11,0.12);">
      <span class="key-stat-value" style="color: #f59e0b;">2-minute decision cycle</span>
      <span class="key-stat-detail">fully autonomous, no human intervention</span>
    </div>
    <div class="key-stat" style="border-color: rgba(239,68,68,0.12);">
      <span class="key-stat-value" style="color: #ef4444;">11 validation rules</span>
      <span class="key-stat-detail">checked before every on-chain transaction</span>
    </div>
    <div class="key-stat" style="border-color: rgba(153,69,255,0.12);">
      <span class="key-stat-value" style="color: #9945FF;">500 Monte Carlo simulations</span>
      <span class="key-stat-detail">for liquidation prediction at 1h / 4h / 24h</span>
    </div>
    <div class="key-stat" style="border-color: rgba(34,197,94,0.12);">
      <span class="key-stat-value" style="color: #22c55e;">5-factor credit score</span>
      <span class="key-stat-detail">with 4 tiers: Bronze → Silver → Gold → Platinum</span>
    </div>
  </div>

  <div class="branding">
    <div class="branding-title">SolanaAI Lend</div>
    <div class="branding-tagline">AI thinks. The contract controls. Verify on-chain.</div>
    <div class="branding-gh">github.com/Islambek201632838/solana-service</div>
  </div>
  <div class="page-footer">
    <span>SolanaAI Lend — Pitch Script</span>
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
    path: path.join(__dirname, "SolanaAI_Lend_Pitch_Script.pdf"),
    format: "A4",
    printBackground: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  await browser.close();
  console.log("Generated: docs/SolanaAI_Lend_Pitch_Script.pdf (4 pages)");
})();
