import {
	ScenarioCustomer,
	ScenarioLanguage,
	ScenarioResource,
	ScenarioTopologyLink,
	ScenarioTopologyNode,
} from "@scenarios/types/scenario.type"

export const IMPACT_REGION = "me-central-1"
export const OMAN_REGION = "muscat-lz"
export const FRANKFURT_REGION = "eu-central-1"
export const RIYADH_REGION = "riyadh"

export const METEORITE_SITES = [
	{
		identifier: "dubai",
		latitude: 25.2048,
		longitude: 55.2708,
		priority: 0,
		region: IMPACT_REGION,
		role: "primary" as const,
	},
	{
		identifier: "muscat",
		latitude: 23.588,
		longitude: 58.3829,
		priority: 1,
		region: OMAN_REGION,
		role: "backup" as const,
	},
	{
		identifier: "frankfurt",
		latitude: 50.1109,
		longitude: 8.6821,
		priority: 2,
		region: FRANKFURT_REGION,
		role: "backup" as const,
	},
	{
		identifier: "riyadh",
		latitude: 24.7136,
		longitude: 46.6753,
		priority: 3,
		region: RIYADH_REGION,
		role: "backup" as const,
	},
] as const

const SITE_LABELS: Record<
	ScenarioLanguage,
	Record<(typeof METEORITE_SITES)[number]["identifier"], string>
> = {
	en: {
		dubai: "Dubai",
		frankfurt: "Frankfurt",
		muscat: "Muscat LZ",
		riyadh: "Riyadh",
	},
	es: {
		dubai: "Dubái",
		frankfurt: "Fráncfort",
		muscat: "Mascate LZ",
		riyadh: "Riad",
	},
}

export const METEORITE_LINKS: ReadonlyArray<ScenarioTopologyLink> = [
	{ from: "dubai", identifier: "dubai-muscat", to: "muscat" },
	{ from: "dubai", identifier: "dubai-frankfurt", to: "frankfurt" },
	{ from: "dubai", identifier: "dubai-riyadh", to: "riyadh" },
]

const CUSTOMERS = [
	{
		accent: "#ff6b2c",
		cityEn: "San Francisco",
		cityEs: "San Francisco",
		identifier: "happyrobot",
		latitude: 37.7587,
		logo: "/logos/happyrobot.svg",
		longitude: -122.3887,
		name: "HappyRobot",
		sectorEn: "Logistics",
		sectorEs: "Logística",
		serviceIdentifiers: ["route-assignment", "driver-mobile-api"],
		shortName: "HR",
		users: 2100,
	},
	{
		accent: "#00a651",
		cityEn: "Madrid",
		cityEs: "Madrid",
		identifier: "moeve",
		latitude: 40.4756,
		logo: "/logos/moeve.svg",
		longitude: -3.6877,
		name: "Moeve",
		sectorEn: "Energy",
		sectorEs: "Energía",
		serviceIdentifiers: ["events-stream"],
		shortName: "Moeve",
		users: 1540,
	},
	{
		accent: "#c8102e",
		cityEn: "Dubai",
		cityEs: "Dubái",
		identifier: "emirates",
		latitude: 25.2417,
		logo: "/logos/emirates.svg",
		longitude: 55.366,
		name: "Emirates",
		sectorEn: "Airline",
		sectorEs: "Aerolínea",
		serviceIdentifiers: ["customer-notifications"],
		shortName: "EK",
		users: 8200,
	},
	{
		accent: "#00843d",
		cityEn: "Dubai",
		cityEs: "Dubái",
		identifier: "emirates-nbd",
		latitude: 25.2608,
		logo: "/logos/emirates-nbd.png",
		longitude: 55.3146,
		name: "Emirates NBD",
		sectorEn: "Fintech",
		sectorEs: "Fintech",
		serviceIdentifiers: ["orders-database"],
		shortName: "ENBD",
		users: 6400,
	},
	{
		accent: "#00ccbc",
		cityEn: "Dubai",
		cityEs: "Dubái",
		identifier: "deliveroo",
		latitude: 25.0803,
		logo: "/logos/deliveroo.svg",
		longitude: 55.2075,
		name: "Deliveroo",
		sectorEn: "Delivery",
		sectorEs: "Reparto",
		serviceIdentifiers: ["package-tracking", "route-assignment"],
		shortName: "Roo",
		users: 3900,
	},
	{
		accent: "#0e7c7b",
		cityEn: "Abu Dhabi",
		cityEs: "Abu Dabi",
		identifier: "purehealth",
		latitude: 24.4411,
		logo: "/logos/purehealth.jpg",
		longitude: 54.5754,
		name: "PureHealth",
		sectorEn: "Healthcare",
		sectorEs: "Salud",
		// The hospital runs on the orders database alone, so it comes back with the very first
		// recovery. Notifications stay with the airline, which is the customer that lives on them.
		serviceIdentifiers: ["orders-database"],
		shortName: "PH",
		users: 2750,
	},
] as const

export function meteoriteTopology(language: ScenarioLanguage): {
	readonly nodes: ReadonlyArray<ScenarioTopologyNode>
	readonly links: ReadonlyArray<ScenarioTopologyLink>
} {
	const labels = SITE_LABELS[language]
	return {
		links: METEORITE_LINKS,
		nodes: METEORITE_SITES.map((site) => ({
			identifier: site.identifier,
			label: labels[site.identifier],
			latitude: site.latitude,
			longitude: site.longitude,
			priority: site.priority,
			region: site.region,
			role: site.role,
			status: "up",
		})),
	}
}

export function meteoriteCustomers(
	language: ScenarioLanguage,
): ReadonlyArray<ScenarioCustomer> {
	return CUSTOMERS.map((customer) => ({
		accent: customer.accent,
		city: language === "es" ? customer.cityEs : customer.cityEn,
		identifier: customer.identifier,
		latitude: customer.latitude,
		logo: customer.logo,
		longitude: customer.longitude,
		name: customer.name,
		sector: language === "es" ? customer.sectorEs : customer.sectorEn,
		serviceIdentifiers: [...customer.serviceIdentifiers],
		shortName: customer.shortName,
		users: customer.users,
	}))
}

export function meteoriteResources(
	language: ScenarioLanguage,
): ReadonlyArray<ScenarioResource> {
	const unit = language === "es" ? "unidades de cómputo" : "compute units"
	return [
		{
			identifier: "backup-oman",
			name: language === "es" ? "Local Zone de Omán" : "Oman Local Zone",
			note:
				language === "es"
					? "Capacidad más cercana, pendiente de confirmación por el equipo de plataforma"
					: "Closest backup capacity, pending confirmation from the platform team",
			region: OMAN_REGION,
			reportedCapacity: 4,
			unit,
		},
		{
			identifier: "backup-frankfurt",
			name:
				language === "es"
					? "Fráncfort eu-central-1"
					: "Frankfurt eu-central-1",
			note:
				language === "es"
					? "Segunda región de respaldo por distancia"
					: "Second closest backup region",
			region: FRANKFURT_REGION,
			reportedCapacity: 12,
			unit,
		},
		{
			identifier: "backup-riyadh",
			name: language === "es" ? "Riad" : "Riyadh",
			note:
				language === "es"
					? "Tercera región de respaldo por distancia"
					: "Third closest backup region",
			region: RIYADH_REGION,
			reportedCapacity: 12,
			unit,
		},
	]
}
