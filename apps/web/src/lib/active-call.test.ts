import { describe, expect, it } from "vitest";
import {
  ACTIVE_CALL_TERMINAL_WINDOW_MS,
  activeCallView,
  callElapsed,
  callInitials,
  callPhase,
  visibleActiveCall,
  type ActiveCallView,
} from "@/lib/active-call";
import type { ActivityRecord, EngineerCall, Overview, ToolCall } from "@/lib/casa-pepe-types";

const NOW = Date.parse("2026-09-19T10:00:20.000Z");

function call(partial: Partial<EngineerCall> & Pick<EngineerCall, "identifier" | "status">): EngineerCall {
  return {
    engineer: { name: "Marta Ruiz", role: "Ingeniera de plataforma" },
    purpose: "Confirmar el failover",
    mode: "simulated",
    result: null,
    failureReason: "",
    startedAt: "2026-09-19T10:00:00.000Z",
    finishedAt: "",
    ...partial,
  };
}

function activity(
  type: string,
  payload: Record<string, unknown>,
  sequence = 1,
): ActivityRecord {
  return {
    identifier: `act_${sequence}`,
    sequence,
    occurredAt: "2026-09-19T10:00:00.000Z",
    type,
    source: "tool",
    title: type,
    summary: "",
    simulated: true,
    replayed: false,
    payload,
  };
}

function tool(partial: Partial<ToolCall> & Pick<ToolCall, "identifier" | "name" | "status">): ToolCall {
  return {
    interaction: "test-environment",
    simulated: true,
    error: null,
    startedAt: "2026-09-19T10:00:00.000Z",
    finishedAt: "",
    input: { engineerName: "Marta Ruiz", engineerRole: "Ingeniera de plataforma" },
    output: null,
    ...partial,
  };
}

function overviewWith(partial: Partial<Pick<Overview, "engineerCalls" | "toolCalls">>): Pick<
  Overview,
  "engineerCalls" | "toolCalls"
> {
  return {
    engineerCalls: [],
    toolCalls: [],
    ...partial,
  };
}

describe("active call view", () => {
  it("maps statuses onto banner phases", () => {
    expect(callPhase("dialing")).toBe("calling");
    expect(callPhase("in-progress")).toBe("calling");
    expect(callPhase("completed")).toBe("ended");
    expect(callPhase("failed")).toBe("failed");
    expect(callPhase("no-answer")).toBe("no-answer");
    expect(callPhase("incoming")).toBeNull();
  });

  it("builds initials from the engineer name", () => {
    expect(callInitials("Marta Ruiz")).toBe("MR");
    expect(callInitials("Guillermo")).toBe("GU");
    expect(callInitials("Lucía Responsable")).toBe("LR");
    expect(callInitials("  ")).toBe("?");
  });

  it("prefers a live overview call and ticks elapsed from startedAt", () => {
    const view = activeCallView(
      overviewWith({
        engineerCalls: [call({ identifier: "call_1", status: "in-progress" })],
      }),
      [],
      NOW,
    );
    expect(view).toMatchObject({
      identifier: "call_1",
      name: "Marta Ruiz",
      phase: "calling",
      live: true,
    });
    expect(callElapsed(view as ActiveCallView, NOW)).toBe("00:20");
  });

  it("shows an SSE-started call before overview has it", () => {
    const view = activeCallView(
      overviewWith({}),
      [
        activity("engineer-call.started", {
          call: call({ identifier: "call_sse", status: "dialing" }),
        }),
      ],
      NOW,
    );
    expect(view?.identifier).toBe("call_sse");
    expect(view?.phase).toBe("calling");
  });

  it("lets a later completed event win over an in-progress overview row", () => {
    const view = activeCallView(
      overviewWith({
        engineerCalls: [call({ identifier: "call_1", status: "in-progress" })],
      }),
      [
        activity("engineer-call.completed", {
          call: call({
            identifier: "call_1",
            status: "completed",
            finishedAt: "2026-09-19T10:00:18.000Z",
          }),
        }),
      ],
      NOW,
    );
    expect(view?.phase).toBe("ended");
    expect(view?.live).toBe(false);
    expect(callElapsed(view as ActiveCallView, NOW)).toBe("00:18");
  });

  it("picks the latest live call when several are open", () => {
    const view = activeCallView(
      overviewWith({
        engineerCalls: [
          call({ identifier: "older", status: "dialing", startedAt: "2026-09-19T09:59:00.000Z" }),
          call({
            identifier: "newer",
            status: "in-progress",
            startedAt: "2026-09-19T10:00:10.000Z",
            engineer: { name: "Guillermo", role: "On-call" },
          }),
        ],
      }),
      [],
      NOW,
    );
    expect(view?.identifier).toBe("newer");
    expect(view?.name).toBe("Guillermo");
  });

  it("ignores inbound capacity-report events", () => {
    const view = activeCallView(
      overviewWith({}),
      [
        activity("engineer-call.incoming", {
          call: {
            identifier: "in_1",
            callerName: "Marta Ruiz",
            status: "pending",
          },
        }),
      ],
      NOW,
    );
    expect(view).toBeNull();
  });

  it("falls back to a running call_engineer tool name", () => {
    const view = activeCallView(
      overviewWith({
        toolCalls: [
          tool({
            identifier: "t_call",
            name: "call_engineer",
            status: "running",
            input: { engineerName: "Guillermo", engineerRole: "On-call" },
          }),
        ],
      }),
      [],
      NOW,
    );
    expect(view).toMatchObject({
      identifier: "t_call",
      name: "Guillermo",
      role: "On-call",
      phase: "calling",
      live: true,
    });
  });

  it("falls back to a running contact_engineer tool", () => {
    const view = activeCallView(
      overviewWith({
        toolCalls: [
          tool({
            identifier: "t_contact",
            name: "contact_engineer",
            status: "pending",
            input: { engineerName: "Marta Ruiz" },
          }),
        ],
      }),
      [],
      NOW,
    );
    expect(view?.identifier).toBe("t_contact");
    expect(view?.name).toBe("Marta Ruiz");
  });

  it("does not resurrect an old completed overview call", () => {
    const view = activeCallView(
      overviewWith({
        engineerCalls: [
          call({
            identifier: "call_old",
            status: "completed",
            finishedAt: "2026-09-19T09:50:00.000Z",
          }),
        ],
      }),
      [],
      NOW,
    );
    expect(view).toBeNull();
  });

  it("keeps a just-finished call visible inside the terminal window", () => {
    const finishedAt = new Date(NOW - ACTIVE_CALL_TERMINAL_WINDOW_MS + 500).toISOString();
    const view = activeCallView(
      overviewWith({
        engineerCalls: [
          call({ identifier: "call_done", status: "failed", finishedAt, failureReason: "timeout" }),
        ],
      }),
      [
        activity("engineer-call.failed", {
          call: call({ identifier: "call_done", status: "failed", finishedAt }),
        }),
      ],
      NOW,
    );
    expect(view?.phase).toBe("failed");
    expect(visibleActiveCall(view, new Set())).toBe(view);
    expect(visibleActiveCall(view, new Set(["call_done"]))).toBeNull();
  });

  it("maps no-answer onto its own phase", () => {
    const view = activeCallView(
      overviewWith({}),
      [
        activity("engineer-call.failed", {
          call: call({
            identifier: "call_na",
            status: "no-answer",
            finishedAt: "2026-09-19T10:00:16.000Z",
          }),
        }),
      ],
      NOW,
    );
    expect(view?.phase).toBe("no-answer");
  });
});
