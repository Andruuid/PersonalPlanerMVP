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
| `npm run db:copy:turso`  | Optional: Daten zwischen zwei Turso-DBs kopieren (sonst neu + Seed) |
| `npm run db:purge:archived` | Löscht archivierte Datensätze nach Ablauf der 10-Jahres-Frist (`-- --dry-run` für Vorschau) |

## Datenmodell-Highlights

- `User` + `Employee` (1:1) — Admin oder Mitarbeitende mit Rolle, Pensum, Standort.
- `Week`, `PlanEntry`, `PublishedSnapshot` — Wochenstatus-Maschine (Entwurf → Veröffentlicht → Abgeschlossen).
- `AbsenceRequest` — Wünsche/Anträge (Ferien, Frei verlangt, TZT, Freier Tag).
- `AccountBalance` + `Booking` — Zeitsaldo, Ferien, UEZ, TZT mit auditiertem Buchungs-Log.
- `AuditLog` — vollständige Historie aller Änderungen.

## Funktionsumfang

- **Auth & App-Shell:** Email/Passwort-Login (Auth.js), rollenbasiertes Routing (Admin/Mitarbeitende), responsive App-Shell.
- **Admin-Stammdaten:** Mitarbeitende mit Pensum/Standort, Dienstvorlagen, Standorte und Feiertagskalender.
- **Wochenplanung:** Drag-and-Drop-Raster mit KPIs, Detailfenster, Status-Maschine (Entwurf → Veröffentlicht → Abgeschlossen).
- **Mitarbeitersicht + Anträge:** „Meine Woche", Antragsstellung (Ferien, Frei, TZT, Freier Tag), Genehmigungs-Loop.
- **Zeitlogik + Konten:** Sollzeit, Zeitsaldo, UEZ, Ferien und TZT mit AUTO_WEEKLY-Buchungen, manuellen Buchungen und Jahreswechsel-Carryover.
- **Audit-Log:** Vollständige Historie aller Änderungen mit Filter, Pagination und Vorher/Nachher-Diff.
- **Dashboard:** Kennzahlen (offene Anträge, aktuelle Woche, aktive Mitarbeitende, Audit-Aktivität) und letzte Audit-Einträge auf einen Blick.

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

   **Region wechseln / neue leere DB (ohne alte Daten):** In der Turso-Web-UI
   eine neue Datenbank in der gewünschten Region anlegen, in `.env.local`
   `DATABASE_URL` und `DATABASE_AUTH_TOKEN` darauf setzen, dann wie oben
   `npm run db:push:libsql` und `npm run db:seed` — fertig. Netlify-Variablen
   auf dieselbe URL/Token umstellen und deployen; die alte DB in Turso kannst
   du löschen, wenn du sie nicht mehr brauchst. *(Nur wenn du wirklich Daten
   von einer bestehenden Turso-DB übernehmen willst: `npm run db:copy:turso`,
   siehe `scripts/turso-copy-data.mts`.)*
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
