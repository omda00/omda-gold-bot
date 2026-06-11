import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL || "";

  // Check if we're using Neon PostgreSQL (production/Vercel)
  const isNeon =
    connectionString.includes("neon.tech") ||
    connectionString.includes("neondb");

  if (isNeon) {
    // Use Neon serverless driver for optimal performance on Vercel
    // Dynamic imports to avoid bundling issues when not using Neon
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PrismaNeon } = require("@prisma/adapter-neon");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { neon } = require("@neondatabase/serverless");
      const sql = neon(connectionString);
      const adapter = new PrismaNeon(sql);
      return new PrismaClient({
        adapter,
        log: process.env.PRISMA_LOG === "true" ? ["query"] : [],
      });
    } catch (error) {
      console.warn(
        "[db] Failed to initialize Neon adapter, falling back to standard PrismaClient:",
        error
      );
    }
  }

  // Standard PrismaClient for SQLite (local dev) or other PostgreSQL
  return new PrismaClient({
    log: process.env.PRISMA_LOG === "true" ? ["query"] : [],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
