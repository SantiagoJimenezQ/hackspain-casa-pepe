/**
 * Vercel's src/main.js entrypoint loads this wrapper. The Nest CLI output
 * preserves decorator metadata and resolves TypeScript path aliases, so the
 * deployed process must start dist/bootstrap.js rather than transpile sources.
 */
const fs = require("node:fs")
const path = require("node:path")
const { Module } = require("node:module")

// Nest Terminus loads TypeORM dynamically. Vercel's pnpm-traced function can
// include the package files under .pnpm without preserving the workspace
// symlink that Node's peer-dependency lookup expects. Add those package roots
// to NODE_PATH before Nest starts so the deployed function can resolve them.
function exposePnpmPackage(packageName) {
  const pnpmDirectory = path.resolve(__dirname, "../../node_modules/.pnpm")
  if (!fs.existsSync(pnpmDirectory)) return

  const packagePrefix = packageName.replaceAll("/", "+")
  const packageEntry = fs
    .readdirSync(pnpmDirectory)
    .find((entry) => entry.startsWith(`${packagePrefix}@`))
  if (!packageEntry) return

  const packageNodeModules = path.join(
    pnpmDirectory,
    packageEntry,
    "node_modules",
  )
  process.env.NODE_PATH = [packageNodeModules, process.env.NODE_PATH]
    .filter(Boolean)
    .join(path.delimiter)
  Module._initPaths()
}

const { dependencies = {} } = require("./package.json")
for (const packageName of Object.keys(dependencies)) {
  exposePnpmPackage(packageName)
}

// TypeORM is loaded dynamically by Nest Terminus, so keep it as an explicit
// entrypoint dependency for Vercel's file tracer as well.
require("typeorm")
require("./dist/bootstrap.js")
