#!/bin/bash
# Build script for Vercel deployment
# Automatically switches from SQLite to PostgreSQL schema when DATABASE_URL contains "neon.tech"

set -e

echo "🔨 Building for deployment..."

# Check if we're using Neon PostgreSQL
if echo "$DATABASE_URL" | grep -q "neon.tech"; then
  echo "🐘 Neon PostgreSQL detected — switching schema..."
  cp prisma/schema.neon.prisma prisma/schema.prisma
else
  echo "📦 Using default schema (SQLite/local)"
fi

# Generate Prisma client
npx prisma generate

# Push schema to database (only if Neon is configured)
if echo "$DATABASE_URL" | grep -q "neon.tech"; then
  echo "📤 Pushing schema to Neon database..."
  npx prisma db push --skip-generate || echo "⚠️ db push failed, continuing with build..."
fi

# Build Next.js
npx next build

echo "✅ Build complete!"
