import { describe, expect, it } from "vitest";
import {
  agentPhaseKey,
  infraKey,
  isLocale,
  messageKey,
  messages,
  sectorKey,
  siteKey,
  translate,
} from "@/lib/i18n";

describe("i18n", () => {
  it("keeps Spanish and English catalogs in lockstep", () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.es).sort());
  });

  it("has no empty copy in either locale", () => {
    for (const locale of ["es", "en"] as const) {
      for (const [key, value] of Object.entries(messages[locale])) {
        expect(value.trim(), `${locale}:${key}`).not.toBe("");
      }
    }
  });

  it("identifies supported locales", () => {
    expect(isLocale("es")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("builds typed lookup keys for sites, infra, sectors and phases", () => {
    expect(siteKey("madrid")).toBe("site.madrid");
    expect(infraKey("barcelona")).toBe("infra.barcelona");
    expect(sectorKey("energy")).toBe("sector.energy");
    expect(agentPhaseKey("launch_subagents")).toBe("agent.phase.launch_subagents");
  });

  it("resolves known message keys and rejects unknown ones", () => {
    expect(messageKey("agent.title")).toBe("agent.title");
    expect(messageKey("not.a.key")).toBeNull();
  });

  it("interpolates placeholders", () => {
    expect(translate("es", "incident.kpi.minutes", { minutes: 7 })).toBe("7 min");
    expect(translate("en", "agent.subagent.label", { name: "Iberdrola" })).toBe(
      "Subagent · Iberdrola",
    );
  });
});
