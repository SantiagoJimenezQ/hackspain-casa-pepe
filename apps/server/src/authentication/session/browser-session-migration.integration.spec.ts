import { randomBytes } from "node:crypto"
import { BrowserSessions1790000000000 } from "@common/database/migrations/1790000000000-browser-sessions"
import { DataSource } from "typeorm"

const databaseURL = process.env.BROWSER_SESSION_TEST_DATABASE_URL
const describeDatabase = databaseURL ? describe : describe.skip

describeDatabase("browser session schema upgrade", () => {
	it("preserves historical data, retires legacy runs and replaces the global learning index", async () => {
		const url = new URL(databaseURL ?? "")
		if (
			!["localhost", "127.0.0.1"].includes(url.hostname) ||
			!url.pathname.includes("test")
		)
			throw new Error("Disposable local database required")
		const schema = `migration_test_${randomBytes(8).toString("hex")}`
		const database = await new DataSource({
			schema,
			type: "postgres",
			url: databaseURL,
		}).initialize()
		const runner = database.createQueryRunner()
		await runner.connect()
		await runner.startTransaction()
		try {
			await runner.query(`CREATE SCHEMA ${schema}`)
			await runner.query(`SET LOCAL search_path TO ${schema}`)
			await runner.query(
				`CREATE TABLE incidents (identifier text PRIMARY KEY, active boolean NOT NULL, status text NOT NULL)`,
			)
			await runner.query(
				`INSERT INTO incidents VALUES ('historical', true, 'responding')`,
			)
			await runner.query(
				`CREATE TABLE learning_insights (identifier text PRIMARY KEY, "scenarioIdentifier" text NOT NULL, kind text NOT NULL, subject text NOT NULL)`,
			)
			await runner.query(
				`CREATE UNIQUE INDEX old_learning_subject ON learning_insights ("scenarioIdentifier", kind, subject)`,
			)
			await runner.query(
				`INSERT INTO learning_insights VALUES ('historical-learning', 'scenario', 'capacity', 'resource')`,
			)
			const migration = new BrowserSessions1790000000000()
			await migration.up(runner)
			expect(await runner.query(`SELECT * FROM incidents`)).toEqual([
				{
					active: false,
					browserSessionId: "legacy",
					identifier: "historical",
					status: "reset",
				},
			])
			expect(
				await runner.query(
					`SELECT "browserSessionId" FROM learning_insights`,
				),
			).toEqual([{ browserSessionId: "legacy" }])
			await runner.query(
				`INSERT INTO learning_insights VALUES ('a', 'scenario', 'capacity', 'resource', 'browser-a'), ('b', 'scenario', 'capacity', 'resource', 'browser-b')`,
			)
			await runner.query(
				`INSERT INTO incidents VALUES ('a', true, 'normal', 'browser-a'), ('b', true, 'normal', 'browser-b')`,
			)
			await migration.up(runner)
			await runner.query("SAVEPOINT constraint_check")
			await expect(
				runner.query(
					`INSERT INTO incidents VALUES ('duplicate', true, 'normal', 'browser-a')`,
				),
			).rejects.toMatchObject({ code: "23505" })
			await runner.query("ROLLBACK TO SAVEPOINT constraint_check")
			await expect(
				runner.query(
					`INSERT INTO learning_insights VALUES ('duplicate', 'scenario', 'capacity', 'resource', 'browser-a')`,
				),
			).rejects.toMatchObject({ code: "23505" })
		} finally {
			await runner.rollbackTransaction()
			await runner.release()
			await database.destroy()
		}
	})
})
