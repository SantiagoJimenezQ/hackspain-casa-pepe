import {
	MigrationInterface,
	QueryRunner,
	TableColumn,
	TableIndex,
} from "typeorm"

/** Upgrade existing installations before TypeORM's prototype synchronize step.
 * Historical rows remain legacy; no visitor can claim them using a browser token.
 */
export class BrowserSessions1790000000000 implements MigrationInterface {
	async up(queryRunner: QueryRunner): Promise<void> {
		for (const name of ["incidents", "learning_insights"]) {
			if (!(await queryRunner.hasTable(name))) continue
			if (!(await queryRunner.hasColumn(name, "browserSessionId"))) {
				await queryRunner.addColumn(
					name,
					new TableColumn({
						default: "'legacy'",
						name: "browserSessionId",
						type: "text",
					}),
				)
			}
		}
		if (await queryRunner.hasTable("incidents")) {
			await queryRunner.query(
				`UPDATE incidents SET active = false, status = 'reset' WHERE "browserSessionId" = 'legacy' AND active = true`,
			)
			const table = await queryRunner.getTable("incidents")
			if (
				!table?.indices.some(
					(index) => index.name === "incidents_one_active_browser",
				)
			)
				await queryRunner.createIndex(
					"incidents",
					new TableIndex({
						columnNames: ["browserSessionId"],
						isUnique: true,
						name: "incidents_one_active_browser",
						where: `"active" = true AND "browserSessionId" <> 'legacy'`,
					}),
				)
		}
		const learning = await queryRunner.getTable("learning_insights")
		for (const index of learning?.indices ?? []) {
			if (
				index.isUnique &&
				index.columnNames.length === 3 &&
				["scenarioIdentifier", "kind", "subject"].every((name) =>
					index.columnNames.includes(name),
				)
			)
				await queryRunner.dropIndex("learning_insights", index)
		}
		if (
			learning &&
			!learning.indices.some(
				(index) => index.name === "learning_browser_subject",
			)
		)
			await queryRunner.createIndex(
				"learning_insights",
				new TableIndex({
					columnNames: [
						"browserSessionId",
						"scenarioIdentifier",
						"kind",
						"subject",
					],
					isUnique: true,
					name: "learning_browser_subject",
				}),
			)
	}
	async down(): Promise<void> {
		throw new Error(
			"Browser ownership must not be removed automatically. Restore a pre-migration backup to roll back.",
		)
	}
}
