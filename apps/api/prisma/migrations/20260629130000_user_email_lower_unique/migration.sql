-- Case-insensitive uniqueness on User.email, enforced at the database level.
-- Prisma's schema language can't express a functional (LOWER(email)) index, so this
-- is a manual migration. `prisma migrate deploy` applies it; do not run `migrate dev`
-- against prod (it would flag this as drift since the schema doesn't model it).
CREATE UNIQUE INDEX "user_email_lower_unique" ON "User" (LOWER(email));
