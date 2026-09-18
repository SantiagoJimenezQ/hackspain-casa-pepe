import { renderStatusPage } from "./status-page"

it("escapes untrusted service names before rendering the public page", () => {
	const html = renderStatusPage({
		services: [{ name: '<script>alert("demo")</script>', status: "down" }],
		simulated: true,
		updatedAt: "2026-09-18T10:00:00Z",
	})
	expect(html).not.toContain("<script>")
	expect(html).toContain("&lt;script&gt;")
	expect(html).toContain("Simulated recovery results")
})
