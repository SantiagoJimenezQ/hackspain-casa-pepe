import { describe, expect, it } from "vitest";
import { applyThemeClass, isTheme } from "@/lib/theme";
import { STATUS_HEX } from "@/lib/status";
import { cn } from "@/lib/utils";

describe("theme", () => {
  it("accepts only light and dark", () => {
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("light")).toBe(true);
    expect(isTheme("system")).toBe(false);
  });

  it("toggles the dark class on the document", () => {
    applyThemeClass("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    applyThemeClass("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("status", () => {
  it("maps every health state to a hex color", () => {
    expect(STATUS_HEX.up).toBe("var(--status-up)");
    expect(STATUS_HEX.degraded).toBe("var(--status-degraded)");
    expect(STATUS_HEX.down).toBe("var(--status-down)");
  });
});

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "px-4")).toContain("px-4");
  });
});
