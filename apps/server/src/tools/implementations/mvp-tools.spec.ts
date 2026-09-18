import { createImpactedIncident } from "@root/testing/incident.fixture"
import { ToolContext } from "@tools/types/tool.type"
import { SaveRecoveryPlanTool } from "./mvp-tools"
import { ExecuteRecoveryTool } from "./recovery-tools"

const context: ToolContext = {
	decisionIdentifier: "dec-1",
	incidentIdentifier: "inc_fixture",
	planIdentifier: "plan-1",
	planStepIdentifier: "step-db",
	planVersion: 1,
	runIdentifier: "run_fixture",
	toolCallIdentifier: "tool-1",
}
describe("MVP recovery boundaries", () => {
	function setup() {
		const incident = {
			...createImpactedIncident(7),
			active: true,
			identifier: context.incidentIdentifier,
			runIdentifier: context.runIdentifier,
		}
		const runs = {
			getByRunIdentifier: jest.fn().mockResolvedValue(incident),
		}
		const plan = {
			capacity: { resourceIdentifier: "backup-compute" },
			identifier: "plan-1",
			steps: [
				{
					identifier: "step-db",
					requiresApproval: true,
					serviceIdentifier: "orders-database",
					status: "proposed",
				},
			],
			version: 1,
		}
		const plans = {
			createVersion: jest.fn().mockResolvedValue({ ...plan, version: 2 }),
			findActivePlan: jest.fn().mockResolvedValue(plan),
			findLatestPlan: jest.fn().mockResolvedValue(plan),
		}
		const approvals = {
			getByIdentifier: jest.fn().mockResolvedValue({
				capacityUnits: 4,
				planStepIdentifier: "step-db",
				planVersion: 1,
				runIdentifier: context.runIdentifier,
				serviceIdentifier: "orders-database",
			}),
			isApproved: jest.fn().mockResolvedValue(true),
			supersedePending: jest.fn(),
		}
		const recovery = {
			execute: jest.fn().mockResolvedValue({
				action: { identifier: "rec-1" },
				kind: "in-progress",
			}),
		}
		const input = {
			actionDescription: "Restore",
			actionKind: "failover-database" as const,
			approvalIdentifier: "",
			capacityUnits: 4,
			resourceIdentifier: "backup-compute",
			serviceIdentifier: "orders-database",
		}
		return { approvals, incident, input, plans, recovery, runs }
	}
	it("rejects missing approval even if the caller omits the approval identifier", async () => {
		const s = setup()
		const tool = new ExecuteRecoveryTool(
			s.recovery as never,
			s.approvals as never,
			s.runs as never,
			s.plans as never,
			{ list: async () => [] } as never,
		)
		expect(await tool.execute(s.input, context)).toMatchObject({
			error: { code: "APPROVAL_REQUIRED" },
			status: "failed",
		})
		expect(s.recovery.execute).not.toHaveBeenCalled()
	})
	it("rejects an approval for another action", async () => {
		const s = setup()
		s.approvals.getByIdentifier.mockResolvedValue({
			serviceIdentifier: "route-assignment",
		})
		const tool = new ExecuteRecoveryTool(
			s.recovery as never,
			s.approvals as never,
			s.runs as never,
			s.plans as never,
			{ list: async () => [] } as never,
		)
		expect(
			await tool.execute(
				{ ...s.input, approvalIdentifier: "apr" },
				context,
			),
		).toMatchObject({
			error: { code: "APPROVAL_INVALID" },
			status: "failed",
		})
		expect(s.recovery.execute).not.toHaveBeenCalled()
	})
	it("rejects stale plans and underreported capacity", async () => {
		const s = setup()
		const tool = new ExecuteRecoveryTool(
			s.recovery as never,
			s.approvals as never,
			s.runs as never,
			s.plans as never,
			{ list: async () => [] } as never,
		)
		expect(
			await tool.execute({ ...s.input, capacityUnits: 0 }, context),
		).toMatchObject({ status: "failed" })
		expect(
			await tool.execute(s.input, { ...context, planVersion: 2 }),
		).toMatchObject({ status: "failed" })
		expect(s.recovery.execute).not.toHaveBeenCalled()
	})
	it("executes a matching approved recovery", async () => {
		const s = setup()
		const tool = new ExecuteRecoveryTool(
			s.recovery as never,
			s.approvals as never,
			s.runs as never,
			s.plans as never,
			{ list: async () => [] } as never,
		)
		expect(
			await tool.execute(
				{ ...s.input, approvalIdentifier: "apr" },
				context,
			),
		).toMatchObject({ status: "in-progress" })
		expect(s.recovery.execute).toHaveBeenCalledTimes(1)
	})
	it("supersedes approvals when saving a revision, but rejects a stale previous plan", async () => {
		const s = setup()
		const tool = new SaveRecoveryPlanTool(
			s.runs as never,
			s.plans as never,
			s.approvals as never,
		)
		const input = {
			expectedPreviousIdentifier: "plan-0",
			incidentIdentifier: context.incidentIdentifier,
			runIdentifier: context.runIdentifier,
			triggeredBy: "Capacity reduced",
		} as never
		expect(await tool.execute(input, context)).toMatchObject({
			status: "failed",
		})
		expect(s.approvals.supersedePending).not.toHaveBeenCalled()
		expect(
			await tool.execute(
				{
					...(input as object),
					expectedPreviousIdentifier: "plan-1",
				} as never,
				context,
			),
		).toMatchObject({
			output: { kind: "recovery-plan" },
			status: "succeeded",
		})
		expect(s.approvals.supersedePending).toHaveBeenCalledTimes(1)
	})
})
