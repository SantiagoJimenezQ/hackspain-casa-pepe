import { AUTHORIZATION_SCOPE_METADATA_KEY } from "@authentication/constants/authentication.constant"
import { APIKeyGuard } from "@authentication/guards/api-key.guard"
import { IncidentEntity } from "@incidents/entities/incident.entity"
import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { Request } from "express"
import { DataSource, EntityTarget, ObjectLiteral } from "typeorm"
import {
	RUN_RESOURCE,
	SESSION_ADMIN,
	SESSION_HEADER,
	sessionIdForToken,
} from "./browser-session"

/** Validate before Nest opens an SSE response or invokes a controller. */
@Injectable()
export class BrowserSessionGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly database: DataSource,
		private readonly apiKey: APIKeyGuard,
	) {}
	async canActivate(context: ExecutionContext): Promise<boolean> {
		this.apiKey.canActivate(context)
		const targets = [context.getHandler(), context.getClass()]
		if (
			this.reflector.getAllAndOverride(
				AUTHORIZATION_SCOPE_METADATA_KEY,
				targets,
			) === "public"
		)
			return true
		const request = context.switchToHttp().getRequest<Request>()
		const token = request.headers[SESSION_HEADER]
		if (this.reflector.getAllAndOverride(SESSION_ADMIN, targets)) {
			if (token !== undefined)
				throw new ForbiddenException(
					"This endpoint requires direct administrator access",
				)
			return true
		}
		if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
			throw new UnauthorizedException("A browser session is required")
		const browserSessionId = sessionIdForToken(token)
		for (const value of [
			request.query.runIdentifier,
			request.params.runIdentifier,
			request.body?.runIdentifier,
			request.body?.sourceRunIdentifier,
		]) {
			if (value === undefined) continue
			if (
				typeof value !== "string" ||
				!(await this.database
					.getRepository(IncidentEntity)
					.findOneBy({ browserSessionId, runIdentifier: value }))
			)
				throw new NotFoundException("Run not found")
		}
		const entity = this.reflector.getAllAndOverride<
			EntityTarget<ObjectLiteral>
		>(RUN_RESOURCE, targets)
		if (entity && request.params.identifier) {
			const record = await this.database
				.getRepository(entity)
				.findOneBy({ identifier: request.params.identifier })
			const run =
				record?.runIdentifier &&
				(await this.database.getRepository(IncidentEntity).findOneBy({
					browserSessionId,
					runIdentifier: record.runIdentifier,
				}))
			if (!run) throw new NotFoundException("Record not found")
		}
		return true
	}
}
