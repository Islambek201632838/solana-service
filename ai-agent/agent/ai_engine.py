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

## Состояние пула
- Текущая ставка: {report.get('current_rate_bps', 500)} bps ({report.get('current_rate_bps', 500) / 100}%)
- Утилизация: {report.get('utilization', 0):.2%}
- Оптимальная ставка (кривая): {report.get('optimal_rate_bps', 500)} bps
- Прогноз утилизации: {report.get('predicted_utilization', 0):.2%}

## Математический сигнал
- Рекомендация: {report.get('recommended_rate_direction', 'hold')}
- Уверенность мат. модели: {report.get('math_confidence', 0)}%
- Голоса индикаторов: {json.dumps(report.get('votes', {}))}

## Правила (СТРОГО соблюдай)
- interest_rate_bps: от 100 до 2000
- collateral_ratio_bps: от 12000 до 20000
- max_borrow_limit: в токенах с 6 decimals, диапазон 1B-50B
- Изменение ставки от текущей ≤ 20%
- confidence: от 0 до 100
- risk_level: только low, medium, high, critical

Ответь ТОЛЬКО валидным JSON (без markdown, без пояснений):
{{
  "interest_rate_bps": <число>,
  "collateral_ratio_bps": <число>,
  "max_borrow_limit": <число>,
  "reasoning_short": "<макс 200 символов, объяснение решения на английском>",
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
        return {
            "interest_rate_bps": int(data["interest_rate_bps"]),
            "collateral_ratio_bps": int(data["collateral_ratio_bps"]),
            "max_borrow_limit": int(data["max_borrow_limit"]),
            "reasoning_short": str(data["reasoning_short"])[:256],
            "confidence": int(data["confidence"]),
            "risk_level": str(data["risk_level"]),
        }

    def _fallback_decision(self, report: dict) -> dict:
        """Safe fallback if Gemini is unavailable — hold current params."""
        return {
            "interest_rate_bps": report.get("current_rate_bps", 500),
            "collateral_ratio_bps": 15000,
            "max_borrow_limit": 10_000_000_000,
            "reasoning_short": "Gemini unavailable — holding current parameters",
            "confidence": 0,
            "risk_level": "medium",
        }
