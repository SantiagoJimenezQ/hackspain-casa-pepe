import { describe, expect, it } from "vitest";
import { normalizeCasaPepeAPIBaseURL } from "@/lib/casa-pepe-url";

describe("Casa Pepe API URL", () => {
  it.each([
    ["https://casa-pepe.example.com", "https://casa-pepe.example.com/api"],
    ["https://casa-pepe.example.com/", "https://casa-pepe.example.com/api"],
    ["https://casa-pepe.example.com/api", "https://casa-pepe.example.com/api"],
    ["https://casa-pepe.example.com/api/", "https://casa-pepe.example.com/api"],
  ])("normalizes %s to %s", (configured: string, expected: string) => {
    expect(normalizeCasaPepeAPIBaseURL(configured)).toBe(expected);
  });
});
