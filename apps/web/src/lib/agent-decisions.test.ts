import { describe, expect, it } from "vitest";
import { buildDecisions, mergeDecisionEvents } from "./agent-decisions";
import type { ActivityRecord } from "./casa-pepe-types";
const event = (sequence: number, payload: Record<string, unknown>, type = "agent.llm-output", runIdentifier = "A"): ActivityRecord => ({ identifier: `e${sequence}`, runIdentifier, sequence, payload: { outputIdentifier: "X", ...payload }, type, occurredAt: "2026-09-19T12:00:00Z", summary: "legacy", title: "Decision", source: "agent", simulated: false, replayed: false });
describe("decision history", () => {
 it("V01 orders and deduplicates fragments", () => {
  const a = event(10, { text: "Recover " }); const b = event(11, { text: "orders" });
  expect(buildDecisions([b,a,b], "A")).toMatchObject([{ text: "Recover orders", disposition: "draft" }]);
 });
 it("V02 replaces drafts and never downgrades final text", () => {
  const events = [event(10, { text: "Recover " }), event(12, { text: "Recover orders first", disposition: "pending" }, "agent.llm-decision"), event(13, { text: "Recover orders first", disposition: "accepted" }, "agent.llm-decision"), event(14, { text: "late fragment" })];
  expect(buildDecisions(events.reverse(), "A")).toMatchObject([{ text: "Recover orders first", disposition: "accepted" }]);
 });
 it.each(["rejected", "stale", "incomplete"])("V03 retains %s and its reason", (disposition) => {
  expect(buildDecisions([event(12, { text: "Proposal", disposition, dispositionReason: "Capacity changed" }, "agent.llm-decision")], "A")[0]).toMatchObject({ disposition, reason: "Capacity changed" });
 });
 it("V04 isolates runs and repeated turn numbers", () => {
  const events = [event(1, { turn: 0 }), event(2, { turn: 0, outputIdentifier: "Y" }), event(3, { turn: 0 }, "agent.llm-output", "B")];
  expect(buildDecisions(events, "A").map((d) => d.id)).toEqual(["A:X", "A:Y"]);
 });
 it("V05 does not invent explanations for tool-only output and reads legacy records", () => {
  expect(buildDecisions([event(1, { text: null, toolCalls: [{ name: "execute_step" }] }, "agent.llm-decision")], "A")[0]).toMatchObject({ text: "", toolCalls: [{ name: "execute_step" }] });
  expect(buildDecisions([event(2, { outputIdentifier: undefined }, "agent.llm-decision")], "A")[0].text).toBe("legacy");
 });
 it("V10 merges history and live records without losing terminal state", () => {
  const accepted = event(13, { text: "Final", disposition: "accepted" }, "agent.llm-decision");
  const merged = mergeDecisionEvents([accepted], [event(10, { text: "Draft" }), accepted], "A");
  expect(merged).toHaveLength(2); expect(buildDecisions(merged,"A")[0].text).toBe("Final");
 });
 it("V11 retains decisions beyond the short activity window", () => {
  const events = Array.from({ length: 150 }, (_, n) => event(n+1, { outputIdentifier: `X${n}`, text: `Decision ${n}` }, "agent.llm-decision"));
  expect(buildDecisions(mergeDecisionEvents([],events,"A"),"A")).toHaveLength(150);
 });
});
