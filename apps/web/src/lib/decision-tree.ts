import type { DecisionTreeNode, DecisionTreeBranch } from '../../../../packages/contracts/decision-tree';
import type { ActivityRecord } from './casa-pepe-types';
export type { DecisionTreeNode, DecisionTreeBranch } from '../../../../packages/contracts/decision-tree';

// The same allowlist is used by the history proxy and the live projection.
export const TREE_EVENTS = [
  'incident.impact-detected', 'incident.event-applied', 'resource.capacity-changed',
  'fact.recorded', 'engineer-call.incoming', 'plan.created', 'plan.revised',
  'agent.llm-decision', 'agent.llm-rejected', 'agent.llm-stale', 'agent.llm-failed',
  'tool-call.completed', 'tool-call.failed', 'approval.decided', 'approval.superseded',
  'recovery.executed', 'recovery.verified',
] as const;
const supported = new Set<string>(TREE_EVENTS);
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const list = (value: unknown) => Array.isArray(value) ? value : [];

/**
 * When it happened decides the order, and the sequence only breaks a tie. Two servers writing to
 * the same database each number their own events, so a sequence alone puts a later plan before an
 * earlier one; the recorded instant never does that.
 */
function inTimeOrder(a: ActivityRecord, b: ActivityRecord) {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1;
  if (a.sequence !== b.sequence) return a.sequence - b.sequence;
  return a.identifier < b.identifier ? -1 : 1;
}

export function mergeTreeEvents(current: readonly ActivityRecord[], incoming: readonly ActivityRecord[], run: string) {
  const events = new Map<string, ActivityRecord>();
  for (const event of [...current, ...incoming]) {
    if (event.runIdentifier !== run || !supported.has(event.type)) continue;
    events.set(event.identifier, event);
  }
  return [...events.values()].sort(inTimeOrder);
}

export function buildDecisionTree(events: readonly ActivityRecord[], run: string): DecisionTreeNode[] {
  // Final updates for a model turn replace its pending event; they are not extra decisions.
  const turns = new Map<string, ActivityRecord>();
  for (const event of mergeTreeEvents([], events, run)) {
    const key = event.type.startsWith('agent.llm-') ? string(event.payload?.outputIdentifier, event.identifier) : event.identifier;
    turns.set(key, event);
  }
  return [...turns.values()].sort(inTimeOrder).map((event): DecisionTreeNode => {
    const payload = event.payload ?? {};
    const node: DecisionTreeNode = {
      id: event.identifier, sequence: event.sequence, occurredAt: event.occurredAt,
      kind: 'signal', title: event.title, reason: event.summary, status: 'Señal registrada', tone: 'neutral',
      sourceIdentifier: event.identifier, sourceType: event.type, simulated: event.simulated,
      replayed: event.replayed, details: [], branches: [],
    };
    if (event.type.startsWith('plan.')) {
      const plan = record(payload.plan);
      const revision = event.type === 'plan.revised';
      const branches: DecisionTreeBranch[] = list(plan.priorities).map((raw, index) => {
        const p = record(raw);
        const chosen = p.decision === 'recover-now';
        return { id: `${node.id}:priority:${index}`, title: string(p.serviceName, string(p.serviceIdentifier, 'Servicio')),
          reason: string(p.reason), status: chosen ? 'Recuperar ahora' : p.decision === 'postpone' ? 'Aplazado' : string(p.decision, 'Registrado'), tone: chosen ? 'success' : 'neutral' };
      });
      return { ...node, kind: revision ? 'revision' : 'plan', tone: revision ? 'warning' : 'success',
        title: `${revision ? 'Cambio de plan' : 'Plan inicial'}${typeof plan.version === 'number' ? ` · v${plan.version}` : ''}`,
        reason: string(plan.reason, event.summary), status: revision ? 'Plan revisado' : 'Plan guardado', branches,
        details: [string(plan.summary), ...list(plan.changesFromPrevious).map(c => string(record(c).description)),
          ...list(plan.assumptions).map(a => `Supuesto: ${string(a)}`)].filter(Boolean) };
    }
    if (event.type.startsWith('agent.llm-')) {
      const disposition = string(payload.disposition, event.type === 'agent.llm-stale' ? 'stale' : event.type === 'agent.llm-failed' ? 'incomplete' : event.type === 'agent.llm-rejected' ? 'rejected' : 'pending');
      const labels: Record<string, string> = { accepted: 'Propuesta validada', rejected: 'Propuesta rechazada', stale: 'Propuesta desactualizada', incomplete: 'Respuesta incompleta', pending: 'Pendiente de validación' };
      const result = record(payload.actionResult);
      return { ...node, kind: 'decision', title: labels[disposition] ?? 'Decisión registrada', status: labels[disposition] ?? disposition,
        tone: disposition === 'accepted' ? 'neutral' : disposition === 'rejected' || disposition === 'incomplete' ? 'danger' : 'warning',
        reason: string(payload.text, event.summary) || event.summary,
        details: [string(payload.dispositionReason), string(result.reason), ...list(payload.toolCalls).map(t => `Herramienta propuesta: ${string(record(t).name)}`)].filter(Boolean) };
    }
    if (event.type.startsWith('tool-call.')) {
      const tool = record(payload.toolCall);
      const failed = event.type.endsWith('failed');
      return { ...node, kind: 'action', status: failed ? 'Acción fallida' : 'Acción completada', tone: failed ? 'danger' : 'success',
        details: [string(record(tool.error).message), string(record(tool.output).detail)].filter(Boolean) };
    }
    if (event.type.startsWith('recovery.')) return { ...node, kind: 'result', status: 'Resultado registrado', details: [string(payload.detail)].filter(Boolean) };
    if (event.type.startsWith('approval.')) {
      const approval = record(payload.approval);
      return { ...node, kind: 'decision', status: event.type.endsWith('superseded') ? 'Aprobación anulada' : 'Intervención humana',
        tone: 'warning', details: [string(approval.comment), string(approval.reason)].filter(Boolean) };
    }
    return { ...node, tone: event.type === 'incident.impact-detected' ? 'danger' : event.type === 'resource.capacity-changed' ? 'warning' : 'neutral' };
  });
}

export function elapsedLabel(at: string, start: string) {
  const difference = Date.parse(at) - Date.parse(start);
  if (!Number.isFinite(difference)) return '—';
  const seconds = Math.max(0, Math.floor(difference / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
