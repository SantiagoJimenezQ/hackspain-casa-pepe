import { describe, expect, it } from 'vitest';
import { buildDecisionTree, elapsedLabel, mergeTreeEvents } from './decision-tree';
import type { ActivityRecord } from './casa-pepe-types';
const event = (sequence: number, type: string, payload: Record<string, unknown> = {}, runIdentifier = 'run-a'): ActivityRecord => ({ identifier: `event-${sequence}`, runIdentifier, sequence, type, occurredAt: '2026-09-19T10:00:12Z', source: 'agent', title: type, summary: 'Recorded explanation', simulated: false, replayed: false, payload });
describe('decision tree evidence', () => {
  it('deduplicates the history/live overlap and excludes other runs and token fragments', () => {
    const signal = event(1, 'incident.impact-detected');
    expect(mergeTreeEvents([signal], [signal, event(2, 'agent.llm-output'), event(3, 'plan.created', {}, 'other')], 'run-a')).toEqual([signal]);
  });
  it('keeps only the final disposition of each model turn and never calls acceptance execution', () => {
    const nodes = buildDecisionTree([event(1, 'agent.llm-decision', { outputIdentifier: 'a', disposition: 'pending' }), event(2, 'agent.llm-decision', { outputIdentifier: 'a', disposition: 'accepted', text: null })], 'run-a');
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ status: 'Propuesta validada', tone: 'neutral', reason: 'Recorded explanation' });
  });
  it('shows recorded plan revisions and postponements without inventing alternatives', () => {
    const [node] = buildDecisionTree([event(8, 'plan.revised', { plan: { version: 2, reason: 'Capacity fell', changesFromPrevious: [{ description: 'Defer analytics' }], priorities: [{ serviceName: 'Health', decision: 'recover-now', reason: 'Critical care' }, { serviceName: 'Analytics', decision: 'postpone', reason: 'No capacity' }] } })], 'run-a');
    expect(node).toMatchObject({ kind: 'revision', reason: 'Capacity fell', details: ['Defer analytics'] });
    expect(node.branches.map(b => b.status)).toEqual(['Recuperar ahora', 'Aplazado']);
    expect(node.branches[1].reason).toBe('No capacity');
  });
  it('keeps recovery outcomes neutral rather than claiming every recovery succeeded', () => {
    expect(buildDecisionTree([event(1, 'recovery.executed', { detail: 'Failed' })], 'run-a')[0].tone).toBe('neutral');
  });
  it('handles incomplete payloads and invalid times', () => {
    expect(buildDecisionTree([event(1, 'plan.created', { plan: null })], 'run-a')[0].branches).toEqual([]);
    expect(elapsedLabel('invalid', '')).toBe('—');
    expect(elapsedLabel('2026-09-19T10:01:12Z', '2026-09-19T10:00:00Z')).toBe('01:12');
  });
});
