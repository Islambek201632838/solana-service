"""Utilization Curve — Aave-style interest rate model with kink point.

When utilization < u_optimal: rate grows slowly (slope1)
When utilization >= u_optimal: rate grows steeply (slope2) to incentivize repayment
"""


def calc_optimal_rate(
    utilization: float,
    u_optimal: float = 0.80,
    r_base: int = 100,
    r_slope1: int = 400,
    r_slope2: int = 1500,
) -> dict:
    """Calculate optimal interest rate based on utilization.

    Args:
        utilization: Current utilization ratio (0.0 - 1.0)
        u_optimal: Optimal utilization threshold (kink point)
        r_base: Base rate in bps (e.g. 100 = 1%)
        r_slope1: Slope below kink in bps
        r_slope2: Slope above kink in bps

    Returns:
        dict with optimal_rate_bps, utilization, zone, description
    """
    utilization = max(0.0, min(1.0, utilization))

    if utilization <= u_optimal:
        # Below kink: gentle slope
        rate_bps = r_base + int(r_slope1 * utilization / u_optimal)
        zone = "optimal"
        description = "Normal utilization — stable rates"
    else:
        # Above kink: steep slope to incentivize repayment
        excess = (utilization - u_optimal) / (1.0 - u_optimal)
        rate_bps = r_base + r_slope1 + int(r_slope2 * excess)
        zone = "excess"
        description = "High utilization — elevated rates to incentivize repayment"

    return {
        "optimal_rate_bps": rate_bps,
        "utilization": round(utilization, 4),
        "u_optimal": u_optimal,
        "zone": zone,
        "description": description,
    }
