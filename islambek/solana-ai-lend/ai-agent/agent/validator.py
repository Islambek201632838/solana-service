"""Validator — validates AI decisions against protocol constraints.

Ensures the AI agent's proposed parameters are safe before sending on-chain.
"""


def validate(decision: dict, pool_state: dict) -> tuple[bool, str]:
    """Validate an AI decision against pool constraints.

    Args:
        decision: AI output with interest_rate_bps, collateral_ratio_bps, etc.
        pool_state: Current pool state with min/max bounds and current values.

    Returns:
        (is_valid, reason) — True if safe to submit, or False with explanation.
    """
    # Required fields
    required = [
        "interest_rate_bps",
        "collateral_ratio_bps",
        "max_borrow_limit",
        "reasoning_short",
        "confidence",
        "risk_level",
    ]
    for field in required:
        if field not in decision:
            return False, f"Missing field: {field}"

    rate = decision["interest_rate_bps"]
    collateral = decision["collateral_ratio_bps"]
    confidence = decision["confidence"]
    risk_level = decision["risk_level"]

    # Rate bounds
    min_rate = pool_state.get("min_interest_rate_bps", 100)
    max_rate = pool_state.get("max_interest_rate_bps", 2000)
    if rate < min_rate or rate > max_rate:
        return False, f"Rate {rate} out of bounds [{min_rate}, {max_rate}]"

    # Collateral bounds
    min_col = pool_state.get("min_collateral_ratio_bps", 12000)
    max_col = pool_state.get("max_collateral_ratio_bps", 20000)
    if collateral < min_col or collateral > max_col:
        return False, f"Collateral {collateral} out of bounds [{min_col}, {max_col}]"

    # Max 20% rate change
    current_rate = pool_state.get("interest_rate_bps", 500)
    if current_rate > 0:
        change_pct = abs(rate - current_rate) / current_rate
        if change_pct > 0.20:
            return False, f"Rate change {change_pct:.0%} exceeds 20% limit"

    # Max 20% collateral change
    current_col = pool_state.get("collateral_ratio_bps", 15000)
    if current_col > 0:
        col_change_pct = abs(collateral - current_col) / current_col
        if col_change_pct > 0.20:
            return False, f"Collateral change {col_change_pct:.0%} exceeds 20% limit"

    # Confidence threshold
    if confidence < 50:
        return False, f"Confidence {confidence} below threshold 50"

    # Critical risk → skip
    if risk_level == "critical":
        return False, "Risk level critical — skipping update"

    # Valid risk level
    if risk_level not in ("low", "medium", "high", "critical"):
        return False, f"Invalid risk_level: {risk_level}"

    # Max borrow limit sanity
    if decision["max_borrow_limit"] <= 0:
        return False, "max_borrow_limit must be > 0"

    # Reasoning length
    if len(decision.get("reasoning_short", "")) > 256:
        return False, "reasoning_short exceeds 256 chars"

    return True, "OK"
