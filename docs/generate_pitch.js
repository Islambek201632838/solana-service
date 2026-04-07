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

// ════════════════════════════════════════════════
// СЛАЙД 1: Титульный [Product & Idea — 20 баллов]
// ════════════════════════════════════════════════
bg(doc);
doc.fontSize(12).fillColor(GRAY).text("КЕЙС 2: AI + BLOCKCHAIN / AUTONOMOUS SMART CONTRACTS", 0, 120, { align: "center" });

doc.fontSize(52).fillColor(PURPLE).text("SolanaAI Lend", 0, 155, { align: "center" });
doc.moveTo(340, 218).lineTo(620, 218).lineWidth(2).strokeColor(CYAN).stroke();

doc.fontSize(16).fillColor("#ccccdd")
  .text("AI-агент автономно управляет лендинг-протоколом на Solana.", 0, 238, { align: "center" })
  .text("AI принимает решения. Контракт исполняет. Всё проверяемо on-chain.", 0, 262, { align: "center" });

doc.fontSize(11).fillColor(GRAY).text(
  "Solana Devnet  |  Gemini 2.0 Flash  |  6 ML моделей  |  Anchor/Rust  |  React  |  Docker  |  Open Source",
  0, 310, { align: "center" }
);

// Core value prop
card(doc, 180, 345, 600, 50);
doc.fontSize(12).fillColor(CYAN).text(
  "AI -> решение -> on-chain TX -> изменение состояния смарт-контракта",
  0, 358, { width: W, align: "center" }
);

doc.fontSize(13).fillColor(CYAN).text("Live: http://89.207.255.254", 0, 418, { align: "center" });
doc.fontSize(10).fillColor(PURPLE).text("github.com/Islambek201632838/solana-service", 0, 438, { align: "center" });

footer(doc, "National Solana Hackathon by Decentrathon 2026", "1 / 7");

// ════════════════════════════════════════════════
// СЛАЙД 2: Проблема + Ценность [Product & Idea]
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);
doc.fontSize(30).fillColor(WHITE).text("Проблема: ", 60, 45, { continued: true }).fillColor(RED).text("DeFi лендинг сломан");

const problems = [
  { title: "Статичные контракты", desc: "Смарт-контракты жёстко\nзапрограммированы — не\nадаптируются к изменениям\nрынка" },
  { title: "Ручное управление", desc: "Параметры меняются через\nDAO голосования — дни\nзадержки при волатильности" },
  { title: "AI без прозрачности", desc: "AI может анализировать\nданные, но его решения\nнепрозрачны и не\nпроверяемы" },
];
problems.forEach((p, i) => {
  const cx = 60 + i * 290;
  card(doc, cx, 105, 270, 140);
  doc.fontSize(15).fillColor(RED).text(p.title, cx + 20, 120);
  doc.fontSize(11).fillColor(GRAY).text(p.desc, cx + 20, 145, { width: 230 });
});

card(doc, 60, 270, 840, 90);
doc.fontSize(13).fillColor(ORANGE).text("Наше решение:", 85, 285);
doc.fontSize(12).fillColor(WHITE).text(
  "AI анализирует рынок каждые 2 минуты, принимает решения и исполняет их on-chain через смарт-контракт.",
  210, 283, { width: 670 }
);
doc.fontSize(12).fillColor(CYAN).text(
  "AI + блокчейн = автономная система, где решения прозрачны, проверяемы и исполняются без посредников.",
  210, 310, { width: 670 }
);

// Value prop for judges
card(doc, 60, 380, 840, 70);
doc.fontSize(11).fillColor(PURPLE).text("Реальный сценарий:", 80, 395);
doc.fontSize(11).fillColor(GRAY).text(
  "DeFi лендинг — рынок $30B+. Динамические ставки, адаптивный залог, автоматическая ликвидация — всё управляется AI автономно.",
  200, 395, { width: 680 }
);
doc.fontSize(11).fillColor(GRAY).text(
  "Применимо: страхование, кредиты, управление активами, управление рисками.",
  200, 420, { width: 680 }
);

footer(doc, "SolanaAI Lend", "2 / 7");

// ════════════════════════════════════════════════
// СЛАЙД 3: Как AI принимает решения [Technical Implementation — 25 баллов]
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);
doc.fontSize(30).fillColor(WHITE).text("AI ", 60, 40, { continued: true }).fillColor(PURPLE).text("принимает решения");

// Pipeline
const steps = ["Данные\nCoinGecko", "Индикаторы\nRSI MACD", "6 ML\nмоделей", "Новости\nGemini NLP", "Gemini AI\nрешение", "Валидатор\n11 правил", "TX\non-chain"];
const stepColors = [GRAY, CYAN, PURPLE, ORANGE, CYAN, RED, CYAN];
steps.forEach((s, i) => {
  const sx = 32 + i * 132;
  doc.roundedRect(sx, 90, 120, 50, 6).lineWidth(1).fillAndStroke(CARD_BG, stepColors[i]);
  doc.fontSize(8.5).fillColor(stepColors[i]).text(s, sx + 5, 100, { width: 110, align: "center" });
  if (i < steps.length - 1) {
    doc.fontSize(11).fillColor(GRAY).text("->", sx + 122, 108);
  }
});

// Key insight: AI -> decision -> on-chain TX
card(doc, 60, 160, 410, 110);
doc.fontSize(14).fillColor(CYAN).text("AI -> решение -> смарт-контракт", 80, 175);
doc.fontSize(10).fillColor(GRAY).text(
  "Каждые 2 мин AI анализирует 20+ метрик и отправляет TX:\n" +
  "• update_parameters — ставка, залог, лимит\n" +
  "• set_sol_price — цена SOL on-chain\n" +
  "• liquidate — ликвидация позиций\n" +
  "• ai_emergency_freeze — заморозка протокола",
  80, 198, { width: 370 }
);

card(doc, 500, 160, 400, 110);
doc.fontSize(14).fillColor(ORANGE).text("Все числа из математики", 520, 175);
doc.fontSize(10).fillColor(GRAY).text(
  "RSI, MACD, Bollinger, ATR, EMA — формулы.\n" +
  "RandomForest, IsolationForest, EWMA — ML модели.\n" +
  "Gemini только ИНТЕРПРЕТИРУЕТ и выбирает\n" +
  "из предвычисленного диапазона.\n" +
  "Никаких галлюцинаций в числах.",
  520, 198, { width: 360 }
);

// 6 ML models
doc.fontSize(13).fillColor(PURPLE).text("6 ML моделей с динамическими весами:", 60, 290);
const models = [
  ["RandomForest", "тренд (up/down/sideways)"],
  ["IsolationForest", "аномалии (крэши, пампы)"],
  ["EWMA", "режим волатильности"],
  ["Детектор крэшей", "вероятность обвала (6 сигналов)"],
  ["Скорер рисков", "композитный риск 0-100"],
  ["Предиктор утилиз.", "прогноз утилизации пула"],
];
models.forEach((m, i) => {
  const col = i < 3 ? 0 : 1;
  const row = i % 3;
  const mx = 75 + col * 440;
  const my = 315 + row * 25;
  doc.fontSize(10).fillColor(CYAN).text(m[0], mx, my, { width: 150 });
  doc.fontSize(10).fillColor(GRAY).text(m[1], mx + 155, my, { width: 250 });
});

// Self-improving
card(doc, 60, 400, 840, 50);
doc.fontSize(11).fillColor(ORANGE).text("Самообучение:", 80, 415);
doc.fontSize(10).fillColor(GRAY).text(
  "AI отслеживает точность каждой модели (скользящая точность) и автоматически перевзвешивает их. Точная модель получает больше влияния. Плохая — меньше (минимум 10%).",
  180, 415, { width: 700 }
);

footer(doc, "SolanaAI Lend", "3 / 7");

// ════════════════════════════════════════════════
// СЛАЙД 4: Use of Solana [15 баллов] + Автономность
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);
doc.fontSize(30).fillColor(WHITE).text("Solana: ", 60, 40, { continued: true }).fillColor(CYAN).text("не ради галочки");

// 23 instructions
doc.fontSize(13).fillColor(PURPLE).text("23 инструкции смарт-контракта (Rust/Anchor):", 60, 90);

const instrGroups = [
  { title: "Пользователь (6)", items: "deposit, withdraw, deposit_collateral,\nwithdraw_collateral, borrow, repay", color: CYAN },
  { title: "AI агент (4)", items: "update_parameters, set_sol_price,\nliquidate, ai_emergency_freeze", color: ORANGE },
  { title: "Защита (5)", items: "init_guardrails, update_guardrails,\nemergency_freeze, unfreeze, cover_bad_debt", color: RED },
  { title: "Система (8)", items: "initialize_pool, accrue_interest,\nset_roles, activate/deactivate_crisis,\nmigrate_pool, fix_pool_timestamp,\nget_health_factor", color: PURPLE },
];
instrGroups.forEach((g, i) => {
  const gx = 60 + (i % 2) * 440;
  const gy = 115 + Math.floor(i / 2) * 100;
  card(doc, gx, gy, 420, 90);
  doc.fontSize(12).fillColor(g.color).text(g.title, gx + 15, gy + 10);
  doc.fontSize(9.5).fillColor(GRAY).text(g.items, gx + 15, gy + 30, { width: 390 });
});

// On-chain data
doc.fontSize(13).fillColor(PURPLE).text("3 PDA аккаунта хранят ВСЁ состояние on-chain:", 60, 330);

const pdas = [
  { name: "LendingPool", desc: "депозиты, займы, ставки, залог,\nстрахование, настроение, кризис", color: CYAN },
  { name: "UserPosition", desc: "депозит, долг, залог SOL,\nтир лояльности, здоровье, кредитный рейтинг", color: ORANGE },
  { name: "GuardrailConfig", desc: "мин/макс ставка, мин/макс залог,\nзадержка, макс изменение — неизменяемо для AI", color: RED },
];
pdas.forEach((p, i) => {
  const px = 60 + i * 300;
  card(doc, px, 355, 280, 80);
  doc.fontSize(12).fillColor(p.color).text(p.name, px + 15, 365);
  doc.fontSize(9).fillColor(GRAY).text(p.desc, px + 15, 385, { width: 250 });
});

// Autonomy level
card(doc, 60, 450, 840, 40);
doc.fontSize(11).fillColor(CYAN).text(
  "Полная автономность: AI агент работает 24/7, каждые 2 мин: данные -> анализ -> решение -> TX -> изменение on-chain состояния. Без участия человека.",
  80, 460, { width: 800 }
);

footer(doc, "SolanaAI Lend", "4 / 7");

// ════════════════════════════════════════════════
// СЛАЙД 5: Безопасность + Innovation [15 баллов]
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);
doc.fontSize(30).fillColor(WHITE).text("Инновации + ", 60, 40, { continued: true }).fillColor(CYAN).text("7 уровней защиты");

// Innovation features
doc.fontSize(13).fillColor(PURPLE).text("Что нас отличает:", 60, 85);
const innovations = [
  [ORANGE, "Динамический залог", "AI меняет залог по волатильности: спокойно -5%, шторм +10%, экстрим +20%"],
  [CYAN, "Кредитный рейтинг", "5 on-chain факторов -> 4 тира. Платина: -15% залог, -10% ставка"],
  [RED, "Детекция крэшей", "6 сигналов предсказывают обвал ЗАРАНЕЕ. >80% = авто-заморозка"],
  [PURPLE, "Монте-Карло", "500 симуляций -> вероятность ликвидации на 1ч/4ч/24ч"],
  [ORANGE, "Самообучение", "Репутация моделей: точные получают больше веса автоматически"],
  [CYAN, "Фильтр новостей", "Шум (твиты) vs серьёзное (SEC). Gemini NLP классификация"],
];
innovations.forEach((f, i) => {
  const fy = 110 + i * 26;
  doc.fontSize(10).fillColor(f[0]).text(f[1], 75, fy, { width: 130 });
  doc.fontSize(10).fillColor(GRAY).text(f[2], 210, fy, { width: 680 });
});

// 7 safety layers
doc.fontSize(13).fillColor(PURPLE).text("7 уровней безопасности:", 60, 280);
const layers = [
  { n: "1", title: "Промпт", desc: "Жёсткий формат\nвывода Gemini", color: PURPLE },
  { n: "2", title: "Валидатор", desc: "11 правил ДО\nотправки TX", color: CYAN },
  { n: "3", title: "Контракт", desc: "Лимиты on-chain:\nставка, залог, задержка", color: CYAN },
  { n: "4", title: "Заморозка", desc: "Авто-заморозка\nпри риске > 90", color: RED },
];
layers.forEach((l, i) => {
  const lx = 60 + i * 220;
  card(doc, lx, 305, 205, 80);
  doc.fontSize(22).fillColor(l.color).text(l.n, lx + 10, 308, { width: 185, align: "center" });
  doc.fontSize(11).fillColor(l.color).text(l.title, lx + 10, 332, { width: 185, align: "center" });
  doc.fontSize(8).fillColor(GRAY).text(l.desc, lx + 15, 348, { width: 175, align: "center" });
});

const layers2 = [
  { n: "5", title: "Авто-ставка", desc: "Контракт сам\nзащищает если AI умер", color: ORANGE },
  { n: "6", title: "Страхование", desc: "10% процентов ->\nстраховой фонд", color: PURPLE },
  { n: "7", title: "Защитный PDA", desc: "Только администратор\nменяет параметры", color: CYAN },
];
layers2.forEach((l, i) => {
  const lx = 130 + i * 250;
  card(doc, lx, 400, 225, 75);
  doc.fontSize(20).fillColor(l.color).text(l.n, lx + 10, 402, { width: 205, align: "center" });
  doc.fontSize(11).fillColor(l.color).text(l.title, lx + 10, 424, { width: 205, align: "center" });
  doc.fontSize(8).fillColor(GRAY).text(l.desc, lx + 15, 440, { width: 195, align: "center" });
});

footer(doc, "SolanaAI Lend", "5 / 7");

// ════════════════════════════════════════════════
// СЛАЙД 6: Архитектура + UX [UX 10 + Technical 25]
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);
doc.fontSize(30).fillColor(WHITE).text("Архитектура + ", 60, 40, { continued: true }).fillColor(CYAN).text("интерфейс");

// Architecture
const arch = [
  { name: "Смарт-контракт", desc: "Anchor/Rust, 23 инструкции\n3 PDA, события, защитные ограничения", color: RED },
  { name: "AI-агент", desc: "Python, 3 процесса\nGemini + 6 ML + анализ новостей", color: ORANGE },
  { name: "Бэкенд", desc: "FastAPI, WebSocket\nSQLite, Solana RPC", color: PURPLE },
  { name: "Фронтенд", desc: "React + Vite + Tailwind\nEN/RU, адаптивный, кошелёк", color: CYAN },
];
arch.forEach((a, i) => {
  card(doc, 60, 80 + i * 60, 420, 52);
  doc.fontSize(13).fillColor(a.color).text(a.name, 75, 90 + i * 60);
  doc.fontSize(9).fillColor(GRAY).text(a.desc, 75, 106 + i * 60, { width: 385 });
});

// Stats
const stats = [
  { n: "23", label: "инструкций\nконтракта", c: PURPLE },
  { n: "6", label: "ML\nмоделей", c: CYAN },
  { n: "7", label: "уровней\nзащиты", c: RED },
  { n: "5", label: "Docker\nконтейнеров", c: ORANGE },
];
stats.forEach((s, i) => {
  const sx = 530 + (i % 2) * 200;
  const sy = 85 + Math.floor(i / 2) * 80;
  doc.fontSize(32).fillColor(s.c).text(s.n, sx, sy, { width: 80, align: "center" });
  doc.fontSize(9).fillColor(GRAY).text(s.label, sx - 20, sy + 38, { width: 120, align: "center" });
});

// UX features
doc.fontSize(13).fillColor(PURPLE).text("Пользовательский опыт:", 60, 330);
const ux = [
  "Дашборд: все метрики в одном месте — депозиты, займы, здоровье, страховка, настроение",
  "AI решения: карточки решений с ML метриками + объяснение на EN/RU",
  "Симулятор: \"что если AI изменит ставку\" — интерактивная симуляция",
  "Кредитный рейтинг: персональный виджет с тиром и скидками",
  "Очередь ликвидаций: позиции под угрозой + Монте-Карло предсказание",
  "Адаптивный интерфейс: компьютер + мобильный, 2 языка (EN/RU)",
  "Подключение кошелька: Phantom / Solflare для реальных транзакций",
];
ux.forEach((u, i) => {
  doc.fontSize(9.5).fillColor(CYAN).text("•", 70, 355 + i * 18);
  doc.fontSize(9.5).fillColor(GRAY).text(u, 85, 355 + i * 18, { width: 820 });
});

footer(doc, "SolanaAI Lend", "6 / 7");

// ════════════════════════════════════════════════
// СЛАЙД 7: Спасибо [Demo & Presentation — 10 баллов]
// ════════════════════════════════════════════════
doc.addPage({ size: [W, H], margin: 0 });
bg(doc);

doc.fontSize(52).fillColor(PURPLE).text("Спасибо!", 0, 100, { align: "center" });
doc.moveTo(370, 162).lineTo(590, 162).lineWidth(2).strokeColor(CYAN).stroke();

doc.fontSize(18).fillColor(WHITE).text("AI думает. Контракт контролирует. Проверяй on-chain.", 0, 185, { align: "center" });

// Key proof points for judges
card(doc, 180, 230, 600, 120);
doc.fontSize(12).fillColor(PURPLE).text("Для жюри — чек-лист кейса 2:", 200, 245);
doc.fontSize(10).fillColor(CYAN).text("+", 200, 270); doc.fontSize(10).fillColor(GRAY).text("AI принимает решения (6 ML моделей + Gemini)", 215, 270, { width: 540 });
doc.fontSize(10).fillColor(CYAN).text("+", 200, 290); doc.fontSize(10).fillColor(GRAY).text("Решения исполняются on-chain (4 типа транзакций)", 215, 290, { width: 540 });
doc.fontSize(10).fillColor(CYAN).text("+", 200, 310); doc.fontSize(10).fillColor(GRAY).text("Полная автономность (24/7, каждые 2 мин, без человека)", 215, 310, { width: 540 });
doc.fontSize(10).fillColor(CYAN).text("+", 200, 330); doc.fontSize(10).fillColor(GRAY).text("Проверяемо: каждое решение = транзакция в Solana Explorer", 215, 330, { width: 540 });

doc.fontSize(14).fillColor(CYAN).text("http://89.207.255.254", 0, 385, { align: "center" });
doc.fontSize(11).fillColor(PURPLE).text("github.com/Islambek201632838/solana-service", 0, 408, { align: "center" });

footer(doc, "National Solana Hackathon by Decentrathon 2026", "7 / 7");

doc.end();
console.log("Generated: SolanaAI_Lend_Pitch.pdf (7 slides, RU, criteria-aligned)");
