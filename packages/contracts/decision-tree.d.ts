/** Read-only projection of existing activity records; no inferred alternatives. */
export type DecisionTreeKind = 'signal' | 'decision' | 'plan' | 'revision' | 'action' | 'result';
export type DecisionTreeTone = 'neutral' | 'success' | 'warning' | 'danger';
export interface DecisionTreeNode {
  id: string;
  sequence: number;
  occurredAt: string;
  kind: DecisionTreeKind;
  title: string;
  reason: string;
  status: string;
  tone: DecisionTreeTone;
  sourceIdentifier: string;
  sourceType: string;
  simulated: boolean;
  replayed: boolean;
  details: readonly string[];
  branches: readonly DecisionTreeBranch[];
}
export interface DecisionTreeBranch {
  id: string;
  title: string;
  reason: string;
  status: string;
  tone: DecisionTreeTone;
}
