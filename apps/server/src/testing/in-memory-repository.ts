import { FindOperator } from "typeorm"

interface FindOptions<Entity> {
	readonly where?: Partial<Record<keyof Entity, unknown>>
	readonly order?: Partial<Record<keyof Entity, "ASC" | "DESC">>
	readonly take?: number
	readonly skip?: number
}

function matches<Entity>(
	entity: Entity,
	where: Partial<Record<keyof Entity, unknown>>,
): boolean {
	return (Object.keys(where) as Array<keyof Entity>).every((key) => {
		const expected = where[key]
		const actual = entity[key]
		if (expected instanceof FindOperator) {
			const operand = expected.value
			switch (expected.type) {
				case "moreThan":
					return (actual as number) > (operand as number)
				case "lessThanOrEqual":
					return (actual as string) <= (operand as string)
				case "in":
					return (operand as ReadonlyArray<unknown>).includes(actual)
				default:
					throw new Error(`Unsupported operator ${expected.type}`)
			}
		}
		return actual === expected
	})
}

function compare(left: unknown, right: unknown): number {
	if (left === right) {
		return 0
	}
	return (left as number | string) > (right as number | string) ? 1 : -1
}

export class InMemoryRepository<Entity extends { identifier: string }> {
	private readonly rows = new Map<string, Entity>()

	create(partial: Partial<Entity>): Entity {
		return { ...partial } as Entity
	}

	async save(entity: Entity): Promise<Entity> {
		const stored = { ...entity }
		this.rows.set(entity.identifier, stored)
		return { ...stored }
	}

	async find(options: FindOptions<Entity> = {}): Promise<Entity[]> {
		const {
			order = {},
			skip = 0,
			take = Number.MAX_SAFE_INTEGER,
			where = {},
		} = options
		const filtered = Array.from(this.rows.values()).filter((entity) =>
			matches(entity, where),
		)
		const orderEntries = Object.entries(order) as Array<
			[keyof Entity, "ASC" | "DESC"]
		>
		if (orderEntries.length) {
			const [key, direction] = orderEntries[0]
			filtered.sort((left, right) =>
				direction === "ASC"
					? compare(left[key], right[key])
					: compare(right[key], left[key]),
			)
		}
		return filtered
			.slice(skip, skip + take)
			.map((entity) => ({ ...entity }))
	}

	async findOne(options: FindOptions<Entity>): Promise<Entity | null> {
		const [first] = await this.find({ ...options, take: 1 })
		if (!first) {
			return null
		}
		return first
	}

	async findAndCount(
		options: FindOptions<Entity> = {},
	): Promise<[Entity[], number]> {
		const { where = {} } = options
		const total = Array.from(this.rows.values()).filter((entity) =>
			matches(entity, where),
		).length
		return [await this.find(options), total]
	}

	async remove(entities: ReadonlyArray<Entity>): Promise<Entity[]> {
		for (const entity of entities) {
			this.rows.delete(entity.identifier)
		}
		return [...entities]
	}

	clear(): void {
		this.rows.clear()
	}
}
