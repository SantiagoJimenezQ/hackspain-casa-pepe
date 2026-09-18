import { IntegrationException } from "@common/exceptions/domain.exception"
import { ClassConstructor, plainToInstance } from "class-transformer"
import { validateSync } from "class-validator"

export function parseExternalResponse<Shape extends object>(
	integrationName: string,
	shape: ClassConstructor<Shape>,
	data: unknown,
): Shape {
	const instance = plainToInstance(shape, data, {
		enableImplicitConversion: false,
		exposeDefaultValues: true,
	})
	const errors = validateSync(instance, { whitelist: true })
	if (errors.length) {
		const descriptions = errors.map(
			({ constraints = {}, property }) =>
				`${property}: ${Object.values(constraints).join(", ")}`,
		)
		throw new IntegrationException(
			integrationName,
			`Unexpected response shape (${descriptions.join(" | ")})`,
		)
	}
	return instance
}

export function describeError(error: unknown): string {
	if (error instanceof Error) {
		return error.message
	}
	return String(error)
}
