# Demo Script — SolanaAI Lend (3 min video)

**Live site**: http://89.207.255.254/

---

## 0:00 — Opening (15s)

"SolanaAI Lend — an autonomous AI-powered lending protocol on Solana.
AI manages interest rates, collateral ratios, and borrow limits in real time,
while the smart contract enforces strict safety guardrails.
Let me show you how it works."

---

## 0:15 — Dashboard Overview (30s)

- Show: interest rate, total deposits, total borrows, SOL price, utilization %
- "Here's our live dashboard. The protocol is running on Solana devnet right now."
- Point to Protocol Mood badge: "This mood indicator — Calm, Cautious, Stressed, or Crisis — reflects the AI's real-time risk assessment."
- Point to Insurance Fund: "10% of all interest flows into this insurance fund to cover bad debt — just like production protocols."
- Show Health Factor bar, Liquidation Queue widget
- "Users can see their position health and liquidation risk at a glance."

---

## 0:45 — AI Decisions Page (35s)

- Click "AI Decisions" in nav
- Show a decision card with full details
- "Every 2 minutes, the AI agent runs a complete analysis pipeline:
  5 technical indicators — RSI, MACD, Bollinger Bands, ATR, EMA —
  plus 6 ML models for trend prediction, anomaly detection, volatility regime,
  crash probability, risk scoring, and utilization forecasting."
- Point to reasoning text: "Gemini 2.0 Flash generates a human-readable explanation for every decision — in English and Russian."
- Show Model Performance widget: "The AI tracks each model's accuracy over time and dynamically adjusts their weights. A model that's been wrong loses influence; one that's been right gains it. Self-improving AI."
- Click "View TX" → Solana Explorer: "Every parameter change is an on-chain transaction — fully verifiable."

---

## 1:20 — Safety Architecture (30s)

- "What makes this different from 'trust the AI' is our 7-layer safety system:"
- "Layer 1: Prompt engineering constrains Gemini's output format."
- "Layer 2: A validator checks 11 rules — rate bounds, collateral bounds, max change per update."
- "Layer 3: The smart contract enforces the same limits on-chain — impossible to bypass."
- "Layer 4: AI can emergency-freeze the protocol if crash probability exceeds 80%."
- "Layer 5: If the AI agent dies, the contract has an auto-rate mechanism to protect liquidity."
- "Layer 6: Insurance fund covers bad debt from failed liquidations."
- "Layer 7: Guardrail parameters are stored in a separate PDA — only the authority can modify them."
- Show log example: "Here — 'CooldownActive' — the contract rejected an update because the cooldown hadn't passed. The AI doesn't get to override safety."

---

## 1:50 — Smart Features (40s)

- **Dynamic LTV**: "AI automatically adjusts collateral requirements based on volatility. In calm markets — lower collateral to attract borrowers. In a storm — collateral goes up 10-20% to protect the pool."
- Show LTV Mode badge (Calm/Normal/Storm/Extreme)

- **Credit Score**: "Every wallet gets an on-chain credit score based on 5 factors: account age, transaction count, repayment history, liquidation record, and position size."
- Show Credit Score widget: "Platinum users get 15% lower collateral and 10% lower rates. It rewards good behavior."

- **Crash Detection**: "Six signals — price momentum, volume spikes, consecutive red candles, SMA deviation, short-term volatility, and trend acceleration — feed into a crash probability score. Above 80%? The AI freezes the protocol automatically."

- **Liquidation Predictor**: "Monte Carlo simulation with 500 price paths predicts liquidation probability at 1-hour, 4-hour, and 24-hour horizons. Users get warnings before they're in danger."

---

## 2:30 — Architecture & Resilience (20s)

- Show architecture diagram or describe:
- "Five Docker containers: nginx reverse proxy, React frontend, FastAPI backend reading from Solana RPC, the AI agent running the ML pipeline, and an activity simulator generating realistic traffic."
- "If Gemini goes down, the AI falls back to ML-only decisions. If the entire agent dies, the contract's auto-rate kicks in. The protocol never stops."

---

## 2:50 — Closing (10s)

- "SolanaAI Lend: AI thinks, the contract controls."
- "Not 'trust the AI' — but 'verify on-chain'."
- "Live now at 89.207.255.254. All code is open source."
- GitHub: github.com/Islambek201632838/solana-service

---

## Recommended Screenshots / Screen Recording Shots

1. Dashboard with live data (desktop)
2. AI Decision card with ML metrics + reasoning
3. Solana Explorer — TX proof
4. Credit Score widget showing tier
5. Liquidation Warning with Monte Carlo probabilities
6. LTV Mode badge changing with volatility
7. Mobile responsive view
8. Architecture diagram
