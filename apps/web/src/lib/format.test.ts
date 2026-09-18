import { describe, expect, it } from "vitest";
import { formatDate, formatNumber, formatTime } from "@/lib/format";

describe("format", () => {
  it("formats thousands according to locale", () => {
    expect(formatNumber(12480, "es")).toBe("12.480");
    expect(formatNumber(12480, "en")).toBe("12,480");
  });

  it("formats dates without a trailing dot", () => {
    const date = new Date(2026, 8, 18, 10, 17, 3);
    expect(formatDate(date, "es")).not.toMatch(/\.$/);
    expect(formatDate(date, "en")).toMatch(/2026/);
  });

  it("formats a 24-hour clock", () => {
    const date = new Date(2026, 8, 18, 22, 5, 9);
    expect(formatTime(date, "es")).toMatch(/22:05:09/);
    expect(formatTime(date, "en")).toMatch(/22:05:09/);
  });
});
