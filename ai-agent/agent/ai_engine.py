"""AI Engine — Gemini integration for parameter decisions.

Sends QuantReport to Gemini and parses structured JSON response.
"""

import json
import re

import google.generativeai as genai

from config import Settings


class AiEngine:
    def __init__(self, settings: Settings):
        genai.configure(api_key=settings.gemini_api_key)
        self.model = genai.GenerativeModel(settings.gemini_model)

    async def interpret(self, quant_report: dict) -> dict:
        """Send QuantReport to Gemini and get parameter decision.

        Returns parsed JSON with: interest_rate_bps, collateral_ratio_bps,
        max_borrow_limit, reasoning_short, confidence, risk_level
        """
        prompt = self._build_prompt(quant_report)

        for attempt in range(2):
            try:
                response = await self.model.generate_content_async(prompt)
                text = response.text
                return self._parse_response(text)
            except Exception as e:
                if attempt == 1:
                    print(f"[ERROR] Gemini failed after 2 attempts: {e}")
                    return self._fallback_decision(quant_report)
                print(f"[WARN] Gemini attempt {attempt + 1} failed: {e}, retrying...")

        return self._fallback_decision(quant_report)

    def _build_prompt(self, report: dict) -> str:
        return f"""Ты — AI риск-менеджер для Solana DeFi лендинг-протокола.

На основе рыночного анализа ниже, определи оптимальные параметры протокола.

## Текущий рыночный анализ
- Цена SOL: ${report.get('sol_price', 0):.2f}
- Изменение за 24ч: {report.get('price_change_24h', 0):.2f}%
- RSI: {report.get('rsi', 50):.1f}
- MACD: {json.dumps(report.get('macd', {}))}
- Полосы Боллинджера: {json.dumps(report.get('bollinger', {}))}
- ATR (волатильность): {report.get('atr', 0)}
- EMA Crossover: {report.get('ema_crossover', 'no_cross')}

## Анализ рисков
- Оценка риска: {report.get('risk_score', 50)}/100
- Уровень риска: {report.get('risk_level', 'medium')}
- Волатильность: {json.dumps(report.get('volatility', {}))}
- Аномалия: {json.dumps(report.get('anomaly', {}))}
- Тренд: {json.dumps(report.get('trend', {}))}

## Состояние пула (ВАЖНО — основной фактор для ставки!)
- Текущая ставка: {report.get('current_rate_bps', 500)} bps ({report.get('current_rate_bps', 500) / 100}%)
- Утилизация: {report.get('utilization', 0):.2%} {'⚠️ ВЫСОКАЯ — ПОВЫСЬ СТАВКУ!' if report.get('utilization', 0) > 0.3 else ''}
- Оптимальная ставка по формуле Aave: {report.get('optimal_rate_bps', 500)} bps ({report.get('optimal_rate_bps', 500) / 100}%) ← ОРИЕНТИРУЙСЯ НА ЭТО ЧИСЛО
- Прогноз утилизации: {report.get('predicted_utilization', 0):.2%}
ПРАВИЛО: Если утилизация >30%, ставка ДОЛЖНА быть БЛИЖЕ к оптимальной (кривая Aave). Не оставляй старую ставку при высокой утилизации!
- Тренд утилизации: {report.get('util_trend', 'stable')} (история: {report.get('util_history', [])})
- Если тренд RISING — повышай ставку АГРЕССИВНЕЕ (заёмщики разгоняются)
- Если тренд FALLING — снижай ставку МЯГКО (не резко, дай стабилизироваться)
- Если тренд STABLE — двигайся к оптимальной ставке плавно

## ML модель (RandomForest)
- Прогноз тренда: {report.get('ml', {}).get('trend', {}).get('direction', 'hold')}
- Вероятности: up={report.get('ml', {}).get('trend', {}).get('probabilities', {}).get('up', 0):.0%}, down={report.get('ml', {}).get('trend', {}).get('probabilities', {}).get('down', 0):.0%}, sideways={report.get('ml', {}).get('trend', {}).get('probabilities', {}).get('sideways', 0):.0%}
- Точность модели на истории: {report.get('ml', {}).get('trend', {}).get('accuracy_estimate', 0):.1f}% (если <40% — не доверяй модели)
- Ключевые факторы: {json.dumps(dict(list(report.get('ml', {}).get('trend', {}).get('feature_importance', {}).items())[:5]))}

## Математический сигнал
- Рекомендация: {report.get('recommended_rate_direction', 'hold')}
- Уверенность мат. модели: {report.get('math_confidence', 0)}%
- Голоса индикаторов: {json.dumps(report.get('votes', {}))}

## Новостной сентимент
- Общий сентимент: {report.get('sentiment', {}).get('overall_sentiment', 0):+.2f} (от -1 до +1)
- Серьёзность: {report.get('sentiment', {}).get('overall_severity', 'noise')}
- Влияет на решение: {'ДА' if report.get('sentiment', {}).get('should_affect_decision', False) else 'НЕТ (шум)'}
- Сводка EN: {report.get('sentiment', {}).get('summary_en', 'N/A')}
- Серьёзные события: {json.dumps([e.get('title', '') for e in report.get('sentiment', {}).get('serious_events', [])[:3]], ensure_ascii=False)}
ВАЖНО: Если severity="noise" — ИГНОРИРУЙ сентимент. Реагируй ТОЛЬКО на "notable"/"serious"/"critical".

## Правила (СТРОГО соблюдай)
- interest_rate_bps: от 100 до 2000
- collateral_ratio_bps: от 12000 до 20000
- max_borrow_limit: в токенах с 6 decimals, диапазон 1B-50B
- Изменение ставки от текущей ≤ 20%
- Изменение залога от текущего ≤ 20%
- ВАЖНО: collateral_ratio_bps ОСТАВЬ ТЕКУЩИЙ если нет серьёзной причины менять. Текущий = {report.get('current_collateral_bps', 12000)}
- confidence: от 0 до 100
- risk_level: только low, medium, high, critical

Ответь ТОЛЬКО валидным JSON (без markdown, без пояснений):
{{
  "interest_rate_bps": <число>,
  "collateral_ratio_bps": <число>,
  "max_borrow_limit": <число>,
  "reasoning_en": "<макс 200 символов, объяснение на английском>",
  "reasoning_ru": "<макс 200 символов, объяснение на русском>",
  "confidence": <число 0-100>,
  "risk_level": "<low|medium|high|critical>"
}}"""

    def _parse_response(self, text: str) -> dict:
        """Parse JSON from Gemini response, handling markdown code blocks."""
        # Strip markdown ```json ... ``` wrapper
        cleaned = re.sub(r"```json\s*", "", text)
        cleaned = re.sub(r"```\s*", "", cleaned)
        cleaned = cleaned.strip()

        data = json.loads(cleaned)

        # Ensure all required fields exist with correct types
        # Build reasoning_short for on-chain (EN), keep both for off-chain
        reasoning_en = str(data.get("reasoning_en", data.get("reasoning_short", "")))[:256]
        reasoning_ru = str(data.get("reasoning_ru", reasoning_en))[:256]

        return {
            "interest_rate_bps": int(data["interest_rate_bps"]),
            "collateral_ratio_bps": int(data["collateral_ratio_bps"]),
            "max_borrow_limit": int(data["max_borrow_limit"]),
            "reasoning_short": reasoning_en,  # on-chain (English)
            "reasoning_en": reasoning_en,
            "reasoning_ru": reasoning_ru,
            "confidence": int(data["confidence"]),
            "risk_level": str(data["risk_level"]),
        }

    def _fallback_decision(self, report: dict) -> dict:
        """ML-only fallback when Gemini is unavailable.

        Uses quant signals + risk score to make a decision without LLM.
        """
        current_rate = report.get("current_rate_bps", 500)
        current_collateral = report.get("current_collateral_bps", 15000)
        util = report.get("utilization", 0)
        risk = report.get("risk_score", 50)
        optimal_rate = report.get("optimal_rate_bps", current_rate)
        trend = report.get("ml", {}).get("trend", {}).get("direction", "sideways")
        vol_regime = report.get("volatility", {}).get("regime", "medium")
        util_trend = report.get("util_trend", "stable")

        # Rate decision based on utilization + trend + optimal rate
        if util > 0.8:
            boost = 150 if util_trend == "rising" else 100
            new_rate = min(current_rate + boost, 2000)
            reason = f"High util {util:.0%} ({util_trend}) → rate +{boost/100}%"
        elif util > 0.5:
            diff = optimal_rate - current_rate
            speed = 2 if util_trend == "rising" else 3  # faster when rising
            new_rate = current_rate + max(-100, min(100, diff // speed))
            reason = f"Util {util:.0%} {util_trend}, toward optimal {optimal_rate}bps"
        elif util < 0.15:
            new_rate = max(current_rate - 50, 100)
            reason = f"Low util {util:.0%} → rate -0.5%"
        elif util_trend == "rising" and util > 0.3:
            new_rate = min(current_rate + 50, 2000)
            reason = f"Util rising {util:.0%} → preemptive rate +0.5%"
        elif risk > 60:
            new_rate = min(current_rate + 50, 2000)
            reason = f"Risk {risk:.0f}/100 → rate +0.5%"
        else:
            new_rate = current_rate
            reason = "Signals normal, hold rate"

        # Collateral decision based on volatility
        if vol_regime == "extreme":
            new_collateral = min(current_collateral + 1000, 20000)
            reason += f"; extreme vol → collateral +10%"
        elif vol_regime == "high":
            new_collateral = min(current_collateral + 500, 20000)
            reason += f"; high vol → collateral +5%"
        else:
            new_collateral = current_collateral

        new_rate = max(100, min(2000, new_rate))
        new_collateral = max(12000, min(20000, new_collateral))

        return {
            "interest_rate_bps": new_rate,
            "collateral_ratio_bps": new_collateral,
            "max_borrow_limit": 10_000_000_000,
            "reasoning_short": f"[ML-ONLY] {reason}",
            "reasoning_en": f"[ML-ONLY] {reason}",
            "reasoning_ru": f"[ML-ONLY] {reason}",
            "confidence": 55,
            "risk_level": "medium" if risk > 40 else "low",
            "decision_source": "ml_fallback",
        }
