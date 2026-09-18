export function nowISO(): string {
	return new Date().toISOString()
}

export function addMilliseconds(isoDate: string, milliseconds: number): string {
	return new Date(new Date(isoDate).getTime() + milliseconds).toISOString()
}

export function isBefore(isoDate: string, referenceISODate: string): boolean {
	return new Date(isoDate).getTime() < new Date(referenceISODate).getTime()
}

export function elapsedMilliseconds(
	fromISODate: string,
	toISODate: string,
): number {
	return new Date(toISODate).getTime() - new Date(fromISODate).getTime()
}

export function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds)
	})
}
