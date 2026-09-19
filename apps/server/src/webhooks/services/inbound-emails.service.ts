import { createHmac, timingSafeEqual } from "node:crypto"
import { getReceivedEmail, listReceivedEmails } from "@casa-pepe/tools"
import { insertEntity } from "@common/database/persistence.helper"
import { nowISO } from "@common/helpers/clock.helper"
import { createPrefixedIdentifier } from "@common/helpers/identifier.helper"
import { ConfigurationService } from "@common/services/configuration.service"
import { RunsService } from "@incidents/services/runs.service"
import { Injectable } from "@nestjs/common"
import { InjectRepository } from "@nestjs/typeorm"
import { InboundEmailEntity } from "@webhooks/entities/inbound-email.entity"
import { Repository } from "typeorm"

export interface ResendEmailReceivedEvent {
	type?: string
	created_at?: string
	data?: {
		email_id?: string
		from?: string
		to?: string[]
		subject?: string
		message_id?: string
		created_at?: string
		[key: string]: unknown
	}
	[key: string]: unknown
}

export interface InboundEmailRecord {
	readonly identifier: string
	readonly emailId: string
	readonly runIdentifier: string
	readonly from: string
	readonly to: ReadonlyArray<string>
	readonly subject: string
	readonly messageId: string
	readonly receivedAt: string
}

@Injectable()
export class InboundEmailsService {
	constructor(
		@InjectRepository(InboundEmailEntity)
		private readonly repository: Repository<InboundEmailEntity>,
		private readonly runs: RunsService,
		private readonly configuration: ConfigurationService,
	) {}

	verifySignature(
		rawBody: string,
		headers: {
			readonly id?: string
			readonly timestamp?: string
			readonly signature?: string
		},
	): boolean {
		const secret = this.configuration.email.webhookSecret
		if (!secret || !headers.id || !headers.timestamp || !headers.signature)
			return false
		const timestamp = Number(headers.timestamp)
		if (
			!Number.isFinite(timestamp) ||
			Math.abs(Date.now() / 1000 - timestamp) > 300
		)
			return false
		const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
		const signed = `${headers.id}.${headers.timestamp}.${rawBody}`
		const expected = createHmac("sha256", secretBytes)
			.update(signed)
			.digest("base64")
		return headers.signature.split(" ").some((value) => {
			const provided = value.replace(/^v\d+,/, "")
			const left = Buffer.from(provided)
			const right = Buffer.from(expected)
			return left.length === right.length && timingSafeEqual(left, right)
		})
	}

	async receive(
		event: ResendEmailReceivedEvent,
	): Promise<InboundEmailRecord> {
		if (event.type !== "email.received" || !event.data?.email_id) {
			throw new Error("Unsupported Resend webhook event")
		}
		const existing = await this.repository.findOne({
			where: { emailId: event.data.email_id },
		})
		if (existing) return this.toRecord(existing)
		const active = await this.runs.findActiveEntity()
		const entity = this.repository.create({
			emailId: event.data.email_id,
			event,
			from: event.data.from ?? "",
			identifier: createPrefixedIdentifier("email"),
			messageId: event.data.message_id ?? "",
			receivedAt: event.data.created_at ?? event.created_at ?? nowISO(),
			runIdentifier: active?.runIdentifier ?? "unassigned",
			subject: event.data.subject ?? "",
			to: event.data.to ?? [],
		})
		return this.toRecord(await insertEntity(this.repository, entity))
	}

	async list(
		runIdentifier: string,
		limit = 10,
	): Promise<ReadonlyArray<InboundEmailRecord>> {
		const entities = await this.repository.find({
			order: { receivedAt: "DESC" },
			take: Math.min(Math.max(limit, 1), 50),
			where: [{ runIdentifier }, { runIdentifier: "unassigned" }],
		})
		return entities.map((entity) => this.toRecord(entity))
	}

	async read(emailId: string): Promise<Record<string, unknown>> {
		const response = await getReceivedEmail(
			this.configuration.email,
			emailId,
		)
		return response as Record<string, unknown>
	}

	async listFromProvider(limit = 10): Promise<unknown> {
		return listReceivedEmails(this.configuration.email, { limit })
	}

	private toRecord(entity: InboundEmailEntity): InboundEmailRecord {
		return {
			emailId: entity.emailId,
			from: entity.from,
			identifier: entity.identifier,
			messageId: entity.messageId,
			receivedAt: entity.receivedAt,
			runIdentifier: entity.runIdentifier,
			subject: entity.subject,
			to: entity.to,
		}
	}
}
