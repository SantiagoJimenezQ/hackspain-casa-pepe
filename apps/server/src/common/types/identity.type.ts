export type ActorKind =
	| "agent"
	| "operator"
	| "engineer"
	| "harness"
	| "integration"
	| "system"

export interface Actor {
	readonly kind: ActorKind
	readonly name: string
}
