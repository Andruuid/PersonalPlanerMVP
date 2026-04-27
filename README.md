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

1. Turso-DB anlegen (`turso db create personalplaner-mvp`) und
   `DATABASE_URL` (`libsql://...`) sowie `DATABASE_AUTH_TOKEN`
   (`turso db tokens create personalplaner-mvp`) notieren.
2. In Netlify (Site settings → Environment variables) setzen:
   - `DATABASE_URL` = `libsql://...`
   - `DATABASE_AUTH_TOKEN` = `<token>`
   - `AUTH_SECRET` = `openssl rand -base64 32`
3. Schema einmalig pushen (lokal mit gesetzten Env-Variablen):

   ```powershell
   $env:DATABASE_URL="libsql://..."
   $env:DATABASE_AUTH_TOKEN="..."
   npx prisma db push
   npm run db:seed
   ```
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
