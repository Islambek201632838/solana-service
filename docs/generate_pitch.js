const PDFDocument = require("pdfkit");
const fs = require("fs");

const W = 960;
const H = 540;
const doc = new PDFDocument({ size: [W, H], margin: 0 });
doc.pipe(fs.createWriteStream(__dirname + "/SolanaAI_Lend_Pitch.pdf"));

// ── Colors ──
const BG1 = "#0a0a1a";
const BG2 = "#10102a";
const PURPLE = "#9945FF";
const CYAN = "#14F195";
const RED = "#FF4D6A";
const ORANGE = "#FF9900";
const WHITE = "#FFFFFF";
const GRAY = "#8888AA";
const CARD_BG = "#161630";
const CARD_BORDER = "#2a2a50";

// ── Helpers ──
function bg(doc) {
  doc.rect(0, 0, W, H).fill(BG1);
  // subtle gradient stripe at top
  doc.rect(0, 0, W, 4).fill(PURPLE);
}

function footer(doc, left, right) {
  doc.fontSize(9).fillColor(GRAY);
  doc.text(left, 60, H - 30, { width: 400 });
  doc.text(right, W - 200, H - 30, { width: 140, align: "right" });
}

function card(doc, x, y, w, h) {
  doc.roundedRect(x, y, w, h, 8).lineWidth(1).fillAndStroke(CARD_BG, CARD_BORDER);
}

function badge(doc, x, y, text, color) {
  const tw = doc.fontSize(10).widthOfString(text);
  const pw = tw + 20;
  doc.roundedRect(x, y, pw, 26, 13).lineWidth(1).fillAndStroke("transparent", color);
  doc.fontSize(10).fillColor(color).text(text, x, y + 7, { width: pw, align: "center" });
  return pw;
}

function bigNumber(doc, x, y, num, label, numColor) {
  doc.fontSize(42).fillColor(numColor).text(num, x, y, { width: 140, align: "center" });
  doc.fontSize(10).fillColor(GRAY).text(label, x, y + 48, { width: 140, align: "center" });
}

// ════════════════════════════════════════════════
// SLIDE 1: Title
// ════════════════════════════════════════════════
bg(doc);
doc.fontSize(12).fillColor(GRAY).text("SOLANA DEVNET / AI-POWERED DEFI", 0, 140, { align: "center" });

// Title
doc.fontSize(56).fillColor(PURPLE).text("SolanaAI Lend", 0, 175, { align: "center" });

// Underline
doc.moveTo(340, 245).lineTo(620, 245).lineWidth(2).strokeColor(CYAN).stroke();

// Subtitle
doc.fontSize(18).fillColor("#ccccdd")
  .text("AI agent autonomously manages a lending protocol in real time.", 0, 270, { align: "center" })
  .text("Smart contract guarantees safety.", 0, 296, { align: "center" });

// Tech stack line
doc.fontSize(12).fillColor(GRAY).text(
  "Solana Devnet  |  Gemini 2.0 Flash  |  6 ML Models  |  Anchor/Rust  |  React  |  Open Source",
  0, 355, { align: "center" }
);

// Live URL
doc.fontSize(14).fillColor(CYAN).text("Live: http://89.207.255.254", 0, 395, { align: "center" });
doc.fontSize(11).fillColor(PURPLE).text("github.com/Islambek201632838/solana-service", 0, 418, { align: "center" });

footer(doc, "National Solana Hackathon by Decentrathon 2026", "1 / 7");

// ════════════════════════════════════════════════
// SLIDE 2: Problem
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);
doc.fontSize(32).fillColor(WHITE).text("Problem: ", 60, 50, { continued: true }).fillColor(RED).text("DeFi Lending is Broken");

const problems = [
  { title: "Static Formulas", desc: "Aave/Compound use fixed curves\nthat don't react to real-time\nmarket conditions" },
  { title: "Slow Governance", desc: "Parameters change via DAO\nvotes — days or weeks of\ndelay in volatile markets" },
  { title: "No Adaptation", desc: "Protocols can't respond to\nsudden crashes, flash loans,\nor anomalous volume" },
];
problems.forEach((p, i) => {
  const cx = 60 + i * 290;
  card(doc, cx, 120, 270, 150);
  doc.fontSize(16).fillColor(RED).text(p.title, cx + 20, 140);
  doc.fontSize(12).fillColor(GRAY).text(p.desc, cx + 20, 168, { width: 230 });
});

// Impact stat
card(doc, 60, 310, 840, 80);
doc.fontSize(14).fillColor(ORANGE).text("Result:", 85, 330);
doc.fontSize(13).fillColor(WHITE)
  .text("Cascading liquidations, bad debt, protocol insolvency. Aave lost $1.6M in a single bad-debt event.", 160, 332, { width: 720 });
doc.fontSize(13).fillColor(GRAY)
  .text("DeFi needs real-time intelligence — not governance proposals.", 160, 358, { width: 720 });

footer(doc, "SolanaAI Lend", "2 / 7");

// ════════════════════════════════════════════════
// SLIDE 3: Solution — AI Pipeline
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);
doc.fontSize(32).fillColor(WHITE).text("Solution: ", 60, 45, { continued: true }).fillColor(PURPLE).text("AI Calculates, Not Guesses");

// Pipeline flow
const steps = ["Market Data", "RSI  MACD\nBollinger", "6 ML Models", "Sentiment\nFilter", "Gemini AI", "Validator\n11 Rules", "On-chain TX"];
const stepColors = [GRAY, CYAN, PURPLE, ORANGE, CYAN, RED, CYAN];
steps.forEach((s, i) => {
  const sx = 42 + i * 128;
  doc.roundedRect(sx, 105, 115, 50, 6).lineWidth(1).fillAndStroke(CARD_BG, stepColors[i]);
  doc.fontSize(9).fillColor(stepColors[i]).text(s, sx + 5, 117, { width: 105, align: "center" });
  if (i < steps.length - 1) {
    doc.fontSize(12).fillColor(GRAY).text("->", sx + 117, 120);
  }
});

// Two key points
card(doc, 60, 180, 400, 120);
doc.fontSize(15).fillColor(CYAN).text("Gemini = interpreter, not calculator", 80, 198, { width: 360 });
doc.fontSize(11).fillColor(GRAY).text(
  "All numbers come from math formulas and ML models. Gemini only selects from a pre-computed range and explains the reasoning. No hallucinated numbers.",
  80, 225, { width: 360 }
);

card(doc, 500, 180, 400, 120);
doc.fontSize(15).fillColor(ORANGE).text("AI acts, not advises", 520, 198, { width: 360 });
doc.fontSize(11).fillColor(GRAY).text(
  "AI sends real Solana transactions — update_parameters, set_sol_price, liquidate, ai_emergency_freeze. Fully autonomous on-chain actions.",
  520, 225, { width: 360 }
);

// Cycle info
card(doc, 60, 320, 840, 70);
doc.fontSize(13).fillColor(PURPLE).text("Every 2 minutes:", 80, 338);
doc.fontSize(11).fillColor(WHITE).text(
  "CoinGecko price -> 5 indicators -> 6 ML models -> Crash detection -> News sentiment -> Gemini decision -> Validation -> TX to Solana -> Dashboard update",
  230, 340, { width: 650 }
);

// Fallback
doc.fontSize(11).fillColor(CYAN).text(
  "If Gemini is down -> ML-only fallback.  If agent dies -> contract auto-rate.  Protocol NEVER stops.",
  80, 420, { width: 800 }
);

footer(doc, "SolanaAI Lend", "3 / 7");

// ════════════════════════════════════════════════
// SLIDE 4: AI Intelligence — Models & Features
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);
doc.fontSize(32).fillColor(WHITE).text("AI Intelligence: ", 60, 45, { continued: true }).fillColor(CYAN).text("6 Models + 3 Engines");

// ML Models column
doc.fontSize(14).fillColor(PURPLE).text("ML Models", 60, 100);
const models = [
  ["RandomForest", "Trend prediction (up/down/sideways)"],
  ["IsolationForest", "Anomaly detection (flash crashes, pumps)"],
  ["EWMA Volatility", "Regime: low / medium / high / extreme"],
  ["Crash Detector", "6 signals -> probability 0-100%"],
  ["Risk Scorer", "Composite 0-100 from 5 weighted factors"],
  ["Utilization Predictor", "Forecasts pool usage for optimal rate"],
];
models.forEach((m, i) => {
  const my = 125 + i * 32;
  doc.fontSize(11).fillColor(CYAN).text(m[0], 75, my, { width: 160 });
  doc.fontSize(10).fillColor(GRAY).text(m[1], 240, my + 1, { width: 260 });
});

// Smart features column
doc.fontSize(14).fillColor(PURPLE).text("Smart Features", 530, 100);

const features = [
  [ORANGE, "Dynamic LTV", "AI adjusts collateral by volatility\nCalm: -5% | Storm: +10% | Extreme: +20%"],
  [CYAN, "Credit Score", "5 on-chain factors -> 4 tiers\nPlatinum: -15% collateral, -10% rate"],
  [RED, "Crash Detection", "6 signals -> auto-freeze at >80%\nVolume spike, momentum, SMA deviation"],
  [PURPLE, "Monte Carlo", "500 simulations predict liquidation\nat 1h / 4h / 24h horizons"],
  [ORANGE, "Self-Improving", "Model reputation tracking\nAccurate models gain weight automatically"],
  [CYAN, "Sentiment Filter", "Noise (Elon tweets) vs Serious (SEC)\nGemini NLP classification"],
];
features.forEach((f, i) => {
  const fy = 125 + i * 62;
  doc.fontSize(11).fillColor(f[0]).text(f[1], 545, fy, { width: 160 });
  doc.fontSize(9).fillColor(GRAY).text(f[2], 545, fy + 15, { width: 380 });
});

footer(doc, "SolanaAI Lend", "4 / 7");

// ════════════════════════════════════════════════
// SLIDE 5: Safety — 7 Layers
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);
doc.fontSize(32).fillColor(WHITE).text("Safety: ", 60, 45, { continued: true }).fillColor(CYAN).text("7 Layers of Guard Rails");

const layers = [
  { n: "1", title: "Prompt", desc: "Gemini gets strict output\nformat + 'ignore noise'\ninstruction", color: PURPLE },
  { n: "2", title: "Validator", desc: "Python checks 11 rules\nbefore TX. Confidence\n< 50 -> rejected", color: CYAN },
  { n: "3", title: "Contract", desc: "On-chain enforcement:\nrate [1-20%], collateral\n[120-200%], cooldown", color: CYAN },
  { n: "4", title: "AI Freeze", desc: "Auto-freeze when crash\nprobability > 80% or\nrisk score > 90", color: RED },
];
layers.forEach((l, i) => {
  const lx = 60 + i * 220;
  card(doc, lx, 105, 205, 130);
  doc.fontSize(36).fillColor(l.color).text(l.n, lx + 10, 110, { width: 185, align: "center" });
  doc.fontSize(13).fillColor(l.color).text(l.title, lx + 10, 148, { width: 185, align: "center" });
  doc.fontSize(9).fillColor(GRAY).text(l.desc, lx + 15, 170, { width: 175, align: "center" });
});

const layers2 = [
  { n: "5", title: "Auto-Rate", desc: "If AI agent dies, contract\nautomatically adjusts rates\nto protect liquidity", color: ORANGE },
  { n: "6", title: "Insurance", desc: "10% of all interest goes to\ninsurance fund to cover\nbad debt from liquidations", color: PURPLE },
  { n: "7", title: "Guardrail PDA", desc: "Safety parameters stored in\nseparate PDA — only authority\ncan modify. Immutable for AI.", color: CYAN },
];
layers2.forEach((l, i) => {
  const lx = 130 + i * 250;
  card(doc, lx, 255, 225, 120);
  doc.fontSize(30).fillColor(l.color).text(l.n, lx + 10, 258, { width: 205, align: "center" });
  doc.fontSize(13).fillColor(l.color).text(l.title, lx + 10, 290, { width: 205, align: "center" });
  doc.fontSize(9).fillColor(GRAY).text(l.desc, lx + 15, 310, { width: 195, align: "center" });
});

// Bottom tagline
doc.fontSize(15).fillColor(WHITE).text("AI can make mistakes. The contract won't allow it.", 0, 410, { width: W, align: "center" });
doc.fontSize(11).fillColor(GRAY).text("Every parameter change = on-chain TX, verifiable on Solana Explorer", 0, 435, { width: W, align: "center" });

footer(doc, "SolanaAI Lend", "5 / 7");

// ════════════════════════════════════════════════
// SLIDE 6: Why We're Different (comparison)
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);
doc.fontSize(32).fillColor(WHITE).text("Why We're ", 60, 45, { continued: true }).fillColor(CYAN).text("Different");

// Table header
doc.fontSize(12).fillColor(RED).text("Typical AI+DeFi Approach", 80, 100, { width: 380 });
doc.fontSize(12).fillColor(CYAN).text("SolanaAI Lend", 530, 100, { width: 380 });

// Separator
doc.moveTo(60, 120).lineTo(900, 120).lineWidth(1).strokeColor(CARD_BORDER).stroke();

const rows = [
  ["Data -> LLM -> \"I think maybe...\"", "Data -> Math -> ML -> Gemini interprets"],
  ["LLM hallucinates numbers", "All numbers from formulas, Gemini only selects"],
  ["No mathematical foundation", "RSI + MACD + Bollinger + ATR + RandomForest"],
  ["No news filtering", "Sentiment: noise -> ignore, serious -> react"],
  ["AI advises, human acts", "AI acts autonomously on-chain (4 TX types)"],
  ["No guard rails or 1-2 checks", "7 layers: prompt -> validator -> contract -> freeze -> auto-rate -> insurance -> PDA"],
  ["Static model weights", "Self-improving: model reputation + dynamic weights"],
  ["Fixed collateral ratio", "Dynamic LTV based on real-time volatility regime"],
];

rows.forEach((r, i) => {
  const ry = 132 + i * 38;
  if (i % 2 === 0) {
    doc.rect(60, ry - 2, 840, 36).fill("#0d0d25");
  }
  doc.fontSize(10.5).fillColor("#FF6B7A").text(r[0], 80, ry + 8, { width: 400 });
  doc.fontSize(10.5).fillColor(CYAN).text(r[1], 530, ry + 8, { width: 380 });
});

footer(doc, "SolanaAI Lend", "6 / 7");

// ════════════════════════════════════════════════
// SLIDE 7: Thank You
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);

// Big "Thank You"
doc.fontSize(60).fillColor(PURPLE).text("Thank You", 0, 150, { align: "center" });

// Underline
doc.moveTo(340, 220).lineTo(620, 220).lineWidth(2).strokeColor(CYAN).stroke();

// Subtitle
doc.fontSize(18).fillColor(WHITE).text("AI thinks.  Contract controls.", 0, 245, { align: "center" });

// Links
doc.fontSize(15).fillColor(CYAN).text("http://89.207.255.254", 0, 310, { align: "center" });
doc.fontSize(13).fillColor(PURPLE).text("github.com/Islambek201632838/solana-service", 0, 340, { align: "center" });

footer(doc, "National Solana Hackathon by Decentrathon 2026", "7 / 7");

// ── Finalize ──
doc.end();
console.log("Generated: docs/SolanaAI_Lend_Pitch.pdf (7 slides)");
