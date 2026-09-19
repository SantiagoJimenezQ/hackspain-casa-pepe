import { ToolContext } from "@tools/types/tool.type"
import { CheckServicesStatusTool } from "./check-services-status.tool"

const context: ToolContext = {
	decisionIdentifier: "dec-1",
	incidentIdentifier: "inc_fixture",
	planIdentifier: "plan-1",
	planStepIdentifier: "step-check-v1",
	planVersion: 1,
	runIdentifier: "run_fixture",
	toolCallIdentifier: "tool-1",
}

describe("CheckServicesStatusTool", () => {
	it("reports every service with the independent status and the discrepancies", async () => {
		const report = {
			checks: [
				{
					detail: "Simulated health check: restored",
					healthy: true,
					knownStatus: "healthy",
					matches: true,
					observedStatus: "healthy",
					serviceIdentifier: "orders-database",
					serviceName: "Orders database",
				},
				{
					detail: "Health endpoint answered down",
					healthy: false,
					knownStatus: "healthy",
					matches: false,
					observedStatus: "down",
					serviceIdentifier: "route-assignment",
					serviceName: "Route assignment",
				},
			],
			discrepancies: [
				"Route assignment is recorded as healthy but the independent check reports down",
			],
			healthyCount: 1,
			mode: "simulated",
			totalCount: 2,
		}
		const recovery = {
			checkServices: jest.fn().mockResolvedValue(report),
		}
		const tool = new CheckServicesStatusTool(recovery as never)

		const result = await tool.execute({}, context)

		expect(recovery.checkServices).toHaveBeenCalledWith(
			context.runIdentifier,
			context.incidentIdentifier,
			context.toolCallIdentifier,
		)
		expect(result).toEqual({
			output: {
				checks: report.checks,
				discrepancies: report.discrepancies,
				healthyCount: 1,
				kind: "services-status",
				mode: "simulated",
				totalCount: 2,
			},
			status: "succeeded",
		})
	})
})
