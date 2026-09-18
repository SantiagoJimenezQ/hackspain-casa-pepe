import { LOG_MESSAGES } from "@common/constants/log-messages.constant"
import { nowISO } from "@common/helpers/clock.helper"
import { resolveCorrelationIdentifier } from "@common/helpers/request.helper"
import { ErrorResponse } from "@common/types/error.type"
import {
	ArgumentsHost,
	Catch,
	ExceptionFilter,
	HttpException,
	HttpStatus,
	Logger,
} from "@nestjs/common"
import { Request, Response } from "express"

interface HTTPExceptionBody {
	readonly error: string
	readonly message: string
	readonly details: ReadonlyArray<string>
}

interface RawExceptionBody {
	readonly error?: unknown
	readonly message?: unknown
	readonly details?: unknown
}

function toRawExceptionBody(body: string | object): RawExceptionBody {
	if (body instanceof Object) {
		return body as RawExceptionBody
	}
	return { message: body }
}

function toStringList(value: unknown): ReadonlyArray<string> {
	if (Array.isArray(value)) {
		return value.map((entry) => String(entry))
	}
	return []
}

function normalizeExceptionBody(exception: HttpException): HTTPExceptionBody {
	const {
		details = [],
		error = exception.name,
		message = exception.message,
	} = toRawExceptionBody(exception.getResponse())
	if (Array.isArray(message)) {
		return {
			details: toStringList(message),
			error: String(error),
			message: "Validation failed",
		}
	}
	return {
		details: toStringList(details),
		error: String(error),
		message: String(message),
	}
}

@Catch()
export class HTTPExceptionFilter implements ExceptionFilter {
	private readonly logger = new Logger(HTTPExceptionFilter.name)

	catch(exception: unknown, host: ArgumentsHost): void {
		const context = host.switchToHttp()
		const response = context.getResponse<Response>()
		const request = context.getRequest<Request>()
		const correlationIdentifier = resolveCorrelationIdentifier(request)

		const errorResponse = this.buildErrorResponse(
			exception,
			request.url,
			correlationIdentifier,
		)
		if (errorResponse.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
			const stack =
				exception instanceof Error ? exception.stack : String(exception)
			this.logger.error(
				LOG_MESSAGES.APPLICATION.UNHANDLED_EXCEPTION,
				stack,
			)
		}
		response.status(errorResponse.statusCode).json(errorResponse)
	}

	private buildErrorResponse(
		exception: unknown,
		path: string,
		correlationIdentifier: string,
	): ErrorResponse {
		if (exception instanceof HttpException) {
			const body = normalizeExceptionBody(exception)
			return {
				correlationIdentifier,
				details: body.details,
				error: body.error,
				message: body.message,
				path,
				statusCode: exception.getStatus(),
				timestamp: nowISO(),
			}
		}
		return {
			correlationIdentifier,
			details: [],
			error: "Internal Server Error",
			message: "Unexpected error while processing the request",
			path,
			statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
			timestamp: nowISO(),
		}
	}
}
