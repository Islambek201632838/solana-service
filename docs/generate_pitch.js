const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const W = 960;
const H = 540;
const FONT = path.join(__dirname, "fonts", "NotoSans.ttf");
const doc = new PDFDocument({ size: [W, H], margin: 0 });
doc.pipe(fs.createWriteStream(__dirname + "/SolanaAI_Lend_Pitch.pdf"));
doc.registerFont("Noto", FONT);
doc.font("Noto");

// ── Colors ──
const BG1 = "#0a0a1a";
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

// ════════════════════════════════════════════════
// СЛАЙД 1: Титульный
// ════════════════════════════════════════════════
bg(doc);
doc.fontSize(12).fillColor(GRAY).text("SOLANA DEVNET / AI-POWERED DEFI", 0, 140, { align: "center" });

doc.fontSize(56).fillColor(PURPLE).text("SolanaAI Lend", 0, 175, { align: "center" });
doc.moveTo(340, 245).lineTo(620, 245).lineWidth(2).strokeColor(CYAN).stroke();

doc.fontSize(18).fillColor("#ccccdd")
  .text("AI-агент автономно управляет лендинг-протоколом в реальном времени.", 0, 270, { align: "center" })
  .text("Смарт-контракт гарантирует безопасность.", 0, 296, { align: "center" });

doc.fontSize(12).fillColor(GRAY).text(
  "Solana Devnet  |  Gemini 2.0 Flash  |  6 ML моделей  |  Anchor/Rust  |  React  |  Open Source",
  0, 355, { align: "center" }
);

doc.fontSize(14).fillColor(CYAN).text("Live: http://89.207.255.254", 0, 395, { align: "center" });
doc.fontSize(11).fillColor(PURPLE).text("github.com/Islambek201632838/solana-service", 0, 418, { align: "center" });

footer(doc, "National Solana Hackathon by Decentrathon 2026", "1 / 7");

// ════════════════════════════════════════════════
// СЛАЙД 2: Проблема
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);
doc.fontSize(32).fillColor(WHITE).text("Проблема: ", 60, 50, { continued: true }).fillColor(RED).text("DeFi лендинг сломан");

const problems = [
  { title: "Статичные формулы", desc: "Aave/Compound используют\nфиксированные кривые — не\nреагируют на рынок" },
  { title: "Медленное управление", desc: "Параметры меняются через\nголосование DAO — дни и\nнедели задержки" },
  { title: "Нет адаптации", desc: "Протоколы не реагируют на\nрезкие движения рынка в\nреальном времени" },
];
problems.forEach((p, i) => {
  const cx = 60 + i * 290;
  card(doc, cx, 120, 270, 150);
  doc.fontSize(16).fillColor(RED).text(p.title, cx + 20, 140);
  doc.fontSize(12).fillColor(GRAY).text(p.desc, cx + 20, 168, { width: 230 });
});

card(doc, 60, 310, 840, 80);
doc.fontSize(14).fillColor(ORANGE).text("Результат:", 85, 330);
doc.fontSize(13).fillColor(WHITE)
  .text("Каскадные ликвидации, плохой долг, неплатёжеспособность. Aave потерял $1.6M за один инцидент.", 180, 332, { width: 700 });
doc.fontSize(13).fillColor(GRAY)
  .text("DeFi нужен интеллект в реальном времени — не голосования.", 180, 358, { width: 700 });

footer(doc, "SolanaAI Lend", "2 / 7");

// ════════════════════════════════════════════════
// СЛАЙД 3: Решение — AI Pipeline
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);
doc.fontSize(32).fillColor(WHITE).text("Решение: ", 60, 45, { continued: true }).fillColor(PURPLE).text("AI считает, не угадывает");

const steps = ["Данные", "RSI  MACD\nBollinger", "6 ML\nмоделей", "Анализ\nновостей", "Gemini AI", "Валидатор\n11 правил", "TX\non-chain"];
const stepColors = [GRAY, CYAN, PURPLE, ORANGE, CYAN, RED, CYAN];
steps.forEach((s, i) => {
  const sx = 42 + i * 128;
  doc.roundedRect(sx, 105, 115, 50, 6).lineWidth(1).fillAndStroke(CARD_BG, stepColors[i]);
  doc.fontSize(9).fillColor(stepColors[i]).text(s, sx + 5, 117, { width: 105, align: "center" });
  if (i < steps.length - 1) {
    doc.fontSize(12).fillColor(GRAY).text("->", sx + 117, 120);
  }
});

card(doc, 60, 180, 400, 120);
doc.fontSize(15).fillColor(CYAN).text("Gemini — интерпретатор, не решатель", 80, 198, { width: 360 });
doc.fontSize(11).fillColor(GRAY).text(
  "Все числа рассчитывает математика. Gemini только выбирает из диапазона и объясняет логику. Никаких галлюцинаций.",
  80, 225, { width: 360 }
);

card(doc, 500, 180, 400, 120);
doc.fontSize(15).fillColor(ORANGE).text("AI действует, не советует", 520, 198, { width: 360 });
doc.fontSize(11).fillColor(GRAY).text(
  "AI отправляет реальные транзакции в Solana — update_parameters, set_sol_price, liquidate, emergency_freeze. Полностью автономно.",
  520, 225, { width: 360 }
);

card(doc, 60, 320, 840, 70);
doc.fontSize(13).fillColor(PURPLE).text("Каждые 2 минуты:", 80, 338);
doc.fontSize(11).fillColor(WHITE).text(
  "CoinGecko -> 5 индикаторов -> 6 ML моделей -> детекция крэша -> анализ новостей -> Gemini -> валидация -> TX на Solana",
  250, 340, { width: 630 }
);

doc.fontSize(11).fillColor(CYAN).text(
  "Gemini упал -> ML-only fallback.  Агент умер -> auto-rate контракта.  Протокол НИКОГДА не останавливается.",
  80, 420, { width: 800 }
);

footer(doc, "SolanaAI Lend", "3 / 7");

// ════════════════════════════════════════════════
// СЛАЙД 4: AI интеллект — Модели и фичи
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);
doc.fontSize(32).fillColor(WHITE).text("AI интеллект: ", 60, 45, { continued: true }).fillColor(CYAN).text("6 моделей + 3 движка");

doc.fontSize(14).fillColor(PURPLE).text("ML модели", 60, 100);
const models = [
  ["RandomForest", "Предсказание тренда (up/down/sideways)"],
  ["IsolationForest", "Детекция аномалий (крэши, пампы)"],
  ["EWMA Volatility", "Режим: low / medium / high / extreme"],
  ["Crash Detector", "6 сигналов -> вероятность 0-100%"],
  ["Risk Scorer", "Композит 0-100 из 5 факторов"],
  ["Utilization Predictor", "Прогноз утилизации для оптимальной ставки"],
];
models.forEach((m, i) => {
  const my = 125 + i * 32;
  doc.fontSize(11).fillColor(CYAN).text(m[0], 75, my, { width: 160 });
  doc.fontSize(10).fillColor(GRAY).text(m[1], 240, my + 1, { width: 280 });
});

doc.fontSize(14).fillColor(PURPLE).text("Умные фичи", 530, 100);

const features = [
  [ORANGE, "Dynamic LTV", "AI меняет залог по волатильности\nCalm: -5% | Storm: +10% | Extreme: +20%"],
  [CYAN, "Credit Score", "5 on-chain факторов -> 4 тира\nPlatinum: -15% залог, -10% ставка"],
  [RED, "Crash Detection", "6 сигналов -> авто-freeze при >80%\nVolume spike, моментум, SMA"],
  [PURPLE, "Monte Carlo", "500 симуляций предсказывают\nликвидацию на 1ч / 4ч / 24ч"],
  [ORANGE, "Самообучение", "Репутация моделей: точные получают\nбольше веса автоматически"],
  [CYAN, "Фильтр новостей", "Шум (твиты Маска) vs Серьёзное (SEC)\nGemini NLP классификация"],
];
features.forEach((f, i) => {
  const fy = 125 + i * 62;
  doc.fontSize(11).fillColor(f[0]).text(f[1], 545, fy, { width: 160 });
  doc.fontSize(9).fillColor(GRAY).text(f[2], 545, fy + 15, { width: 380 });
});

footer(doc, "SolanaAI Lend", "4 / 7");

// ════════════════════════════════════════════════
// СЛАЙД 5: Безопасность — 7 уровней
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);
doc.fontSize(32).fillColor(WHITE).text("Безопасность: ", 60, 45, { continued: true }).fillColor(CYAN).text("7 уровней защиты");

const layers = [
  { n: "1", title: "Промпт", desc: "Gemini получает жёсткие\nрамки и инструкцию\n\"noise -> игнорируй\"", color: PURPLE },
  { n: "2", title: "Валидатор", desc: "Python: 11 проверок ДО\nотправки TX.\nconfidence < 50 -> reject", color: CYAN },
  { n: "3", title: "Контракт", desc: "Solana: has_one, cooldown,\nставка [1-20%],\nзалог [120-200%]", color: CYAN },
  { n: "4", title: "AI Freeze", desc: "AI freeze при risk > 90.\nAuthority unfreeze.\nWithdraw всегда работает", color: RED },
];
layers.forEach((l, i) => {
  const lx = 60 + i * 220;
  card(doc, lx, 105, 205, 130);
  doc.fontSize(36).fillColor(l.color).text(l.n, lx + 10, 110, { width: 185, align: "center" });
  doc.fontSize(13).fillColor(l.color).text(l.title, lx + 10, 148, { width: 185, align: "center" });
  doc.fontSize(9).fillColor(GRAY).text(l.desc, lx + 15, 170, { width: 175, align: "center" });
});

const layers2 = [
  { n: "5", title: "Auto-Rate", desc: "Если AI агент умер,\nконтракт сам повышает\nставку для защиты ликвидности", color: ORANGE },
  { n: "6", title: "Страховой фонд", desc: "10% от всех процентов идут\nв резерв для покрытия\nплохого долга", color: PURPLE },
  { n: "7", title: "Guardrail PDA", desc: "Параметры защиты хранятся\nв отдельном PDA — только\nauthority может менять", color: CYAN },
];
layers2.forEach((l, i) => {
  const lx = 130 + i * 250;
  card(doc, lx, 255, 225, 120);
  doc.fontSize(30).fillColor(l.color).text(l.n, lx + 10, 258, { width: 205, align: "center" });
  doc.fontSize(13).fillColor(l.color).text(l.title, lx + 10, 290, { width: 205, align: "center" });
  doc.fontSize(9).fillColor(GRAY).text(l.desc, lx + 15, 310, { width: 195, align: "center" });
});

doc.fontSize(15).fillColor(WHITE).text("AI может ошибиться. Контракт не позволит.", 0, 410, { width: W, align: "center" });
doc.fontSize(11).fillColor(GRAY).text("Каждое изменение = on-chain TX, проверяемая в Solana Explorer", 0, 435, { width: W, align: "center" });

footer(doc, "SolanaAI Lend", "5 / 7");

// ════════════════════════════════════════════════
// СЛАЙД 6: Почему мы лучше
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);
doc.fontSize(32).fillColor(WHITE).text("Почему мы ", 60, 45, { continued: true }).fillColor(CYAN).text("лучше");

doc.fontSize(12).fillColor(RED).text("Типичный подход", 80, 100, { width: 380 });
doc.fontSize(12).fillColor(CYAN).text("SolanaAI Lend", 530, 100, { width: 380 });

doc.moveTo(60, 120).lineTo(900, 120).lineWidth(1).strokeColor(CARD_BORDER).stroke();

const rows = [
  ["Данные -> LLM -> \"мне кажется...\"", "Данные -> Math -> ML -> Gemini интерпретирует"],
  ["LLM галлюцинирует числа", "Все числа из формул, Gemini только выбирает"],
  ["Нет мат. обоснования", "RSI + MACD + Bollinger + ATR + RandomForest"],
  ["Нет фильтрации новостей", "Sentiment: noise -> игнор, serious -> реакция"],
  ["AI советует, человек действует", "AI действует on-chain автономно (4 типа TX)"],
  ["Нет guard rails", "7 уровней: промпт -> валидатор -> контракт -> freeze -> auto-rate -> insurance -> PDA"],
  ["Статические веса моделей", "Самообучение: репутация моделей + динамические веса"],
  ["Фиксированный залог", "Dynamic LTV на основе волатильности в реальном времени"],
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
// СЛАЙД 7: Спасибо
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);

doc.fontSize(60).fillColor(PURPLE).text("Спасибо!", 0, 150, { align: "center" });
doc.moveTo(360, 220).lineTo(600, 220).lineWidth(2).strokeColor(CYAN).stroke();

doc.fontSize(18).fillColor(WHITE).text("AI думает. Контракт контролирует.", 0, 245, { align: "center" });

doc.fontSize(15).fillColor(CYAN).text("http://89.207.255.254", 0, 310, { align: "center" });
doc.fontSize(13).fillColor(PURPLE).text("github.com/Islambek201632838/solana-service", 0, 340, { align: "center" });

footer(doc, "National Solana Hackathon by Decentrathon 2026", "7 / 7");

// ── Finalize ──
doc.end();
console.log("Generated: docs/SolanaAI_Lend_Pitch.pdf (7 slides, RU)");
