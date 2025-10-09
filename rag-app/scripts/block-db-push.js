#!/usr/bin/env node

/**
 * Block direct prisma db push to enforce migration workflow
 *
 * Usage: This script is called via package.json when someone tries to run db:push
 */

console.error(`
❌ BLOCKED: Direct 'prisma db push' is not allowed!

📋 Why?
- No migration history
- No rollback capability
- No review process
- Destructive changes without tracking

✅ Use migrations instead:

Development:
  npx prisma migrate dev --name descriptive_name

Production (via Vercel):
  Migrations auto-deploy on git push

Emergency (local testing only):
  npx prisma db push (will be blocked by this script)

To bypass (NOT RECOMMENDED):
  npx prisma db push --skip-generate

Read more: https://www.prisma.io/docs/concepts/components/prisma-migrate
`);

process.exit(1);
