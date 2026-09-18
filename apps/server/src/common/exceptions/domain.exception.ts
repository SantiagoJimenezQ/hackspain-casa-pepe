import { HttpException, HttpStatus } from "@nestjs/common"

export class DomainException extends HttpException {
	constructor(
		status: HttpStatus,
		error: string,
		message: string,
		details: ReadonlyArray<string> = [],
	) {
		super({ details, error, message, statusCode: status }, status)
	}
}

export class EntityNotFoundException extends DomainException {
	constructor(entityName: string, identifier: string) {
		super(
			HttpStatus.NOT_FOUND,
			"Not Found",
			`${entityName} ${identifier} was not found`,
		)
	}
}

export class NoActiveRunException extends DomainException {
	constructor() {
		super(
			HttpStatus.CONFLICT,
			"No Active Run",
			"There is no active incident run. Start one through the demo controls first",
		)
	}
}

export class InvalidStateTransitionException extends DomainException {
	constructor(
		entityName: string,
		currentState: string,
		attemptedAction: string,
	) {
		super(
			HttpStatus.CONFLICT,
			"Invalid State Transition",
			`${entityName} is ${currentState} and cannot ${attemptedAction}`,
		)
	}
}

export class StaleRunException extends DomainException {
	constructor(runIdentifier: string) {
		super(
			HttpStatus.CONFLICT,
			"Stale Run",
			`Run ${runIdentifier} is no longer active, late results are ignored`,
		)
	}
}

export class InvalidSignatureException extends DomainException {
	constructor() {
		super(
			HttpStatus.UNAUTHORIZED,
			"Invalid Signature",
			"The webhook signature is missing or invalid",
		)
	}
}

export class IntegrationException extends DomainException {
	constructor(integrationName: string, reason: string) {
		super(
			HttpStatus.BAD_GATEWAY,
			"Integration Failure",
			`${integrationName}: ${reason}`,
		)
	}
}
