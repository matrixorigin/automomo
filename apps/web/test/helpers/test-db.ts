import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { disconnectPrismaForTests } from "../../lib/prisma"

export function withTestDatabase<T>(fn: (input: { dir: string; databaseUrl: string }) => Promise<T>) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), "automomo-db-"))
    const previousDatabaseUrl = process.env.DATABASE_URL
    const previousTursoDatabaseUrl = process.env.TURSO_DATABASE_URL
    const databaseUrl = `file:${join(dir, "test.sqlite")}`
    process.env.DATABASE_URL = databaseUrl
    process.env.TURSO_DATABASE_URL = databaseUrl

    execFileSync(
      "pnpm",
      ["--filter", "@automomo/web", "exec", "prisma", "db", "push", "--schema", "prisma/schema.prisma", "--url", databaseUrl],
      { stdio: "pipe" }
    )

    try {
      return await fn({ dir, databaseUrl })
    } finally {
      await disconnectPrismaForTests()
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = previousDatabaseUrl
      if (previousTursoDatabaseUrl === undefined) delete process.env.TURSO_DATABASE_URL
      else process.env.TURSO_DATABASE_URL = previousTursoDatabaseUrl
      rmSync(dir, { recursive: true, force: true })
    }
  }
}
