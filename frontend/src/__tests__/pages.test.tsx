import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import DepositForm from "../components/dashboard/DepositForm";
import BorrowForm from "../components/dashboard/BorrowForm";

describe("DepositForm", () => {
  it("renders input and button", () => {
    render(<DepositForm onDeposit={vi.fn()} maxBalance={1000} loading={false} />);
    expect(screen.getByPlaceholderText("Amount (aiUSDC)")).toBeTruthy();
    expect(screen.getByText("Deposit")).toBeTruthy();
  });

  it("shows preset buttons", () => {
    render(<DepositForm onDeposit={vi.fn()} maxBalance={1000} loading={false} />);
    expect(screen.getByText("25%")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText("MAX")).toBeTruthy();
  });

  it("fills amount on preset click", () => {
    render(<DepositForm onDeposit={vi.fn()} maxBalance={1000} loading={false} />);
    fireEvent.click(screen.getByText("MAX"));
    const input = screen.getByPlaceholderText("Amount (aiUSDC)") as HTMLInputElement;
    expect(input.value).toBe("1000.00");
  });

  it("shows balance", () => {
    render(<DepositForm onDeposit={vi.fn()} maxBalance={5000} loading={false} />);
    expect(screen.getByText(/5,000/)).toBeTruthy();
  });

  it("shows Signing... when loading", () => {
    render(<DepositForm onDeposit={vi.fn()} maxBalance={1000} loading={true} />);
    expect(screen.getByText("Signing...")).toBeTruthy();
  });
});

describe("BorrowForm", () => {
  const props = {
    onBorrow: vi.fn(),
    collateralSol: 2,
    solPrice: 185,
    collateralRatio: 150,
    currentBorrowed: 50,
    loading: false,
  };

  it("renders input and borrow button", () => {
    render(<BorrowForm {...props} />);
    expect(screen.getByPlaceholderText("Amount (aiUSDC)")).toBeTruthy();
    expect(screen.getByText("Borrow")).toBeTruthy();
  });

  it("shows collateral info", () => {
    render(<BorrowForm {...props} />);
    expect(screen.getByText(/2.0000 SOL/)).toBeTruthy();
    expect(screen.getByText(/\$370.00/)).toBeTruthy();
  });

  it("shows borrow capacity percentage", () => {
    render(<BorrowForm {...props} />);
    // 2 SOL * $185 = $370, ratio 150% → max borrow $246.67, used $50 → 20.3%
    expect(screen.getByText(/of borrow capacity used/)).toBeTruthy();
  });

  it("shows Signing... when loading", () => {
    render(<BorrowForm {...props} loading={true} />);
    expect(screen.getByText("Signing...")).toBeTruthy();
  });
});
