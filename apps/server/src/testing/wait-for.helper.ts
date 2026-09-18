import { sleep } from "@common/helpers/clock.helper"

export async function waitFor<Value>(
	probe: () => Promise<Value | null>,
	description: string,
	timeoutMilliseconds = 10000,
): Promise<Value> {
	const startedAt = Date.now()
	while (Date.now() - startedAt < timeoutMilliseconds) {
		const value = await probe()
		if (value) {
			return value
		}
		await sleep(25)
	}
	throw new Error(`Timed out waiting for ${description}`)
}
