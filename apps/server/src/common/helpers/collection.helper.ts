export function sumBy<Item>(
	items: ReadonlyArray<Item>,
	selector: (item: Item) => number,
): number {
	return items.reduce((total, item) => total + selector(item), 0)
}

export function uniqueValues<Value>(
	values: ReadonlyArray<Value>,
): Array<Value> {
	return Array.from(new Set(values))
}

export function indexBy<Item, Key extends string>(
	items: ReadonlyArray<Item>,
	selector: (item: Item) => Key,
): Map<Key, Item> {
	return new Map(items.map((item) => [selector(item), item]))
}

export function paginate<Item>(
	items: ReadonlyArray<Item>,
	limit: number,
	offset: number,
): ReadonlyArray<Item> {
	return items.slice(offset, offset + limit)
}

export function toRecord(value: object): Record<string, unknown> {
	return Object.fromEntries(Object.entries(value))
}
