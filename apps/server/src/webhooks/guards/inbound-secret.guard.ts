import { Authorization } from "@authentication/decorators/authorization.decorator"
import { HTTP_HEADERS } from "@common/constants/application.constant"
import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { InvalidSignatureException } from "@common/exceptions/domain.exception"
import { readHeader } from "@common/helpers/request.helper"
import { isSharedSecretValid } from "@common/helpers/signature.helper"
import { ConfigurationService } from "@common/services/configuration.service"
import {
	applyDecorators,
	CanActivate,
	ExecutionContext,
	Injectable,
	Logger,
	UseGuards,
} from "@nestjs/common"
import { InboundEmailsService } from "@webhooks/services/inbound-emails.service"
import { Request } from "express"

@Injectable()
export class HappyRobotSecretGuard implements CanActivate {
	private readonly logger = new Logger(HappyRobotSecretGuard.name)

	constructor(private readonly configuration: ConfigurationService) {}

	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<Request>()
		const provided = readHeader(request, HTTP_HEADERS.HAPPYROBOT_SIGNATURE)
		if (
			!isSharedSecretValid(
				this.configuration.happyRobot.webhookSecret,
				provided,
			)
		) {
			this.logger.warn(LOG_MESSAGES.WEBHOOKS.INBOUND_REJECTED, {
				provider: "HappyRobot",
			})
			throw new InvalidSignatureException()
		}
		return true
	}
}

@Injectable()
export class RecoverySecretGuard implements CanActivate {
	private readonly logger = new Logger(RecoverySecretGuard.name)

	constructor(private readonly configuration: ConfigurationService) {}

	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<Request>()
		const provided = readHeader(request, HTTP_HEADERS.RECOVERY_SIGNATURE)
		if (
			!isSharedSecretValid(
				this.configuration.recovery.webhookSecret,
				provided,
			)
		) {
			this.logger.warn(LOG_MESSAGES.WEBHOOKS.INBOUND_REJECTED, {
				provider: "Recovery environment",
			})
			throw new InvalidSignatureException()
		}
		return true
	}
}

@Injectable()
export class ResendWebhookSecretGuard implements CanActivate {
	constructor(private readonly inboundEmails: InboundEmailsService) {}

	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<Request>()
		const rawBody = (
			(request as Request & { rawBody?: Buffer }).rawBody ??
			Buffer.from(JSON.stringify(request.body))
		).toString()
		if (
			!this.inboundEmails.verifySignature(rawBody, {
				id: readHeader(request, "svix-id"),
				signature: readHeader(request, "svix-signature"),
				timestamp: readHeader(request, "svix-timestamp"),
			})
		)
			throw new InvalidSignatureException()
		return true
	}
}

export function HappyRobotInbound() {
	return applyDecorators(
		Authorization("public"),
		UseGuards(HappyRobotSecretGuard),
	)
}

export function RecoveryInbound() {
	return applyDecorators(
		Authorization("public"),
		UseGuards(RecoverySecretGuard),
	)
}

export function ResendInbound() {
	return applyDecorators(
		Authorization("public"),
		UseGuards(ResendWebhookSecretGuard),
	)
}
