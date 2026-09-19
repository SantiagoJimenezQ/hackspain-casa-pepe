import { EngineerCallProvider } from "./outbound-calls"

/** Standalone integration checks that do not require an incident run. */
export type ToolTestName = "send_incident_email" | "call_engineer"

export type ToolTestMode = "simulated" | "live"

export type ToolTestStatus =
	| "running"
	| "accepted"
	| "succeeded"
	| "failed"

export interface ToolTestEngineer {
	readonly name: string
	readonly phone: string
}

export interface ToolTestExecuteInput {
	readonly tool: ToolTestName
	readonly mode?: ToolTestMode
	readonly idempotencyKey: string
	readonly engineer?: ToolTestEngineer
}

export interface ToolTestError {
	readonly code: string
	readonly message: string
}

export interface ToolTestResult {
	readonly identifier: string
	readonly tool: ToolTestName
	readonly mode: ToolTestMode
	readonly status: ToolTestStatus
	readonly createdAt: string
	readonly finishedAt: string
	readonly providerReference: string
	readonly provider: EngineerCallProvider | null
	readonly providerCallSid: string
	readonly detail: string
	readonly error: ToolTestError | null
	readonly result: unknown | null
}

export interface ToolTestCatalogEntry {
	readonly tool: ToolTestName
	readonly modes: ReadonlyArray<ToolTestMode>
	readonly liveAvailable: boolean
	readonly provider: EngineerCallProvider | null
	readonly description: string
}
