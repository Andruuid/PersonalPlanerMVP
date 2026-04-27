# PersonalPlanerMVP

[![CI](https://github.com/Andruuid/PersonalPlanerMVP/actions/workflows/ci.yml/badge.svg)](https://github.com/Andruuid/PersonalPlanerMVP/actions/workflows/ci.yml)

Next.js 16 + TypeScript MVP für Personalplanung & Zeitkonten in Schweizer KMU.
Single-Tenant, Email/Passwort-Login, lokale SQLite-DB via Prisma 7 (libSQL),
Drag-and-Drop-Wochenplanung und Mitarbeitersicht.

## Tech-Stack

- Next.js 16 (App Router) + React 19 + TypeScript (strict)
- Tailwind CSS v4 + shadcn/ui (Radix)
- Auth.js v5 (Credentials Provider, JWT)
- Prisma 7 + SQLite via `@prisma/adapter-libsql`
- @dnd-kit/core, react-hook-form, zod
- Vitest, Prettier, ESLint

## Schnellstart

```powershell
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

App läuft unter <http://localhost:3000>.

## Demo-Konten

| Rolle      | E-Mail                  | Passwort  |
| ---------- | ----------------------- | --------- |
| Admin      | `admin@demo.ch`         | `admin123` |
| Mitarbeiter | `anna.keller@demo.ch`   | `demo123` |
| Mitarbeiter | `marco.huber@demo.ch`   | `demo123` |
| Mitarbeiter | `lina.meier@demo.ch`    | `demo123` |
| Mitarbeiter | `noah.schmid@demo.ch`   | `demo123` |

Admin landet nach dem Login auf `/dashboard`, Mitarbeitende auf `/my-week`.

## Skripte

| Skript            | Zweck                                                  |
| ----------------- | ------------------------------------------------------ |
| `npm run dev`     | Next.js Entwicklungsserver                             |
| `npm run build`   | Produktions-Build                                      |
| `npm run lint`    | ESLint                                                 |
| `npm run test`    | Vitest (einmal)                                        |
| `npm run db:generate` | Prisma Client neu generieren                       |
| `npm run db:migrate`  | Migration anwenden / erzeugen                      |
| `npm run db:reset`    | DB zurücksetzen + Seed                             |
| `npm run db:seed`     | Seed-Daten einspielen                              |
| `npm run db:studio`   | Prisma Studio                                      |
| `npm run db:push:libsql` | Migrationen auf eine libSQL/Turso-DB anwenden  |

## Datenmodell-Highlights

- `User` + `Employee` (1:1) — Admin oder Mitarbeitende mit Rolle, Pensum, Standort.
- `Week`, `PlanEntry`, `PublishedSnapshot` — Wochenstatus-Maschine (Entwurf → Veröffentlicht → Abgeschlossen).
- `AbsenceRequest` — Wünsche/Anträge (Ferien, Frei verlangt, TZT, Freier Tag).
- `AccountBalance` + `Booking` — Zeitsaldo, Ferien, UEZ, TZT mit auditiertem Buchungs-Log.
- `AuditLog` — vollständige Historie aller Änderungen.

## Phasen-Status

- ✅ **Phase 1 (Foundation):** Scaffold, Auth, Datenmodell, App-Shell, Platzhalter-Seiten.
- ✅ **Phase 2 (Admin-Stammdaten):** Mitarbeitende, Dienstvorlagen, Standorte/Feiertage.
- ✅ **Phase 3 (Wochenplanung):** Drag-and-Drop-Raster, KPIs, Detailfenster, Veröffentlichen.
- ✅ **Phase 4 (Mitarbeitersicht + Anträge):** Meine Woche, Antrag stellen, Genehmigungs-Loop.
- ✅ **Phase 5 (Zeitlogik + Konten):** Sollzeit, Zeitsaldo, UEZ, Ferien, manuelle Buchungen, Jahreswechsel.
- ✅ **Phase 6 (Audit + Netlify + Polish):** Audit-Log-UI, `netlify.toml`, README-Swap-Rezept, mobile QA.

## Deployment auf Netlify (Demo)

Die App läuft lokal mit SQLite und auf Netlify mit einer gehosteten DB
(Turso/libSQL ohne Code-Änderung, oder Neon/Postgres mit Provider-Wechsel).

### Variante A — Turso (libSQL, empfohlen)

Der Code nutzt bereits `@prisma/adapter-libsql`, daher braucht es keinen
Provider-Wechsel.

1. DB und Token in der [Turso-Web-UI](https://app.turso.tech) anlegen
   (Region z. B. `aws-eu-west-1`) und `DATABASE_URL` (`libsql://...`)
   sowie das ausgegebene `DATABASE_AUTH_TOKEN` notieren.
   *(Die Turso-CLI hat kein Windows-Binary, deshalb läuft der ganze
   Setup-Schritt über die Web-UI.)*
2. In Netlify (Site settings → Environment variables) setzen:
   - `DATABASE_URL` = `libsql://...`
   - `DATABASE_AUTH_TOKEN` = `<token>`
   - `AUTH_SECRET` = mit `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` erzeugen
3. Lokal ein `.env.local` anlegen (gitignored) und das Schema sowie die
   Seed-Daten einmalig in die Turso-DB schreiben:

   ```powershell
   # .env.local
   DATABASE_URL="libsql://..."
   DATABASE_AUTH_TOKEN="..."
   ```

   ```powershell
   npm run db:push:libsql   # wendet prisma/migrations/* auf Turso an
   npm run db:seed          # demo-Konten + Stammdaten
   ```

   `db:push:libsql` ist ein kleines Skript (`scripts/db-push-libsql.mts`),
   das die Migrations-SQL via `@libsql/client` ausführt und in einer
   Tracking-Tabelle (`_prisma_libsql_migrations`) festhält. Das ist
   nötig, weil Prisma 7 `prisma db push` nicht mehr direkt gegen
   `libsql://`-URLs kann.
4. Auf Netlify deployen — `netlify.toml` ruft automatisch
   `npx prisma generate && next build` auf.

### Variante B — Neon (Postgres)

1. In `prisma/schema.prisma` den Datasource-Block ändern auf:

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. `lib/db.ts` so anpassen, dass der libSQL-Adapter durch den
   Standard-`PrismaClient` ersetzt wird (kein `adapter`-Argument mehr,
   `DATABASE_AUTH_TOKEN` entfällt).
3. `npm run db:migrate` lokal gegen die Neon-DB ausführen, dann auf
   Netlify deployen.

> Hinweis: Für die Demo ist Turso die schnellere Wahl, weil der Code
> ohne Schema- oder Adapter-Änderungen funktioniert.

## CI

Der GitHub-Actions-Workflow (`.github/workflows/ci.yml`) führt bei jedem
Push/PR auf `main` Lint, TypeScript, Vitest und Next-Build aus. Die
SQLite-Test-DB wird via `vitest.global-setup.ts` einmalig pro Run
vorbereitet.
