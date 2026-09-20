import { AUTHORIZATION_SCOPE_METADATA_KEY } from "@authentication/constants/authentication.constant"
import {
	CallHandler,
	ExecutionContext,
	Injectable,
	NestInterceptor,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { Request } from "express"
import { Observable } from "rxjs"
import {
	SESSION_HEADER,
	sessionContext,
	sessionIdForToken,
} from "./browser-session"

/** Subscribe inside ALS so promises, event handlers and streams keep the originating identity. */
@Injectable()
export class BrowserSessionInterceptor implements NestInterceptor {
	constructor(private readonly reflector: Reflector) {}
	intercept(
		context: ExecutionContext,
		next: CallHandler,
	): Observable<unknown> {
		if (
			this.reflector.getAllAndOverride(AUTHORIZATION_SCOPE_METADATA_KEY, [
				context.getHandler(),
				context.getClass(),
			]) === "public"
		)
			return next.handle()
		const token = context.switchToHttp().getRequest<Request>().headers[
			SESSION_HEADER
		]
		// The guard has already authenticated the token. Public callbacks have no browser identity.
		if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
			return next.handle()
		return new Observable((subscriber) =>
			sessionContext.run(sessionIdForToken(token), () =>
				next.handle().subscribe(subscriber),
			),
		)
	}
}
