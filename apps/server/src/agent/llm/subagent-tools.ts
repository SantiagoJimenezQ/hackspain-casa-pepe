import {
	SUBAGENT_ENTRY_CHARACTER_LIMIT,
	SUBAGENT_LIST_LIMIT,
	SUBAGENT_READ_TOOL_NAMES,
	SUBAGENT_STEP_SCOPES,
	SUBAGENT_SUMMARY_CHARACTER_LIMIT,
} from "@agent/constants/subagent.constant"
import { LlmToolDefinition } from "@agent/llm/llm.types"
import { SubagentKind, SubagentReport } from "@agent/types/subagent.type"

const READ_DESCRIPTIONS = {
	check_services_status:
		"Check every service with an independent query and report discrepancies with the recorded state.",
	get_incident_context: "Read the current incident and plan.",
	get_recovery_capacity:
		"Inspect the current confirmed and remaining backup capacity.",
	get_service_health: "Inspect current service health and dependencies.",
	prioritize_customers:
		"Rank affected customers by recovery priority: business impact, blocked dependents, unavailable services, users, time down and recovery in progress.",
} as const

const NO_ARGUMENTS = {
	additionalProperties: false,
	properties: {},
	required: [],
	type: "object",
} as const

const EMPTY_ARGUMENTS_RULE =
	" Arguments must be exactly {}. The server supplies run, incident and resource context. Do not pass identifiers or an input/arguments/parameters wrapper."

export class SubagentArgumentsError extends Error {}

function tool(
	name: string,
	description: string,
	parameters: Record<string, unknown>,
): LlmToolDefinition {
	return { function: { description, name, parameters }, type: "function" }
}

function textList(description: string): Record<string, unknown> {
	return {
		description,
		items: { type: "string" },
		maxItems: SUBAGENT_LIST_LIMIT,
		type: "array",
	}
}

const REPORT_TOOL = tool(
	"report_result",
	"Return the finished result to the incident commander and end your work. This is the only way to answer the objective.",
	{
		additionalProperties: false,
		properties: {
			details: textList(
				"The concrete evidence, findings or actions behind the summary.",
			),
			pending: textList("What remains unknown, unanswered or unsent."),
			summary: {
				description:
					"One short paragraph the commander can act on, without private reasoning.",
				type: "string",
			},
		},
		required: ["summary", "details", "pending"],
		type: "object",
	},
)

const DISPATCH_TOOL = tool(
	"dispatch_step",
	'Start one runnable step listed in availableSteps. Arguments: {"stepIdentifier":"<identifier from availableSteps>"}. The server still enforces dependencies and mandatory approvals, so this may request an approval instead of starting the work.',
	{
		additionalProperties: false,
		properties: { stepIdentifier: { type: "string" } },
		required: ["stepIdentifier"],
		type: "object",
	},
)

export function subagentToolDefinitions(
	kind: SubagentKind,
): LlmToolDefinition[] {
	switch (kind) {
		case "investigator":
			return [
				...SUBAGENT_READ_TOOL_NAMES.map((name) =>
					tool(
						name,
						`${READ_DESCRIPTIONS[name]}${EMPTY_ARGUMENTS_RULE}`,
						{ ...NO_ARGUMENTS },
					),
				),
				REPORT_TOOL,
			]
		case "caller":
			return [DISPATCH_TOOL, REPORT_TOOL]
		case "communicator":
			return [
				tool(
					"read_incoming_emails",
					`Read the most recent messages in the incident mailbox.${EMPTY_ARGUMENTS_RULE}`,
					{ ...NO_ARGUMENTS },
				),
				DISPATCH_TOOL,
				REPORT_TOOL,
			]
	}
}

export function isSubagentReadTool(kind: SubagentKind, name: string): boolean {
	switch (kind) {
		case "investigator":
			return SUBAGENT_READ_TOOL_NAMES.some(
				(candidate) => candidate === name,
			)
		case "communicator":
			return name === "read_incoming_emails"
		case "caller":
			return false
	}
}

export function subagentStepScope(kind: SubagentKind): ReadonlyArray<string> {
	return SUBAGENT_STEP_SCOPES[kind]
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return (
		value !== null &&
		value !== undefined &&
		Object.getPrototypeOf(value) === Object.prototype
	)
}

export function isText(value: unknown): value is string {
	return Object.prototype.toString.call(value) === "[object String]"
}

function boundedList(value: unknown, path: string): ReadonlyArray<string> {
	if (!Array.isArray(value))
		throw new SubagentArgumentsError(`${path} must be an array of strings`)
	if (value.length > SUBAGENT_LIST_LIMIT)
		throw new SubagentArgumentsError(
			`${path} must hold at most ${SUBAGENT_LIST_LIMIT} entries`,
		)
	return value.map((entry, index) => {
		if (!isText(entry))
			throw new SubagentArgumentsError(
				`${path}[${index}] must be a string`,
			)
		return entry.slice(0, SUBAGENT_ENTRY_CHARACTER_LIMIT)
	})
}

/** Bounds the report before it becomes commander context and durable audit. */
export function parseSubagentReport(value: unknown): SubagentReport {
	if (!isRecord(value))
		throw new SubagentArgumentsError("Arguments must be an object")
	const keys = Object.keys(value).sort()
	if (keys.join(",") !== "details,pending,summary")
		throw new SubagentArgumentsError(
			"Expected exactly summary, details and pending",
		)
	if (!isText(value.summary) || !value.summary.trim().length)
		throw new SubagentArgumentsError("summary must be a nonempty string")
	return {
		details: boundedList(value.details, "details"),
		pending: boundedList(value.pending, "pending"),
		summary: value.summary.slice(0, SUBAGENT_SUMMARY_CHARACTER_LIMIT),
	}
}

export function parseDispatchIdentifier(value: unknown): string {
	if (!isRecord(value))
		throw new SubagentArgumentsError("Arguments must be an object")
	if (Object.keys(value).length !== 1 || !isText(value.stepIdentifier))
		throw new SubagentArgumentsError(
			"Expected only stepIdentifier as a string",
		)
	return value.stepIdentifier
}

export function requireEmptyArguments(value: unknown): void {
	if (!isRecord(value))
		throw new SubagentArgumentsError("Arguments must be an object")
	if (Object.keys(value).length)
		throw new SubagentArgumentsError(
			"This tool takes no arguments; received unexpected fields (see argumentDiagnostics).",
		)
}

export function subagentCorrectionFor(
	kind: SubagentKind,
	name: string,
): string {
	if (isSubagentReadTool(kind, name))
		return "Retry this read tool with exactly {}. Remove every field, including input, arguments, parameters, resource and identifiers. The server supplies the context."
	if (name === "dispatch_step")
		return 'Use exactly {"stepIdentifier":"<identifier from availableSteps>"}. Only the steps listed in availableSteps can be dispatched.'
	if (name === "report_result")
		return "Use exactly {summary, details, pending}: a nonempty summary string and two arrays of short strings."
	return "Choose one of the declared function tools and follow its argument schema. Finish with report_result."
}
