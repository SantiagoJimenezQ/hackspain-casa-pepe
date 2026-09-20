import { MigrationInterface, QueryRunner } from "typeorm"

/** The sequence is global, persistent and never cycles: reset/replay cannot reuse a code. */
export class IncidentCallCode1789889000000 implements MigrationInterface {
	async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE SEQUENCE IF NOT EXISTS casa_pepe_private.incident_call_code_seq MINVALUE 100000 MAXVALUE 999999 START WITH 100001 NO CYCLE`,
		)
	}
	async down(): Promise<void> {
		// Retain issued numbers when rolling back application code.
	}
}
