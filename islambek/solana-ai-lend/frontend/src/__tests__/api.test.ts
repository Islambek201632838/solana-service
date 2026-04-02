import { describe, it, expect } from "vitest";
import { API_URL, WS_URL } from "../lib/api";

describe("API config", () => {
  it("has default API_URL", () => {
    expect(API_URL).toBe("http://localhost:8000");
  });

  it("has default WS_URL", () => {
    expect(WS_URL).toBe("ws://localhost:8000/ws");
  });
});
