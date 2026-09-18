import { HTTP_HEADERS } from "@common/constants/application.constant"
import { createIdentifier } from "@common/helpers/identifier.helper"
import { Request } from "express"

export function readHeader(request: Request, headerName: string): string {
	return [request.headers[headerName]].flat().join(",")
}

export function resolveCorrelationIdentifier(request: Request): string {
	const provided = readHeader(request, HTTP_HEADERS.CORRELATION_IDENTIFIER)
	if (provided) {
		return provided
	}
	return createIdentifier()
}
