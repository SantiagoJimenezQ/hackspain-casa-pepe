import {
	ActivityEventType,
	ActivityRecord,
} from "@activity/types/activity.type"
import { PlanBuildInput } from "@agent/types/agent.type"
import { EngineerCallRecord } from "@engineers/types/engineer.type"

export const MEMORY_LIMIT = 16
export const MEMORY_TYPES: ActivityEventType[] = [
	"agent.llm-decision",
	"agent.llm-rejected",
	"agent.llm-stale",
	"agent.llm-failed",
	"agent.cycle-finished",
	"plan.revised",
	"decision.recorded",
]

// Only structural field names are retained in diagnostics. Unknown field names
// may themselves contain secrets, so neither those names nor values are logged.
const SAFE_FIELDS = new Set([
	"input",
	"arguments",
	"parameters",
	"resourceIdentifier",
	"incidentIdentifier",
	"runIdentifier",
	"serviceIdentifier",
	"stepIdentifier",
	"planIdentifier",
	"resourceId",
	"incidentId",
	"runId",
	"serviceId",
	"resource",
	"region",
	"reason",
	"summary",
	"assumptions",
	"capacity",
	"priorities",
	"steps",
	"identifier",
	"order",
	"title",
	"invocation",
	"name",
	"owner",
	"kind",
	"capacityUnits",
	"requiresApproval",
	"dependsOn",
	"status",
	"statusReason",
	"toolCallIdentifier",
	"approvalIdentifier",
	"attempts",
	"resultSummary",
	"updatedAt",
	"totalCapacity",
	"assumedCapacity",
	"plannedUnits",
	"remainingUnits",
	"confirmed",
	"postponedUnits",
	"rank",
	"score",
	"businessImpact",
	"decision",
	"blockedBy",
	"serviceName",
])

export function argumentDiagnostics(raw: string): Record<string, unknown> {
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		return { bytes: Buffer.byteLength(raw), validJson: false }
	}
	return {
		bytes: Buffer.byteLength(raw),
		shape: shape(parsed, 0),
		validJson: true,
	}
}

function shape(value: unknown, depth: number): unknown {
	if (value === null) return "null"
	if (typeof value !== "object") return typeof value
	if (Array.isArray(value))
		return {
			items:
				depth < 3
					? value.slice(0, 2).map((item) => shape(item, depth + 1))
					: [],
			length: value.length,
			type: "array",
		}
	const entries = Object.entries(value)
	return {
		fieldCount: entries.length,
		fields:
			depth < 3
				? entries.slice(0, 16).map(([key, item]) => ({
						name: SAFE_FIELDS.has(key) ? key : "[redacted-field]",
						type: shape(item, depth + 1),
					}))
				: [],
		type: "object",
	}
}

/** Remove submitted text/unknown keys from a controlled validator error. */
export function safeValidationError(message: string, raw: string): string {
	const values = new Set<string>()
	function visit(value: unknown, depth = 0) {
		if (depth > 20) return
		if (typeof value === "string" && value) values.add(value)
		else if (Array.isArray(value)) {
			for (const item of value) visit(item, depth + 1)
		} else if (value && typeof value === "object") {
			for (const [key, item] of Object.entries(value)) {
				if (!SAFE_FIELDS.has(key)) values.add(key)
				visit(item, depth + 1)
			}
		}
	}
	try {
		visit(JSON.parse(raw))
	} catch {
		return "Arguments must be valid JSON."
	}
	const alternatives = [...values]
		.sort((a, b) => b.length - a.length)
		.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
	// Redact complete submitted tokens, not substrings of controlled field names
	// or prose (for example, "postpone" must not corrupt "postponedUnits").
	const safe = alternatives.length
		? message.replace(
				new RegExp(
					`(?<![\\p{L}\\p{N}_-])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}_-])`,
					"gu",
				),
				"[argument]",
			)
		: message
	return safe.slice(0, 1000)
}

export interface InvestigationEvent {
	type: ActivityEventType
	summary: string
	tool?: string
	error?: string
	correction?: string
	selectedTools?: string[]
}

/** Project only public decision information, never tool arguments or transcripts. */
export function investigationEvent(
	type: ActivityEventType,
	summary: string,
	payload: Record<string, unknown>,
): InvestigationEvent {
	const result = payload.result as Record<string, unknown> | undefined
	return {
		summary: summary.slice(0, 600),
		type,
		...(Array.isArray(payload.tools)
			? {
					selectedTools: payload.tools
						.filter(
							(value): value is string =>
								typeof value === "string",
						)
						.slice(0, 4)
						.map((value) => value.slice(0, 80)),
				}
			: {}),
		...(typeof payload.tool === "string"
			? { tool: payload.tool.slice(0, 80) }
			: {}),
		...(typeof result?.error === "string"
			? { error: result.error.slice(0, 1000) }
			: {}),
		...(typeof result?.correction === "string"
			? { correction: result.correction.slice(0, 600) }
			: {}),
	}
}

export function restoreInvestigation(
	records: ReadonlyArray<ActivityRecord>,
	runIdentifier: string,
): InvestigationEvent[] {
	return records
		.filter(
			(event) =>
				event.runIdentifier === runIdentifier &&
				!event.replayed &&
				MEMORY_TYPES.includes(event.type),
		)
		.slice(-MEMORY_LIMIT)
		.map((event) =>
			investigationEvent(event.type, event.summary, event.payload),
		)
}

export function investigationSummary(
	input: PlanBuildInput,
	recentEvents: InvestigationEvent[],
	evidence: Record<string, unknown> = {},
) {
	const calls = (
		Array.isArray(evidence.calls) ? evidence.calls : []
	) as EngineerCallRecord[]
	return {
		// This is a projection of current evidence, not a new model claim of truth.
		confirmedFindings: input.incident.facts
			.filter((fact) => fact.status === "confirmed")
			.slice(-8)
			.map((fact) => ({
				source: fact.source.slice(0, 200),
				statement: fact.statement.slice(0, 600),
			})),
		currentPlan: input.previousPlan
			? {
					assumptions: input.previousPlan.assumptions
						.slice(0, 8)
						.map((value) => value.slice(0, 300)),
					reason: input.previousPlan.reason.slice(0, 600),
					summary: input.previousPlan.summary.slice(0, 600),
					version: input.previousPlan.version,
				}
			: null,
		recentEvents: recentEvents.slice(-MEMORY_LIMIT),
		runIdentifier: input.incident.runIdentifier,
		unresolvedFacts: input.incident.facts
			.filter((fact) => fact.status !== "confirmed")
			.slice(-8)
			.map((fact) => ({
				statement: fact.statement.slice(0, 600),
				status: fact.status,
			})),
		unresolvedQuestions: calls
			.flatMap((call) =>
				call.questions
					.filter(
						(question) =>
							!call.result?.answers.some(
								(answer) =>
									answer.key === question.key &&
									answer.confirmed === true,
							),
					)
					.map((question) => ({
						callIdentifier: call.identifier,
						callStatus: call.status,
						question: question.question.slice(0, 600),
					})),
			)
			.slice(-8),
	}
}
