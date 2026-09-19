import { IncidentSnapshot } from "@incidents/types/incident.type"

export interface NearbyRegion {
	readonly identifier: string
	readonly label: string
	readonly region: string
	readonly distanceKm: number
	readonly remaining: number
	readonly confirmed: boolean
}

export function haversineKm(
	from: { latitude: number; longitude: number },
	to: { latitude: number; longitude: number },
): number {
	const toRadians = (degrees: number) => (degrees * Math.PI) / 180
	const earthRadiusKm = 6371
	const deltaLatitude = toRadians(to.latitude - from.latitude)
	const deltaLongitude = toRadians(to.longitude - from.longitude)
	const a =
		Math.sin(deltaLatitude / 2) ** 2 +
		Math.cos(toRadians(from.latitude)) *
			Math.cos(toRadians(to.latitude)) *
			Math.sin(deltaLongitude / 2) ** 2
	return Math.round(2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(a))))
}

export function nearbyRegions(
	incident: IncidentSnapshot,
): ReadonlyArray<NearbyRegion> {
	const primary = incident.topology.nodes.find(
		(node) => node.role === "primary",
	)
	return incident.topology.nodes
		.filter((node) => node.role === "backup")
		.map((node) => {
			const resource = incident.resources.find(
				(candidate) => candidate.region === node.region,
			)
			return {
				confirmed: resource?.confirmed ?? false,
				distanceKm: primary ? haversineKm(primary, node) : 0,
				identifier: node.identifier,
				label: node.label,
				region: node.region,
				remaining: resource
					? resource.totalCapacity - resource.allocatedCapacity
					: 0,
			}
		})
		.slice()
		.sort((left, right) => left.distanceKm - right.distanceKm)
}
