export interface ErrorResponse {
	readonly statusCode: number
	readonly error: string
	readonly message: string
	readonly details: ReadonlyArray<string>
	readonly path: string
	readonly correlationIdentifier: string
	readonly timestamp: string
}
