"""Sentiment Engine — multi-source news/social analysis via Gemini.

Sources:
  1. CoinGecko /coins/solana — status updates, community data
  2. CryptoPanic API (free) — aggregated crypto news
  3. Gemini as NLP classifier — severity + sentiment scoring

Key design: filter NOISE (tweets, hype, FUD) from SERIOUS events
(regulation, sanctions, hacks, protocol failures).

Gemini classifies each headline into:
  - severity: "noise" | "notable" | "serious" | "critical"
  - sentiment: -1.0 to +1.0

Only "notable"+ events affect protocol decisions.
"noise" (celebrity tweets, memes, pump calls) is logged but ignored.
"""

import json
import aiohttp
from typing import Any

import google.generativeai as genai


# Free APIs — no key needed
CRYPTOPANIC_URL = "https://cryptopanic.com/api/free/v1/posts/"
COINGECKO_URL = "https://api.coingecko.com/api/v3"


class SentimentEngine:
    def __init__(self, gemini_model: genai.GenerativeModel):
        self.model = gemini_model
        self._session: aiohttp.ClientSession | None = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=10)
            )
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    # ==========================================
    # Source 1: CryptoPanic (free, no API key)
    # ==========================================

    async def _fetch_cryptopanic(self) -> list[dict]:
        """Fetch latest crypto news from CryptoPanic free API."""
        session = await self._get_session()
        try:
            params = {
                "currencies": "SOL",
                "filter": "important",
                "public": "true",
            }
            async with session.get(CRYPTOPANIC_URL, params=params) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    results = data.get("results", [])
                    return [
                        {
                            "title": r.get("title", ""),
                            "source": r.get("source", {}).get("title", "unknown"),
                            "kind": r.get("kind", "news"),
                            "votes": r.get("votes", {}),
                        }
                        for r in results[:15]
                    ]
                return []
        except Exception as e:
            print(f"[SENTIMENT] CryptoPanic error: {e}")
            return []

    # ==========================================
    # Source 2: CoinGecko community/status
    # ==========================================

    async def _fetch_coingecko_status(self) -> list[dict]:
        """Fetch SOL community sentiment indicators from CoinGecko."""
        session = await self._get_session()
        try:
            url = f"{COINGECKO_URL}/coins/solana"
            params = {
                "localization": "false",
                "tickers": "false",
                "community_data": "true",
                "developer_data": "false",
            }
            async with session.get(url, params=params) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    community = data.get("community_data", {})
                    sentiment = data.get("sentiment_votes_up_percentage", 0)
                    status_updates = data.get("status_updates", [])

                    headlines = []
                    for s in status_updates[:5]:
                        headlines.append({
                            "title": s.get("body", "")[:200],
                            "source": "coingecko_status",
                            "kind": "status",
                        })

                    return headlines, {
                        "sentiment_up_pct": sentiment,
                        "reddit_subscribers": community.get("reddit_subscribers", 0),
                        "twitter_followers": community.get("twitter_followers", 0),
                    }
                return [], {}
        except Exception as e:
            print(f"[SENTIMENT] CoinGecko status error: {e}")
            return [], {}

    # ==========================================
    # Source 3: Gemini as NLP classifier
    # ==========================================

    async def _classify_with_gemini(self, headlines: list[dict]) -> dict:
        """Ask Gemini to classify headlines by severity and sentiment.

        CRITICAL: Gemini must distinguish noise from serious events.
        """
        if not headlines:
            return {
                "overall_sentiment": 0.0,
                "overall_severity": "none",
                "serious_events": [],
                "summary_en": "No recent news",
                "summary_ru": "Нет новостей",
            }

        titles = [h["title"] for h in headlines[:12]]

        prompt = f"""Ты — аналитик крипторынка. Оцени эти заголовки для SOL/Solana.

ВАЖНО: Различай ШУМ и СЕРЬЁЗНЫЕ события.

ШУМ (severity: "noise") — игнорировать:
- Твиты знаменитостей (Трамп, Илон Маск, инфлюенсеры)
- Мемы, хайп, "to the moon", pump/dump призывы
- Мнения аналитиков без фактов
- Обычные колебания рынка ±5%
- Слухи без подтверждения

СЕРЬЁЗНЫЕ (severity: "notable" / "serious" / "critical"):
- notable: новые партнёрства, обновления протокола, листинги на биржах
- serious: регуляторные действия (SEC, ЦБ), крупные хаки, санкции
- critical: война, глобальные санкции, крах крупной биржи, баг в сети Solana

Заголовки:
{json.dumps(titles, ensure_ascii=False)}

Ответь ТОЛЬКО JSON:
{{
  "overall_sentiment": <от -1.0 до 1.0>,
  "overall_severity": "<noise|notable|serious|critical>",
  "serious_events": [
    {{"title": "<заголовок>", "severity": "<notable|serious|critical>", "impact": "<описание влияния>"}}
  ],
  "noise_count": <сколько заголовков являются шумом>,
  "summary_en": "<1 предложение, общий вывод на английском>",
  "summary_ru": "<1 предложение, общий вывод на русском>"
}}"""

        try:
            response = await self.model.generate_content_async(prompt)
            text = response.text.strip()
            # Parse JSON
            import re
            cleaned = re.sub(r"```json\s*", "", text)
            cleaned = re.sub(r"```\s*", "", cleaned)
            result = json.loads(cleaned.strip())

            # Validate and clamp
            result["overall_sentiment"] = max(-1.0, min(1.0, float(result.get("overall_sentiment", 0))))
            result.setdefault("overall_severity", "noise")
            result.setdefault("serious_events", [])
            result.setdefault("noise_count", 0)
            result.setdefault("summary_en", "")
            result.setdefault("summary_ru", "")

            return result

        except Exception as e:
            print(f"[SENTIMENT] Gemini classification error: {e}")
            return {
                "overall_sentiment": 0.0,
                "overall_severity": "noise",
                "serious_events": [],
                "summary_en": "Sentiment analysis failed",
                "summary_ru": "Ошибка анализа настроений",
            }

    # ==========================================
    # Main: analyze all sources
    # ==========================================

    async def analyze(self) -> dict[str, Any]:
        """Fetch news from all sources, classify with Gemini.

        Returns:
        {
            "overall_sentiment": float (-1 to 1),
            "overall_severity": str,
            "serious_events": [...],
            "noise_count": int,
            "total_headlines": int,
            "summary_en": str,
            "summary_ru": str,
            "sources_used": list[str],
            "should_affect_decision": bool,  # True only for notable+
        }
        """
        # Fetch from all sources in parallel
        import asyncio
        cryptopanic_task = self._fetch_cryptopanic()
        coingecko_task = self._fetch_coingecko_status()

        cryptopanic_headlines, (cg_headlines, cg_community) = await asyncio.gather(
            cryptopanic_task,
            coingecko_task,
            return_exceptions=True,
        )

        # Handle errors
        if isinstance(cryptopanic_headlines, Exception):
            print(f"[SENTIMENT] CryptoPanic fetch failed: {cryptopanic_headlines}")
            cryptopanic_headlines = []
        if isinstance(cg_headlines, Exception):
            cg_headlines = []
            cg_community = {}

        # Combine all headlines
        all_headlines = []
        sources_used = []

        if cryptopanic_headlines:
            all_headlines.extend(cryptopanic_headlines)
            sources_used.append("cryptopanic")

        if cg_headlines:
            all_headlines.extend(cg_headlines)
            sources_used.append("coingecko")

        total = len(all_headlines)

        # Classify with Gemini
        classification = await self._classify_with_gemini(all_headlines)

        # Decision: should this affect protocol parameters?
        severity = classification.get("overall_severity", "noise")
        should_affect = severity in ("notable", "serious", "critical")

        return {
            "overall_sentiment": classification["overall_sentiment"],
            "overall_severity": severity,
            "serious_events": classification.get("serious_events", []),
            "noise_count": classification.get("noise_count", 0),
            "total_headlines": total,
            "summary_en": classification.get("summary_en", ""),
            "summary_ru": classification.get("summary_ru", ""),
            "sources_used": sources_used,
            "should_affect_decision": should_affect,
            "community": cg_community if isinstance(cg_community, dict) else {},
        }
