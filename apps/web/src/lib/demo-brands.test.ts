import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_BRANDS, LEGACY_LOGOS, demoCustomer, demoPresentation, demoText } from "../../../../packages/demo-brands";

describe("fictional customer presentation", () => {
  it("projects old history without mutating audit evidence or actionable identifiers", () => {
    const saved = {
      identifier: "moeve", name: "Moeve", shortName: "Moeve", logo: "/logos/moeve.svg",
      serviceIdentifiers: ["orders-database"], users: 1540,
      payload: { customerIdentifier: "emirates-nbd", customerIdentifiers: ["purehealth", "deliveroo"],
        summary: "Emirates NBD, Emirates, PureHealth, Deliveroo and Moeve", accepted: false },
    };
    const before = structuredClone(saved);
    expect(demoPresentation(saved)).toEqual({ ...saved, ...DEMO_BRANDS.moeve,
      payload: { ...saved.payload, summary: "Meridian Bank, Mirage Air, Clarity Health, Dasharoo and Mova Energy" },
    });
    expect(saved).toEqual(before);
  });

  it("preserves HappyRobot, unknown customers and geographical names", () => {
    const happyrobot = { identifier: "happyrobot", name: "HappyRobot", shortName: "HR", logo: "/logos/happyrobot.svg" };
    expect(demoCustomer(happyrobot)).toBe(happyrobot);
    expect(demoPresentation(happyrobot)).toEqual(happyrobot);
    expect(demoCustomer({ identifier: "unknown", name: "Independent" })).toEqual({ identifier: "unknown", name: "Independent" });
    expect(demoText("HappyRobot in the United Arab Emirates; EMIRATES NBD and Pure Health"))
      .toBe("HappyRobot in the United Arab Emirates; Meridian Bank and Clarity Health");
  });

  it("keeps all retired asset URLs working with accessible original SVG marks", () => {
    for (const [oldPath, replacement] of Object.entries(LEGACY_LOGOS)) {
      expect(demoPresentation(oldPath)).toBe(replacement);
      const svg = readFileSync(`${process.cwd()}/public${replacement}`, "utf8");
      expect(svg).toContain('viewBox="0 0 64 64"');
      expect(svg).toContain("<title");
      expect(svg).not.toMatch(/<image|<script|(?:href|src)=/);
    }
  });
});
