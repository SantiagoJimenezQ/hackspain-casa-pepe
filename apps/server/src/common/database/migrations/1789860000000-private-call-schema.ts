import { MigrationInterface, QueryRunner } from "typeorm"

/** Runs before entity synchronization; PostgreSQL does not create schemas implicitly. */
export class PrivateCallSchema1789860000000 implements MigrationInterface {
	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			'CREATE SCHEMA IF NOT EXISTS "casa_pepe_private"',
		)
		await queryRunner.query(
			'REVOKE ALL ON SCHEMA "casa_pepe_private" FROM PUBLIC',
		)
	}
	async down(): Promise<void> {
		// Preserve call evidence on rollback. Removing the schema requires an explicit archive.
	}
}
