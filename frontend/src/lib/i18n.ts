const translations = {
  en: {
    // Nav
    dashboard: "Dashboard",
    deposit: "Deposit",
    borrow: "Borrow",
    aiDecisions: "AI Decisions",
    analytics: "Analytics",
    devnetOnly: "Devnet Only",

    // Dashboard
    dashboardTitle: "Dashboard",
    dashboardSubtitle: "AI-powered lending on Solana Devnet",
    recentAiDecisions: "Recent AI Decisions",
    noAiDecisions: "No AI decisions yet — start the AI agent",
    poolNotConnected: "Pool not connected — deploy to devnet first",
    noRateHistory: "No rate history yet — AI agent needs to run",
    interestRateHistory: "Interest Rate History",

    // Stats
    totalDeposits: "Total Deposits",
    interestRate: "Interest Rate",
    totalBorrows: "Total Borrows",
    aiUpdates: "AI Updates",
    utilization: "utilization",
    collateral: "Collateral",
    liquidity: "Liquidity",
    liquidations: "liquidations",

    // Deposit
    depositTitle: "Deposit",
    depositAiusdc: "Deposit aiUSDC",
    amountPlaceholder: "Amount (aiUSDC)",
    signing: "Signing...",
    depositBtn: "Deposit",
    balance: "Balance",
    yourPosition: "Your Position",
    deposited: "Deposited",
    poolUtilization: "Pool Utilization",
    connectWalletFirst: "Connect wallet first",

    // Borrow
    borrowTitle: "Borrow",
    borrowAiusdc: "Borrow aiUSDC",
    borrowBtn: "Borrow",
    collateralLabel: "Collateral",
    availableToBorrow: "Available to borrow",
    borrowCapacity: "of borrow capacity used",

    // AI Decisions
    aiDecisionsTitle: "AI Decisions",
    total: "total",
    allRiskLevels: "All Risk Levels",
    time: "Time",
    rate: "Rate",
    change: "Change",
    risk: "Risk",
    confidence: "Confidence",
    tx: "TX",
    view: "View",
    viewTx: "View TX",
    loadMore: "Load More",

    // Analytics
    analyticsTitle: "Analytics",
    riskScore: "Risk Score",
    noRateData: "No rate data yet",
    noRiskData: "No risk data yet",

    // Mood
    frozen: "FROZEN",
    moodThriving: "Thriving",
    moodCalm: "Calm",
    moodCautious: "Cautious",
    moodDefensive: "Defensive",
    moodEmergency: "Emergency",

    // Wallet
    selectWallet: "Select Wallet",
    connected: "Connected",
    disconnect: "Disconnect",

    // Risk levels
    riskLow: "Low",
    riskMedium: "Medium",
    riskHigh: "High",
    riskCritical: "Critical",

    // Status
    confirmed: "Confirmed",
    txFailed: "TX Failed",
    rejected: "Rejected",
    pending: "Pending",

    // ML indicators
    mlTrendUp: "Growth",
    mlTrendDown: "Decline",
    mlTrendSideways: "Sideways",
    mlTrendHold: "Hold",
    mlVolLow: "Low volatility",
    mlVolMedium: "Medium volatility",
    mlVolHigh: "High volatility",
    mlVolUnknown: "Volatility N/A",
    mlAnomaly: "ANOMALY",
    mlPriceOnchain: "Price on-chain",
    mlFeatures: "Key factors",
    sentimentNoise: "No significant news",
    sentimentNotable: "Notable event",
    sentimentSerious: "Serious event",
    sentimentCritical: "Critical event",
    // Rates
    lendRate: "Lend APY",
    borrowRate: "Borrow APR",
    protocolFee: "Protocol fee",

    // Activity
    recentActivity: "Recent Activity",
    noActivity: "No activity yet",
    actDeposit: "Deposit",
    actBorrow: "Borrow",
    actRepay: "Repay",
    actCollateral: "Collateral",
    actLiquidate: "Liquidation",
  },
  ru: {
    dashboard: "Дашборд",
    deposit: "Депозит",
    borrow: "Займ",
    aiDecisions: "AI Решения",
    analytics: "Аналитика",
    devnetOnly: "Только Devnet",

    dashboardTitle: "Дашборд",
    dashboardSubtitle: "AI-лендинг протокол на Solana Devnet",
    recentAiDecisions: "Последние AI решения",
    noAiDecisions: "Нет AI решений — запустите AI агент",
    poolNotConnected: "Пул не подключён — задеплойте на devnet",
    noRateHistory: "Нет истории ставок — нужен AI агент",
    interestRateHistory: "История процентной ставки",

    totalDeposits: "Всего депозитов",
    interestRate: "Процентная ставка",
    totalBorrows: "Всего займов",
    aiUpdates: "AI обновлений",
    utilization: "утилизация",
    collateral: "Залог",
    liquidity: "Ликвидность",
    liquidations: "ликвидаций",

    depositTitle: "Депозит",
    depositAiusdc: "Внести aiUSDC",
    amountPlaceholder: "Сумма (aiUSDC)",
    signing: "Подпись...",
    depositBtn: "Внести",
    balance: "Баланс",
    yourPosition: "Ваша позиция",
    deposited: "Внесено",
    poolUtilization: "Утилизация пула",
    connectWalletFirst: "Подключите кошелёк",

    borrowTitle: "Займ",
    borrowAiusdc: "Занять aiUSDC",
    borrowBtn: "Занять",
    collateralLabel: "Залог",
    availableToBorrow: "Доступно для займа",
    borrowCapacity: "от лимита займа использовано",

    aiDecisionsTitle: "AI Решения",
    total: "всего",
    allRiskLevels: "Все уровни риска",
    time: "Время",
    rate: "Ставка",
    change: "Изменение",
    risk: "Риск",
    confidence: "Уверенность",
    tx: "TX",
    view: "Смотреть",
    viewTx: "Смотреть TX",
    loadMore: "Загрузить ещё",

    analyticsTitle: "Аналитика",
    riskScore: "Оценка риска",
    noRateData: "Нет данных о ставках",
    noRiskData: "Нет данных о рисках",

    frozen: "ЗАМОРОЖЕН",
    moodThriving: "Процветает",
    moodCalm: "Спокойно",
    moodCautious: "Осторожно",
    moodDefensive: "Защита",
    moodEmergency: "Экстренно",

    selectWallet: "Выбрать кошелёк",
    connected: "Подключён",
    disconnect: "Отключить",

    riskLow: "Низкий",
    riskMedium: "Средний",
    riskHigh: "Высокий",
    riskCritical: "Критический",

    confirmed: "Подтверждено",
    txFailed: "TX ошибка",
    rejected: "Отклонено",
    pending: "Ожидание",

    mlTrendUp: "Рост",
    mlTrendDown: "Падение",
    mlTrendSideways: "Боковик",
    mlTrendHold: "Без изменений",
    mlVolLow: "Низкая волатильность",
    mlVolMedium: "Средняя волатильность",
    mlVolHigh: "Высокая волатильность",
    mlVolUnknown: "Волатильность Н/Д",
    mlAnomaly: "АНОМАЛИЯ",
    mlPriceOnchain: "Цена on-chain",
    mlFeatures: "Ключевые факторы",
    sentimentNoise: "Нет значимых новостей",
    sentimentNotable: "Важное событие",
    sentimentSerious: "Серьёзное событие",
    sentimentCritical: "Критическое событие",
    lendRate: "Доход лендера",
    borrowRate: "Ставка займа",
    protocolFee: "Комиссия протокола",

    recentActivity: "Последние операции",
    noActivity: "Нет операций",
    actDeposit: "Депозит",
    actBorrow: "Займ",
    actRepay: "Возврат",
    actCollateral: "Залог",
    actLiquidate: "Ликвидация",
  },
} as const;

export type Lang = "en" | "ru";
export type TranslationKey = keyof typeof translations.en;

export function t(lang: Lang, key: TranslationKey): string {
  return translations[lang][key] || translations.en[key] || key;
}
