# PersonalPlanerMVP

[![CI](https://github.com/Andruuid/PersonalPlanerMVP/actions/workflows/ci.yml/badge.svg)](https://github.com/Andruuid/PersonalPlanerMVP/actions/workflows/ci.yml)

Next.js 16 + TypeScript MVP für Personalplanung & Zeitkonten in Schweizer KMU.
Multi-Tenant (mehrere Betriebe pro Datenbank, server- und DB-seitig getrennt), Email/Passwort-Login, lokale SQLite-DB via Prisma 7 (libSQL),
Drag-and-Drop-Wochenplanung und Mitarbeitersicht.

## Tech-Stack

- Next.js 16 (App Router) + React 19 + TypeScript (strict)
- Tailwind CSS v4 + shadcn/ui (Radix)
- Auth.js v5 (Credentials Provider, JWT)
- Prisma 7 + SQLite via `@prisma/adapter-libsql`
- @dnd-kit/core, react-hook-form, zod
- Vitest, Playwright (E2E), Prettier, ESLint

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
| System-Admin | `system@platform.local` | `system123` |
| Admin      | `admin@demo.ch`         | `admin123` |
| Mitarbeiter | `anna.keller@demo.ch`   | `demo123` |
| Mitarbeiter | `marco.huber@demo.ch`   | `demo123` |
| Mitarbeiter | `lina.meier@demo.ch`    | `demo123` |
| Mitarbeiter | `noah.schmid@demo.ch`   | `demo123` |

Admin landet nach dem Login auf `/dashboard`, Mitarbeitende auf `/my-week`.

Die Anmeldung verwendet nur E-Mail und Passwort; der Betrieb ergibt sich aus dem bestehenden Benutzerkonto (global eindeutige E-Mail) (MVP-Verhalten; multi-mandanten Login folgt).

### End-to-End-Tests (Playwright)

Die Smoke-Tests in `e2e/` erwarten dieselbe Datenbankkonfiguration wie der Dev-Server
(`DATABASE_URL`) und gültige Demo-Daten (**Migration + Seed vor dem ersten Lauf**):

```powershell
npx prisma migrate deploy
npm run db:seed
```

Zugänge entsprechen der Tabelle „Demo-Konten“ (Demo-Stammdaten unter dem Tenant slug `default` im Seed).

E2E startet absichtlich immer einen **frischen** Dev-Server auf Port **3001**
(`playwright.config.ts`: `next dev --port 3001`, `reuseExistingServer: false`).
So vermeiden wir veralteten Runtime-/Prisma-Status aus bereits laufenden lokalen
`npm run dev`-Sessions auf Port 3000.

| Skript                 | Zweck                                        |
| ---------------------- | -------------------------------------------- |
| `npm run test:e2e`     | Alle E2E-Tests headless (`playwright.config`: startet immer frischen `npm run dev -- --port 3001`) |
| `npm run test:e2e:headed` | Gleiche Tests mit sichtbarem Browser     |
| `npm run test:e2e:ui`  | [Playwright UI Mode](https://playwright.dev/docs/test-ui-mode) zum Debuggen |

Optional: Chromium-Browser installieren oder aktualisieren:

```powershell
npx playwright install chromium
```

## Skripte

| Skript            | Zweck                                                  |
| ----------------- | ------------------------------------------------------ |
| `npm run dev`     | Next.js Entwicklungsserver                             |
| `npm run build`   | Produktions-Build                                      |
| `npm run lint`    | ESLint                                                 |
| `npm run test`    | Vitest (einmal)                                        |
| `npm run test:e2e` | Playwright E2E (siehe Abschnitt E2E)              |
| `npm run test:e2e:headed` | Playwright mit sichtbarem Fenster           |
| `npm run test:e2e:ui`   | Playwright UI Mode                                   |
| `npm run db:generate` | Prisma Client neu generieren                       |
| `npm run db:migrate`  | Migration anwenden / erzeugen                      |
| `npm run db:reset`    | DB zurücksetzen + Seed                             |
| `npm run db:seed`     | Seed-Daten einspielen                              |
| `npm run db:studio`   | Prisma Studio                                      |
| `npm run db:push:libsql` | Migrationen auf eine libSQL/Turso-DB anwenden  |
| `npm run db:copy:turso`  | Optional: Daten zwischen zwei Turso-DBs kopieren (sonst neu + Seed) |
| `npm run db:purge:archived` | Löscht archivierte Datensätze nach Ablauf der 10-Jahres-Frist (`-- --dry-run` für Vorschau) |

### Runbook: Prisma-Migration ohne `db reset`

Wenn `npm run db:migrate -- --name <name>` lokal mit dem Hinweis auf
"modified after it was applied" abbricht und ein Reset verlangt, gehe so vor:

1. **Schema zuerst ändern** (`prisma/schema.prisma`).
2. **Migration manuell anlegen** unter
   `prisma/migrations/<timestamp>_<name>/migration.sql`.
   - Bei SQLite-Änderungen an Prisma-Enums (hier als `TEXT`) kann diese Datei
     bewusst nur einen Kommentar enthalten, wenn kein DDL nötig ist.
3. **Client regenerieren**: `npm run db:generate`
4. **Qualität prüfen**: `npx tsc --noEmit` und `npm run test`
5. **Auf Zielumgebungen anwenden** mit `npx prisma migrate deploy`
   (bzw. bei Turso `npm run db:push:libsql`).

Wichtig: Kein `db reset`, solange lokale Daten erhalten bleiben sollen.

Kurze Vorlage für `migration.sql` (manuell):

```sql
-- Migration: <timestamp>_<name>
-- Context: Warum diese Migration nötig ist.
-- Safety: Warum kein db reset nötig ist / welche Annahmen gelten.
-- Notes: Besonderheiten für SQLite/libSQL (z. B. Enum als TEXT).

-- SQL change(s) below (leer lassen, wenn bewusst kein DDL nötig ist).
```

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
- **Dashboard:** Kennzahlen (offene Anträge, Backlog vergangener offener Wochen, aktuelle Woche, aktive Mitarbeitende, Audit-Aktivität) und letzte Audit-Einträge auf einen Blick.

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

### Logging & Observability

Server-Logs sind fuer Netlify Observability auf ein einheitliches JSON-Format
standardisiert. Das Log-Level wird ueber **`LOG_LEVEL`** gesteuert:

- `debug`: detailreiche fachliche Start/Ende-Events + Fehler
- `error`: nur Fehler (empfohlen fuer stabile Production)

Empfohlene Defaults:

- Development/Test: `LOG_LEVEL=debug`
- Production (Netlify/Vercel): `LOG_LEVEL=error`

Wichtig:

- Es wird nur serverseitig geloggt (Server Components, Route Handler, Server Actions).
- Sensitive Felder (z. B. `password`, `token`, `secret`, `authorization`, `cookie`) werden im Logger redigiert.
- In Netlify findest du diese Logs in den Function-/Runtime-Logs der jeweiligen Requests.

### Debug-Route fuer Runtime-Diagnose

Fuer Faelle, in denen Netlify-Request-Details keine Logs zeigen, gibt es die
temporäre Diagnose-Route:

- `GET /api/debug/runtime`

Die Route ist nur aktiv, wenn `LOG_LEVEL=debug` gesetzt ist (sonst `404`), und
liefert einen kompakten Runtime-Check als JSON:

- Env-Praesenz (`DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `AUTH_SECRET`)
- Session-Check (z. B. Rolle/Tenant-Claim vorhanden)
- DB-Connectivity-Check (`SELECT 1`) und `user.count()`

Empfehlung:

- Nur fuer gezielte Fehlersuche in Development/Incident-Phasen nutzen
- In stabiler Production wieder `LOG_LEVEL=error` setzen
- Keine sensiblen Inhalte aus Responses oder Logs extern teilen

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

### ERT — geplanter Tages‑Cron (empfohlen)

ERT-Fälle können bei Planänderungen sofort berechnet werden; zusätzlich
stellt die App einen Cron‑Endpoint bereit (`GET /api/cron/ert-sweep`).
Lege einen geheimen Wert **`CRON_SECRET`** in Netlify (Environment variables)
fest und konfiguriere eine **Scheduled Function**, die diese URL **täglich**
mithilfe eines `Authorization: Bearer <CRON_SECRET>`-Headers aufruft —
damit ERT‑Status (**OPEN**, **OVERDUE**, **FULFILLED**) auch ohne ständige
Planungsaktivität konsistent bleiben.

### Vergangene veröffentlichte Wochen — Tages‑Cron (empfohlen)

Spezifikation: Sobald eine Kalenderwoche vorbei ist, werden die Zeitkonten
berechnet. Dazu schließt ein zweiter Cron‑Endpoint (`GET /api/cron/auto-close`)
pro Mandanten alle **vergangenen** ISO‑Wochen mit Status **Veröffentlicht**
automatisch ab (`recalcWeekClose`, dann `CLOSED` samt Audit‑Eintrag
**AUTO_CLOSE**). Entwürfe (**DRAFT**) bleiben unberührt.

Konfiguriere dieselbe **`CRON_SECRET`**‑Variable und eine **weitere**
Scheduled Function mit täglichem Aufruf und `Authorization: Bearer <CRON_SECRET>`.

### Jahreswechsel — Cron am 01.01. (empfohlen)

`GET /api/cron/year-end` führt pro Mandanten die Jahreswechsel‑Logik
(`applyYearEndCarryover`, idempotent wie der manuelle Admin‑Button) nur am **1. Januar**
(Europe/Zurich) aus und schreibt pro Mandant einen Audit‑Eintrag **YEAR_END_CARRYOVER_AUTO**.
Welcher Admin‑User gebucht wird, ist der erste aktive ADMIN des Mandanten (wie beim
Auto‑Wochenschluss).

Lege wieder **`CRON_SECRET`** an und einen **jährlichen** Scheduled Function‑Aufruf am
01.01. (einmal täglicher Aufruf reicht ebenfalls — der Endpoint ist sonst ein No‑Op).
Authorization: `Authorization: Bearer <CRON_SECRET>`.

Für lokale/integration Tests ohne Kalenderdatum: Umgebungsvariable **`AUTO_YEAR_END_FORCE=1`**
ersetzt den 01.01.‑Filter (gleiche `fromYear`‑Ableitung wie am „echten“ Jahresbeginn nach
Timezone).

Der Admin‑Dialog **„Jahreswechsel“** bleibt als manueller Override erhalten.

## CI

Der GitHub-Actions-Workflow (`.github/workflows/ci.yml`) führt bei jedem
Push/PR auf `main` Lint, TypeScript, Vitest und Next-Build aus. Die
SQLite-Test-DB wird via `vitest.global-setup.ts` einmalig pro Run
vorbereitet.
