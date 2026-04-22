import { PrismaClient } from "@/lib/generated/prisma/client"
import { PrismaLibSql } from "@prisma/adapter-libsql"

type PrismaClientInstance = InstanceType<typeof PrismaClient>

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClientInstance
  prismaUrl?: string
}

function databaseUrl() {
  return process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./prisma/dev.db"
}

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaLibSql({
      url: databaseUrl(),
      authToken: process.env.TURSO_AUTH_TOKEN,
    }),
  })
}

function getPrismaClient() {
  const url = databaseUrl()
  if (!globalForPrisma.prisma || globalForPrisma.prismaUrl !== url) {
    if (globalForPrisma.prisma) {
      void globalForPrisma.prisma.$disconnect()
    }
    globalForPrisma.prisma = createPrismaClient()
    globalForPrisma.prismaUrl = url
  }
  return globalForPrisma.prisma
}

export const prisma = new Proxy({} as PrismaClientInstance, {
  get(_target, prop) {
    const client = getPrismaClient()
    const value = client[prop as keyof PrismaClientInstance]
    return typeof value === "function" ? value.bind(client) : value
  },
})

export async function disconnectPrismaForTests() {
  if (globalForPrisma.prisma) {
    await globalForPrisma.prisma.$disconnect()
    globalForPrisma.prisma = undefined
    globalForPrisma.prismaUrl = undefined
  }
}
