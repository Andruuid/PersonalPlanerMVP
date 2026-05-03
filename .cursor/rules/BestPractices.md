⚛️ React & TypeScript
Component definition

Avoid React.FC. Define components as regular functions with explicit prop types — it avoids the implicit children prop and gives clearer error messages.
When children are needed, type them explicitly as React.ReactNode.
For component prop definitions, both type and interface are defensible. Pick one and apply it consistently across the codebase. (interface gives slightly nicer error messages on extension; type composes better with unions and utility types — Version A's slight edge for component props.)

Type safety

Type everything: props, state, event handlers, return values. Never use any — reach for unknown and narrow.
Keep types DRY with utility types: Pick, Omit, Partial, Required, ReturnType.
Use as const and readonly for immutable data and literal types.
Enable strict compiler options in tsconfig.json: strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true. These catch real edge cases with array access and optional props.

State modeling

Model UI states with discriminated unions rather than boolean flags. A single state: { status: "loading" } | { status: "success", data: T } | { status: "error", error: Error } is far safer than juggling isLoading, isError, data, error independently.

Server vs. Client boundary

"Push client to the leaves." Components are Server Components by default. Add "use client" only at the smallest interactive subtree that actually needs it — typically a single form or button — to keep the client bundle small.


🚀 Next.js 15 (App Router)
Configuration & routing

Use next.config.ts for fully typed configuration.
Enable experimental.typedRoutes for compile-time checking of all Link hrefs.

Folder structure

Put application source in src/.
Organize by feature, with shared components/, hooks/, and lib/ directories for cross-cutting code.

Data fetching & mutations

Prefer Server Components for data fetching — simpler, no client JS cost, and naturally streamable.
Use Server Actions instead of bespoke API routes for mutations (forms, button clicks). You get end-to-end type safety and built-in revalidatePath / revalidateTag integration for cache invalidation.
Fetch in parallel with Promise.all() in Server Components to avoid request waterfalls.
Wrap slow data components in <Suspense> with a skeleton fallback so the rest of the page stays interactive.

Client interactivity

Use React 19 hooks like useFormStatus and useActionState for form/action UI state.
For complex client-only state, reach for Zustand (or Jotai) — keep state minimal and scoped.

Middleware

Use Next.js Middleware for auth guards and redirects, but keep it lightweight. No DB calls in middleware — it runs on every matching request and on the Edge runtime.

Validation

Validate all external input (form data, Server Action inputs, API request bodies, URL params) with Zod before it touches Prisma or business logic. This bridges runtime data and your TypeScript types.


🗄️ Prisma + Database (Turso & Supabase)
Client instantiation

Use a global singleton for PrismaClient in a db.ts (or lib/prisma.ts) file. Prevents connection-limit exhaustion during dev hot-reloads.

Driver adapters

Turso: use @prisma/adapter-libsql — communicates over HTTP/WebSockets, which is what makes it Edge-compatible.
Supabase: connects via a standard PostgreSQL connection string; no special adapter needed.

Schema changes & migrations

Turso: use prisma migrate diff to generate migration SQL (HTTP-only connections don't support prisma migrate dev's shadow database workflow).
Supabase: standard prisma migrate dev (local) and prisma migrate deploy (production) work normally.
Never use db push in production. Always prisma migrate deploy.
For zero-downtime schema changes, do them in stages: add the new column as nullable → backfill data → make it required in a follow-up migration. Same pattern applies to renames and type changes.

Authorization & security (Supabase)

Enable Row Level Security (RLS) on Supabase tables as a defense-in-depth layer — it protects you even if a connection string leaks.
But don't rely on RLS alone when using Prisma. Prisma connects with the service role and bypasses RLS. You must also enforce authorization in your backend code: validate the user's JWT, then scope every Prisma query by the authenticated user (where: { userId: session.user.id, ... }).