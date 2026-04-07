const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const FONT = path.join(__dirname, "fonts", "NotoSans.ttf");

const PURPLE = "#9945FF";
const CYAN = "#14F195";
const RED = "#FF4D6A";
const ORANGE = "#FF9900";
const WHITE = "#FFFFFF";
const GRAY = "#8888AA";
const BG = "#0a0a1a";
const CARD_BG = "#161630";
const CARD_BORDER = "#2a2a50";

function createDoc(filename) {
  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  doc.pipe(fs.createWriteStream(path.join(__dirname, filename)));
  doc.registerFont("Noto", FONT);
  doc.font("Noto");
  return doc;
}

function bg(doc) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(BG);
  doc.rect(0, 0, doc.page.width, 4).fill(PURPLE);
}

function title(doc, text, sub) {
  bg(doc);
  doc.fontSize(28).fillColor(PURPLE).text(text, 50, 50);
  doc.moveTo(50, 88).lineTo(300, 88).lineWidth(2).strokeColor(CYAN).stroke();
  if (sub) {
    doc.fontSize(11).fillColor(GRAY).text(sub, 50, 98);
  }
}

function section(doc, time, heading, y) {
  doc.fontSize(14).fillColor(CYAN).text(time, 50, y);
  doc.fontSize(14).fillColor(WHITE).text(heading, 110, y);
  return y + 24;
}

function body(doc, text, y, indent) {
  const x = indent || 50;
  doc.fontSize(10.5).fillColor(GRAY);
  const h = doc.heightOfString(text, { width: 495 - (x - 50) });
  if (y + h > 780) {
    doc.addPage();
    bg(doc);
    y = 50;
  }
  doc.fontSize(10.5).fillColor(GRAY).text(text, x, y, { width: 495 - (x - 50) });
  return y + h + 8;
}

function quote(doc, text, y) {
  const h = doc.fontSize(11).heightOfString(text, { width: 430 });
  if (y + h + 20 > 770) {
    doc.addPage();
    bg(doc);
    y = 50;
  }
  doc.roundedRect(52, y - 4, 460, h + 18, 6).lineWidth(1).fillAndStroke(CARD_BG, CARD_BORDER);
  doc.fontSize(11).fillColor("#ccccdd").text(text, 62, y + 4, { width: 430 });
  return y + h + 26;
}

function bullet(doc, text, y, color) {
  const h = doc.fontSize(10.5).heightOfString("  •  " + text, { width: 450 });
  if (y + h > 770) {
    doc.addPage();
    bg(doc);
    y = 50;
  }
  doc.fontSize(10.5).fillColor(color || GRAY).text("  •  " + text, 55, y, { width: 450 });
  return y + h + 6;
}

function footer(doc) {
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor(GRAY)
      .text("SolanaAI Lend", 50, 810, { width: 200 })
      .text(`${i + 1} / ${pages.count}`, 445, 810, { width: 50, align: "right" });
  }
}

// ═══════════════════════════════════════
// DEMO SCRIPT PDF (3 min)
// ═══════════════════════════════════════
function generateDemo() {
  const doc = createDoc("SolanaAI_Lend_Demo_Script.pdf");

  title(doc, "Демо-скрипт (3 мин)", "SolanaAI Lend — запись экрана / видео-демо");

  let y = 130;

  // 0:00
  y = section(doc, "0:00", "Вступление", y);
  y = quote(doc, "SolanaAI Lend — автономный AI-powered лендинг-протокол на Solana. AI управляет ставками, залогом и лимитами в реальном времени, а смарт-контракт обеспечивает жёсткие ограничения безопасности. Давайте покажу как это работает.", y);

  // 0:15
  y = section(doc, "0:15", "Обзор дашборда (30 сек)", y);
  y = bullet(doc, "Показать: ставка, депозиты, займы, цена SOL, утилизация", y);
  y = bullet(doc, "Protocol Mood badge: Calm / Cautious / Stressed / Crisis — оценка риска AI", y);
  y = bullet(doc, "Insurance Fund: 10% от всех процентов идут в страховой фонд", y);
  y = bullet(doc, "Health Factor bar + очередь ликвидаций", y);
  y = quote(doc, "Вот наш живой дашборд. Протокол работает на Solana devnet прямо сейчас.", y);

  // 0:45
  y = section(doc, "0:45", "AI решения (35 сек)", y);
  y = bullet(doc, "Кликнуть \"AI Decisions\" — показать карточку решения", y);
  y = quote(doc, "Каждые 2 минуты AI запускает полный пайплайн: 5 индикаторов (RSI, MACD, Bollinger, ATR, EMA) + 6 ML моделей для тренда, аномалий, волатильности, крэша, рисков и утилизации.", y);
  y = bullet(doc, "Показать reasoning текст: Gemini 2.0 Flash на EN/RU", y);
  y = bullet(doc, "Model Performance: точность каждой модели + динамические веса", y);
  y = bullet(doc, "Кликнуть \"Смотреть TX\" → Solana Explorer — проверяемая транзакция", y);

  // 1:20
  y = section(doc, "1:20", "Безопасность (30 сек)", y);
  y = quote(doc, "7 уровней безопасности — вот что отличает нас от \"доверяй AI\":", y);
  const layers = [
    ["1. Промпт", "ограничивает формат вывода Gemini"],
    ["2. Валидатор", "11 правил проверки ДО отправки TX"],
    ["3. Контракт", "дублирует лимиты on-chain — обойти невозможно"],
    ["4. AI Freeze", "заморозка при вероятности крэша > 80%"],
    ["5. Auto-Rate", "контракт сам повышает ставку если AI умер"],
    ["6. Insurance", "страховой фонд из 10% процентов"],
    ["7. Guardrail PDA", "параметры защиты — только authority может менять"],
  ];
  layers.forEach(([name, desc]) => {
    y = bullet(doc, `${name} — ${desc}`, y, CYAN);
  });

  // 1:50
  y = section(doc, "1:50", "Умные фичи (40 сек)", y);
  y = bullet(doc, "Dynamic LTV: AI меняет залог по волатильности. Calm: -5%, Storm: +10%, Extreme: +20%", y, ORANGE);
  y = bullet(doc, "Credit Score: 5 on-chain факторов → 4 тира. Platinum: -15% залог, -10% ставка", y, ORANGE);
  y = bullet(doc, "Crash Detection: 6 сигналов → авто-freeze при >80%. Volume spike, моментум, SMA", y, RED);
  y = bullet(doc, "Monte Carlo: 500 симуляций предсказывают ликвидацию на 1ч / 4ч / 24ч", y, ORANGE);

  // 2:30
  y = section(doc, "2:30", "Архитектура (20 сек)", y);
  y = quote(doc, "5 Docker контейнеров: nginx, React, FastAPI + Solana RPC, AI агент с ML, симулятор активности. Gemini упал → ML-only. Агент умер → auto-rate. Протокол НИКОГДА не останавливается.", y);

  // 2:50
  y = section(doc, "2:50", "Итог (10 сек)", y);
  y = quote(doc, "SolanaAI Lend: AI думает, контракт контролирует. Не \"поверь AI\" — а \"проверь on-chain\". Работает на 89.207.255.254. Код открытый.", y);
  y = body(doc, "GitHub: github.com/Islambek201632838/solana-service", y);

  footer(doc);
  doc.end();
  console.log("Generated: SolanaAI_Lend_Demo_Script.pdf");
}

// ═══════════════════════════════════════
// PITCH SCRIPT PDF (2 min)
// ═══════════════════════════════════════
function generatePitch() {
  const doc = createDoc("SolanaAI_Lend_Pitch_Script.pdf");

  title(doc, "Питч-скрипт (2 мин)", "SolanaAI Lend — живой питч для жюри");

  let y = 130;

  // 0:00
  y = section(doc, "0:00", "Проблема (20 сек)", y);
  y = quote(doc, "DeFi лендинг-протоколы используют статичные параметры. Фиксированные ставки. Фиксированный залог. Когда рынок падает — каскадные ликвидации и миллионные потери. Aave потерял $1.6M за один инцидент. DeFi нужен интеллект.", y);

  // 0:20
  y = section(doc, "0:20", "Решение (20 сек)", y);
  y = quote(doc, "SolanaAI Lend — автономный AI-powered лендинг на Solana. Каждые 2 минуты: 5 индикаторов, 6 ML моделей, анализ новостей и Gemini — оптимальные параметры прямо в блокчейн. Не через часы. Не через голосования. За минуты.", y);

  // 0:40
  y = section(doc, "0:40", "Как это работает (25 сек)", y);
  y = quote(doc, "Пайплайн: CoinGecko → RSI, MACD, Bollinger → RandomForest, IsolationForest, EWMA, Crash Detector, Risk Scorer, Utilization Predictor → Gemini синтезирует → Валидатор: 11 правил → Контракт: лимиты on-chain. Семь уровней защиты. AI за рамками — TX отклоняется.", y);

  // 1:05
  y = section(doc, "1:05", "Чем мы отличаемся (30 сек)", y);
  y = bullet(doc, "Самообучающийся AI — репутация моделей, динамические веса", y, CYAN);
  y = bullet(doc, "Детекция крэшей — 6 сигналов, >80% = авто-freeze без человека", y, RED);
  y = bullet(doc, "On-chain кредитный скоринг — 5 факторов, 4 тира, персональные условия", y, ORANGE);
  y = bullet(doc, "7 уровней защиты — Guardrail PDA, insurance, auto-rate, freeze", y, PURPLE);

  // 1:35
  y = section(doc, "1:35", "Техническая глубина (15 сек)", y);
  y = quote(doc, "Работает на Solana devnet прямо сейчас. 23 инструкции контракта на Rust/Anchor. React дашборд с WebSocket. 5 Docker контейнеров. Сотни on-chain решений — каждое проверяемо в Solana Explorer. Это не мокап — это работающий протокол.", y);

  // 1:50
  y = section(doc, "1:50", "Итог (10 сек)", y);
  y = quote(doc, "DeFi статичен. Рынки динамичны. SolanaAI Lend закрывает разрыв — AI адаптируется в реальном времени, контракт контролирует безопасность. AI думает. Контракт контролирует. Проверяй on-chain.", y);
  y = body(doc, "Live: http://89.207.255.254  |  GitHub: github.com/Islambek201632838/solana-service", y);

  // Key stats
  y += 15;
  y = section(doc, "", "Ключевые цифры", y);
  const stats = [
    "6 ML моделей с динамическими весами репутации",
    "7 уровней безопасности (промпт → валидатор → контракт → freeze → auto-rate → insurance → PDA)",
    "23 инструкции смарт-контракта",
    "5 Docker контейнеров",
    "2-минутный цикл решений",
    "11 правил валидации",
    "500 Monte Carlo симуляций для ликвидации",
    "5-факторный on-chain кредитный скоринг с 4 тирами",
  ];
  stats.forEach((s) => {
    y = bullet(doc, s, y, CYAN);
  });

  footer(doc);
  doc.end();
  console.log("Generated: SolanaAI_Lend_Pitch_Script.pdf");
}

generateDemo();
generatePitch();
