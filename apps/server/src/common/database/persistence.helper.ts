import { FindOptionsWhere, Repository } from "typeorm"
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity"

interface Identified {
	readonly identifier: string
}

export async function insertEntity<Entity extends Identified>(
	repository: Repository<Entity>,
	entity: Entity,
): Promise<Entity> {
	await repository.insert(entity as unknown as QueryDeepPartialEntity<Entity>)
	return entity
}

export async function updateEntity<Entity extends Identified>(
	repository: Repository<Entity>,
	entity: Entity,
): Promise<Entity> {
	const { identifier, ...changes } = entity
	await repository.update(
		{ identifier } as FindOptionsWhere<Entity>,
		changes as unknown as QueryDeepPartialEntity<Entity>,
	)
	return entity
}
