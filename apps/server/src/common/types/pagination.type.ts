export interface PageQuery {
	readonly limit: number
	readonly offset: number
}

export interface Page<Item> {
	readonly items: ReadonlyArray<Item>
	readonly total: number
	readonly limit: number
	readonly offset: number
}
