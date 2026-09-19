/** In-process durations use a monotonic clock, never wall-clock differences. */
export class DecisionTimer {
	readonly startedAt: string
	private readonly start: number
	private modelEnd?: number
	constructor(
		private readonly clock: () => number = () => performance.now(),
		wall: () => string = () => new Date().toISOString(),
	) {
		this.start = clock()
		this.startedAt = wall()
	}
	modelFinished() {
		this.modelEnd = this.clock()
	}
	finish() {
		const end = this.clock()
		return {
			elapsedMilliseconds: Math.max(0, end - this.start),
			modelMilliseconds: Math.max(0, (this.modelEnd ?? end) - this.start),
			startedAt: this.startedAt,
		}
	}
}

export function waitingMilliseconds(
	intervals: readonly (readonly [number, number])[],
	start: number,
	end: number,
): number {
	const sorted = intervals
		.map(([a, b]) => [Math.max(start, a), Math.min(end, b)])
		.filter(([a, b]) => b > a)
		.sort((a, b) => a[0] - b[0])
	let total = 0,
		covered = start
	for (const [a, b] of sorted) {
		total += Math.max(0, b - Math.max(covered, a))
		covered = Math.max(covered, b)
	}
	return total
}
