import { ConfigurationService } from "@common/services/configuration.service"
import {
	ElevenLabsConfiguration,
	EngineerCallMode,
} from "@common/types/configuration.type"
import {
	AdapterCallOutcome,
	AdapterCallRequest,
	EngineerCallAdapter,
	EngineerCallRecord,
	EngineerCallResult,
} from "@engineers/types/engineer.type"
import { Injectable } from "@nestjs/common"
import {
	EngineerCallAuthorizations,
	EngineerCallIncidentContext,
} from "../../../../../packages/contracts/outbound-calls"

export const ELEVENLABS_OUTBOUND_CALL_URL =
	"https://api.elevenlabs.io/v1/convai/twilio/outbound-call"
export const ELEVENLABS_CONVERSATION_URL =
	"https://api.elevenlabs.io/v1/convai/conversations"

type ProviderCallOutcome = Extract<
	AdapterCallOutcome,
	{ readonly kind: "accepted" }
> & {
	readonly providerCallSid: string
}

type ProviderCallResult = EngineerCallResult & {
	readonly authorizations: EngineerCallAuthorizations
}

type JSONRecord = Record<string, unknown>

interface ElevenLabsOutboundCallResponse extends JSONRecord {
	readonly success?: unknown
	readonly conversation_id?: unknown
	readonly callSid?: unknown
}

interface ElevenLabsConversationResponse extends JSONRecord {
	readonly status?: unknown
	readonly conversation_id?: unknown
	readonly agent_id?: unknown
	readonly transcript?: unknown
	readonly analysis?: unknown
}

const TERMINAL_FAILURE_STATUSES: ReadonlyMap<
	string,
	EngineerCallResult["outcome"]
> = new Map([
	["error", "failed"],
	["failed", "failed"],
	["failure", "failed"],
	["no-answer", "no-answer"],
	["no_answer", "no-answer"],
])

@Injectable()
export class ElevenLabsEngineerCallAdapter implements EngineerCallAdapter {
	readonly mode: EngineerCallMode = "live"
	readonly provider = "elevenlabs" as const

	constructor(private readonly configuration: ConfigurationService) {}

	async start(
		request: AdapterCallRequest,
		_deliverResult: Parameters<EngineerCallAdapter["start"]>[1],
	): Promise<AdapterCallOutcome> {
		const configuration = this.configuration.elevenLabs
		const configurationError = validateConfiguration(configuration)
		if (configurationError) {
			return { kind: "failed", reason: configurationError }
		}

		const destination = request.call.engineer.phone.trim()
		const destinationError = validateDestination(destination)
		if (destinationError) {
			return { kind: "failed", reason: destinationError }
		}

		const payload = {
			agent_id: configuration.agentId,
			agent_phone_number_id: configuration.phoneNumberId,
			conversation_initiation_client_data: {
				dynamic_variables: dynamicVariables(
					request.call.engineer.name,
					request.incidentContext,
					request.call.purpose,
				),
			},
			to_number: destination,
		}

		try {
			const { body, response } =
				await this.fetchJSON<ElevenLabsOutboundCallResponse>(
					ELEVENLABS_OUTBOUND_CALL_URL,
					{
						body: JSON.stringify(payload),
						headers: {
							"Content-Type": "application/json",
							"xi-api-key": configuration.apiKey,
						},
						method: "POST",
					},
				)
			if (!response.ok) {
				return {
					kind: "failed",
					reason: `ElevenLabs outbound call returned HTTP ${response.status}`,
				}
			}

			if (
				body?.success !== true ||
				typeof body.conversation_id !== "string" ||
				!body.conversation_id.length ||
				typeof body.callSid !== "string" ||
				!body.callSid.length
			) {
				return {
					kind: "failed",
					reason: "ElevenLabs returned an invalid outbound call response",
				}
			}

			const outcome: ProviderCallOutcome = {
				kind: "accepted",
				provider: "elevenlabs",
				providerCallSid: body.callSid,
				providerReference: body.conversation_id,
			}
			return outcome
		} catch (error) {
			return {
				kind: "failed",
				reason: describeRequestFailure("start", error),
			}
		}
	}

	/**
	 * Fetch one provider snapshot. The runtime owns the polling schedule and
	 * persistence; this method only translates a completed snapshot.
	 */
	async getResult(
		call: EngineerCallRecord,
	): Promise<EngineerCallResult | null> {
		const configuration = this.configuration.elevenLabs
		if (
			validateConfiguration(configuration) ||
			!call.providerReference.trim()
		) {
			return null
		}

		const url = `${ELEVENLABS_CONVERSATION_URL}/${encodeURIComponent(call.providerReference)}`
		try {
			const { body, response } =
				await this.fetchJSON<ElevenLabsConversationResponse>(url, {
					headers: { "xi-api-key": configuration.apiKey },
					method: "GET",
				})
			if (!response.ok || !body) {
				return null
			}

			if (
				body.conversation_id !== call.providerReference ||
				(typeof body.agent_id === "string" &&
					body.agent_id !== configuration.agentId)
			) {
				return null
			}

			const status = typeof body.status === "string" ? body.status : ""
			const failureOutcome = TERMINAL_FAILURE_STATUSES.get(status)
			if (failureOutcome) {
				return buildResult(body, null, failureOutcome)
			}

			if (status !== "done" || !isRecord(body.analysis)) {
				return null
			}

			return buildResult(body, body.analysis, "completed")
		} catch {
			return null
		}
	}

	private async fetchJSON<T>(
		url: string,
		init: RequestInit,
	): Promise<{ readonly body: T | null; readonly response: Response }> {
		const controller = new AbortController()
		const timeoutHandle = setTimeout(
			() => controller.abort(),
			this.configuration.agent.toolTimeoutMilliseconds,
		)
		try {
			const response = await fetch(url, {
				...init,
				redirect: "error",
				signal: controller.signal,
			})
			const body = response.ok ? await readJSON<T>(response) : null
			return { body, response }
		} finally {
			clearTimeout(timeoutHandle)
		}
	}
}

function validateConfiguration(
	configuration: ElevenLabsConfiguration,
): string | null {
	if (
		!configuration ||
		typeof configuration.apiKey !== "string" ||
		!configuration.apiKey.trim() ||
		typeof configuration.agentId !== "string" ||
		!configuration.agentId.trim() ||
		typeof configuration.phoneNumberId !== "string" ||
		!configuration.phoneNumberId.trim()
	) {
		return "ElevenLabs is not configured; set the API key, agent ID, and phone number ID"
	}
	return null
}

function validateDestination(destination: string): string | null {
	if (!/^\+[1-9]\d{7,14}$/.test(destination)) {
		return "ElevenLabs destination number must be in E.164 format"
	}
	return null
}

function dynamicVariables(
	contactName: string,
	context: EngineerCallIncidentContext,
	purpose: string,
): Record<string, string> {
	return {
		contact_name: contactName,
		incident_description: limitToTwoSentences(
			context.incidentDescription || purpose,
		),
		location: context.location,
		services_down: context.servicesDown.join(", "),
	}
}

function buildResult(
	body: ElevenLabsConversationResponse,
	analysis: JSONRecord | null,
	outcome: EngineerCallResult["outcome"],
): ProviderCallResult {
	return {
		answers: [],
		authorizations: {
			notifyAllClients: authorizationFrom(
				analysis?.data_collection_results,
				"notify_all_clients",
			),
			trafficFailoverAuthorized: authorizationFrom(
				analysis?.data_collection_results,
				"traffic_failover_authorized",
			),
		},
		outcome,
		summary: conversationSummary(analysis, outcome),
		transcript: conversationTranscript(body.transcript),
	}
}

async function readJSON<T>(response: Response): Promise<T | null> {
	try {
		return (await response.json()) as T
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			throw error
		}
		return null
	}
}

function isRecord(value: unknown): value is JSONRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function authorizationFrom(
	results: unknown,
	key: string,
): EngineerCallAuthorizations["notifyAllClients"] {
	const entry =
		isRecord(results) && isRecord(results[key]) ? results[key] : null
	return {
		rationale: typeof entry?.rationale === "string" ? entry.rationale : "",
		value: typeof entry?.value === "boolean" ? entry.value : null,
	}
}

function conversationSummary(
	analysis: JSONRecord | null,
	outcome: EngineerCallResult["outcome"],
): string {
	if (typeof analysis?.transcript_summary === "string") {
		return analysis.transcript_summary
	}
	if (typeof analysis?.call_summary_title === "string") {
		return analysis.call_summary_title
	}
	return `ElevenLabs conversation ${outcome}`
}

function conversationTranscript(value: unknown): string {
	if (!Array.isArray(value)) {
		return ""
	}
	return value
		.filter(isRecord)
		.map((entry) => {
			const role = typeof entry.role === "string" ? entry.role : "unknown"
			const message =
				typeof entry.message === "string" ? entry.message : ""
			return message ? `${role}: ${message}` : ""
		})
		.filter(Boolean)
		.join("\n")
}

function limitToTwoSentences(description: string): string {
	const normalized = description.replace(/\s+/g, " ").trim()
	if (!normalized) {
		return ""
	}

	let sentenceEndings = 0
	for (let index = 0; index < normalized.length; index += 1) {
		if (!/[.!?]/.test(normalized[index])) {
			continue
		}
		const next = normalized[index + 1]
		if (next && !/\s/.test(next)) {
			continue
		}
		sentenceEndings += 1
		if (sentenceEndings === 2) {
			return normalized.slice(0, index + 1).trim()
		}
	}
	return normalized
}

function describeRequestFailure(
	operation: "start" | "result",
	error: unknown,
): string {
	if (error instanceof Error && error.name === "AbortError") {
		return `ElevenLabs ${operation} request timed out`
	}
	return `ElevenLabs ${operation} request failed; inspect the provider before retrying`
}
