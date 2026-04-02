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
        return f"""You are an AI risk manager for a Solana DeFi lending protocol.

Based on the following market analysis, decide the optimal protocol parameters.

## Current Market Analysis
- SOL Price: ${report.get('sol_price', 0):.2f}
- 24h Change: {report.get('price_change_24h', 0):.2f}%
- RSI: {report.get('rsi', 50):.1f}
- MACD: {json.dumps(report.get('macd', {}))}
- Bollinger: {json.dumps(report.get('bollinger', {}))}
- ATR: {report.get('atr', 0)}
- EMA Crossover: {report.get('ema_crossover', 'no_cross')}

## Risk Analysis
- Risk Score: {report.get('risk_score', 50)}/100
- Risk Level: {report.get('risk_level', 'medium')}
- Volatility: {json.dumps(report.get('volatility', {}))}
- Anomaly: {json.dumps(report.get('anomaly', {}))}
- Trend: {json.dumps(report.get('trend', {}))}

## Pool State
- Current Rate: {report.get('current_rate_bps', 500)} bps ({report.get('current_rate_bps', 500) / 100}%)
- Utilization: {report.get('utilization', 0):.2%}
- Optimal Rate (curve): {report.get('optimal_rate_bps', 500)} bps
- Predicted Utilization: {report.get('predicted_utilization', 0):.2%}

## Math Signal
- Recommended Direction: {report.get('recommended_rate_direction', 'hold')}
- Math Confidence: {report.get('math_confidence', 0)}%
- Votes: {json.dumps(report.get('votes', {}))}

## Rules
- interest_rate_bps must be between 100 and 2000
- collateral_ratio_bps must be between 12000 and 20000
- max_borrow_limit in token units (6 decimals), reasonable range 1B-50B
- Change from current rate must be ≤ 20%
- confidence must be 0-100
- risk_level must be one of: low, medium, high, critical

Respond with ONLY valid JSON (no markdown, no explanation):
{{
  "interest_rate_bps": <number>,
  "collateral_ratio_bps": <number>,
  "max_borrow_limit": <number>,
  "reasoning_short": "<max 200 chars explaining your decision>",
  "confidence": <number 0-100>,
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
