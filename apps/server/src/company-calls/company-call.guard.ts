import { readHeader } from "@common/helpers/request.helper"
import { isSharedSecretValid } from "@common/helpers/signature.helper"
import { ConfigurationService } from "@common/services/configuration.service"
import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common"
import { Request } from "express"
@Injectable()
export class CompanyCallGuard implements CanActivate {
	constructor(private readonly configuration: ConfigurationService) {}
	canActivate(context: ExecutionContext): boolean {
		if (this.configuration.happyRobot.mode !== "live") {
			throw new ForbiddenException("Live voice integrations are disabled")
		}
		const secret = this.configuration.happyRobot.inboundWebhookSecret
		const request = context.switchToHttp().getRequest<Request>()
		if (
			!secret ||
			!isSharedSecretValid(
				secret,
				readHeader(request, "x-casa-pepe-webhook-secret"),
			)
		)
			throw new UnauthorizedException("Invalid inbound call secret")
		return true
	}
}
