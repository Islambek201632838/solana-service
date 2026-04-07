# Pitch Script — SolanaAI Lend (2 min)

**For**: hackathon judges, investors, live pitch presentations

---

## 0:00 — The Problem (20s)

"DeFi lending protocols today use static parameters. Fixed interest rates. Fixed collateral ratios. When the market crashes, these protocols can't adapt — leading to cascading liquidations and billions in losses. Aave lost $1.6 million in bad debt in a single event. The problem is clear: DeFi needs intelligence."

---

## 0:20 — The Solution (20s)

"SolanaAI Lend is an autonomous AI-powered lending protocol on Solana. Every 2 minutes, our AI agent analyzes the market using 5 technical indicators, 6 machine learning models, news sentiment analysis, and Google Gemini — then writes optimized parameters directly to the blockchain. Interest rates, collateral ratios, and borrow limits adjust in real time to market conditions. Not in hours. Not with governance votes. In minutes."

---

## 0:40 — How It Works (25s)

"The pipeline: CoinGecko price data flows into RSI, MACD, and Bollinger Bands. Six ML models — RandomForest for trend, IsolationForest for anomalies, EWMA for volatility, a crash detector, risk scorer, and utilization predictor — generate signals. Gemini synthesizes everything into a decision. A validator checks 11 safety rules. The smart contract enforces hard limits on-chain. Seven layers of safety — from prompt to contract to insurance fund. If the AI tries anything outside bounds, the transaction is rejected."

---

## 1:05 — What Makes Us Different (30s)

"Four things set us apart:

First — self-improving AI. We track each model's prediction accuracy over time and dynamically reweight them. The AI gets smarter every cycle.

Second — crash detection. Six signals predict market crashes before they happen. Above 80% crash probability, the protocol freezes automatically. No human intervention needed.

Third — on-chain credit scores. Five factors give every wallet a reputation tier — Platinum users earn lower collateral requirements and better rates. DeFi with personalized risk.

Fourth — real safety, not theater. Our smart contract has guardrails stored in a separate PDA, an insurance fund from 10% of all interest, auto-rate fallback if the AI dies, and emergency freeze. The protocol never stops, and it never trusts the AI blindly."

---

## 1:35 — Traction & Technical Depth (15s)

"This is live on Solana devnet right now. 23 smart contract instructions in Rust with Anchor. A full React dashboard with real-time WebSocket updates. Five Docker containers. The AI agent has made hundreds of on-chain decisions — every single one verifiable on Solana Explorer. This is not a mockup — it's a working protocol."

---

## 1:50 — Closing (10s)

"Current DeFi is static. Markets are dynamic. SolanaAI Lend bridges that gap — AI that adapts in real time, controlled by a smart contract that never compromises on safety. AI thinks. The contract controls. Verify on-chain."

"Live at 89.207.255.254. Open source on GitHub. Thank you."

---

## Key Stats to Memorize

- 6 ML models with dynamic reputation weights
- 7 layers of safety (prompt → validator → contract → freeze → auto-rate → insurance → guardrail PDA)
- 23 smart contract instructions
- 5 Docker containers
- 2-minute decision cycle
- 11 validation rules
- 500 Monte Carlo simulations for liquidation prediction
- 5-factor on-chain credit score with 4 tiers
