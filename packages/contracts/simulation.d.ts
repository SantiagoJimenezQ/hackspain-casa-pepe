/** Optional concurrency guards supported by every POST endpoint. */
export interface CommandGuard { expectedRunId?: string; expectedRevision?: number }
export interface ResetCommand extends CommandGuard {
  /** Omitted mode preserves the original manual fixture. */
  mode?: 'manual' | 'randomized';
  /** Unsigned 32-bit integer. Defaults to 42. */
  seed?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  /** Secondary faults only; does not disable migration progress/failure. */
  automaticEvents?: boolean;
  /** 1–3 unhealthy regions, including the primary; manual injections bypass this cap. */
  maxConcurrentDisruptions?: number;
}
export interface SimulationState {
  mode: 'manual' | 'randomized'; seed: number; difficulty: 'easy' | 'medium' | 'hard';
  automaticEvents: boolean; maxConcurrentDisruptions: number;
  paused: boolean; elapsedMinutes: number; generatedDisruptions: number;
}
export interface AdvanceCommand extends CommandGuard { minutes?: number }
