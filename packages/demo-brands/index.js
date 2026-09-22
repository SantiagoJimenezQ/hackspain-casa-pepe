// Presentation aliases only. Stable customer identifiers preserve saved runs and priority rules.
const DEMO_BRANDS = Object.freeze({
  moeve: Object.freeze({ name: "Mova Energy", shortName: "Mova", logo: "/logos/mova-energy.svg" }),
  emirates: Object.freeze({ name: "Mirage Air", shortName: "MA", logo: "/logos/mirage-air.svg" }),
  "emirates-nbd": Object.freeze({ name: "Meridian Bank", shortName: "MB", logo: "/logos/meridian-bank.svg" }),
  deliveroo: Object.freeze({ name: "Dasharoo", shortName: "Dash", logo: "/logos/dasharoo.svg" }),
  purehealth: Object.freeze({ name: "Clarity Health", shortName: "CH", logo: "/logos/clarity-health.svg" }),
});

const LEGACY_LOGOS = Object.freeze({
  "/logos/moeve.svg": DEMO_BRANDS.moeve.logo,
  "/logos/emirates.svg": DEMO_BRANDS.emirates.logo,
  "/logos/emirates-nbd.svg": DEMO_BRANDS["emirates-nbd"].logo,
  "/logos/emirates-nbd.png": DEMO_BRANDS["emirates-nbd"].logo,
  "/logos/deliveroo.svg": DEMO_BRANDS.deliveroo.logo,
  "/logos/purehealth.svg": DEMO_BRANDS.purehealth.logo,
  "/logos/purehealth.jpg": DEMO_BRANDS.purehealth.logo,
});

function demoCustomer(customer) {
  const brand = Object.hasOwn(DEMO_BRANDS, customer.identifier) ? DEMO_BRANDS[customer.identifier] : undefined;
  return brand ? { ...customer, ...brand } : customer;
}

function demoText(text) {
  return text.replace(/\b(Emirates[ -]NBD|Pure[ ]?Health|Moeve|Deliveroo|Emirates)\b/gi, (match, _group, offset) => {
    // The country name is geography, not an airline reference.
    if (/^emirates$/i.test(match) && /United Arab $/i.test(text.slice(0, offset))) return match;
    const identifier = match.toLowerCase().replace(/ /g, "-");
    const key = identifier === "pure-health" ? "purehealth" : identifier;
    return DEMO_BRANDS[key]?.name ?? match;
  });
}

/** Project old JSON/SSE payloads for display without rewriting stored audit evidence or IDs. */
function demoPresentation(value, key = "") {
  if (/(?:^identifier$|Identifiers?$|^id$|Ids?$)/.test(key)) return value;
  if (typeof value === "string") {
    if (Object.hasOwn(LEGACY_LOGOS, value)) return LEGACY_LOGOS[value];
    return demoText(value);
  }
  if (Array.isArray(value)) return value.map((item) => demoPresentation(item));
  if (!value || typeof value !== "object") return value;
  const projected = Object.fromEntries(Object.entries(value).map(([field, item]) => [field, demoPresentation(item, field)]));
  // Tokens can split a name (or the longer bank name). Alias only after reassembly.
  if (value.type === "agent.llm-output" && typeof value.payload?.text === "string") {
    projected.payload.text = value.payload.text;
  }
  return typeof projected.identifier === "string" && typeof projected.name === "string"
    ? demoCustomer(projected) : projected;
}

module.exports = { DEMO_BRANDS, LEGACY_LOGOS, demoCustomer, demoText, demoPresentation };
