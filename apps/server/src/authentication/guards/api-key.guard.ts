import {
	API_KEY_QUERY_PARAMETER,
	AUTHORIZATION_SCHEME,
	AUTHORIZATION_SCOPE_METADATA_KEY,
} from "@authentication/constants/authentication.constant"
import {
	AuthorizationScope,
	Principal,
} from "@authentication/types/authorization.type"
import { HTTP_HEADERS } from "@common/constants/application.constant"
import { readHeader } from "@common/helpers/request.helper"
import { isSharedSecretValid } from "@common/helpers/signature.helper"
import { ConfigurationService } from "@common/services/configuration.service"
import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { Request } from "express"

interface AuthorizationHeader {
	readonly scheme: string
	readonly credential: string
}

function readQueryAPIKey(request: Request): string {
	return [request.query[API_KEY_QUERY_PARAMETER]].flat().map((value) => String(value)).join("")
}

function parseAuthorizationHeader(rawHeader: string): AuthorizationHeader {
	const [scheme = "", credential = ""] = rawHeader.trim().split(/\s+/, 2)
	return { credential, scheme: scheme.toUpperCase() }
}

@Injectable()
export class APIKeyGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly configuration: ConfigurationService,
	) {}

	canActivate(context: ExecutionContext): boolean {
		const scope = this.resolveScope(context)
		const request = context
			.switchToHttp()
			.getRequest<Request & { principal: Principal }>()
		const principal = this.resolvePrincipal(
			readHeader(request, HTTP_HEADERS.AUTHORIZATION),
			readQueryAPIKey(request),
		)
		request.principal = principal

		switch (scope) {
			case "public":
				return true
			case "operator":
				if (principal.kind === "anonymous") {
					throw new UnauthorizedException("An API key is required")
				}
				return true
		}
	}

	private resolveScope(context: ExecutionContext): AuthorizationScope {
		const scope = this.reflector.getAllAndOverride<
			AuthorizationScope | undefined
		>(AUTHORIZATION_SCOPE_METADATA_KEY, [
			context.getHandler(),
			context.getClass(),
		])
		if (scope === undefined) {
			return "operator"
		}
		return scope
	}

	private resolvePrincipal(rawHeader: string, queryAPIKey: string): Principal {
		const header = parseAuthorizationHeader(rawHeader)
		const apiKey = this.configuration.authentication.apiKey
		if (header.scheme === AUTHORIZATION_SCHEME && isSharedSecretValid(apiKey, header.credential)) {
			return { kind: "operator" }
		}
		if (queryAPIKey && isSharedSecretValid(apiKey, queryAPIKey)) {
			return { kind: "operator" }
		}
		return { kind: "anonymous" }
	}
}
