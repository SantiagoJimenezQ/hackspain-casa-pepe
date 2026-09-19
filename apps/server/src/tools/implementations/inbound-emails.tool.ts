import { getReceivedEmail, listReceivedEmails } from "@casa-pepe/tools"
import { ConfigurationService } from "@common/services/configuration.service"
import { Injectable } from "@nestjs/common"
import { ToolContext, ToolExecutionResult } from "@tools/types/tool.type"

@Injectable()
export class ReadIncomingEmailsTool {
	readonly name = "read_incoming_emails" as const

	constructor(private readonly configuration: ConfigurationService) {}

	async execute(
		input: { readonly limit?: number; readonly emailId?: string },
		_context: ToolContext,
	): Promise<ToolExecutionResult> {
		try {
			const limit = Math.min(Math.max(input.limit ?? 10, 1), 50)
			const summaries = await listReceivedEmails(
				this.configuration.email,
				{
					limit,
				},
			)
			const data = this.extractData(summaries)
			const selected = input.emailId
				? this.asRecord(
						await getReceivedEmail(
							this.configuration.email,
							input.emailId,
						),
					)
				: null
			return {
				output: {
					emails: data,
					kind: "inbound-emails",
					selected,
				},
				status: "succeeded",
			}
		} catch (error) {
			return {
				error: {
					code: "INBOUND_EMAIL_READ_FAILED",
					message:
						error instanceof Error
							? error.message
							: "Unable to read inbound email",
					retryable: true,
				},
				status: "failed",
			}
		}
	}

	private extractData(value: unknown): Array<Record<string, unknown>> {
		if (!value || typeof value !== "object") return []
		const data = (value as { data?: unknown }).data
		return Array.isArray(data)
			? data.filter((item): item is Record<string, unknown> =>
					Boolean(item && typeof item === "object"),
				)
			: []
	}

	private asRecord(value: unknown): Record<string, unknown> {
		return value && typeof value === "object"
			? (value as Record<string, unknown>)
			: {}
	}
}
