# PersonalPlanerMVP

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
- ⏳ Phase 2 (Admin-Stammdaten): Mitarbeitende, Dienstvorlagen, Standorte/Feiertage.
- ⏳ Phase 3 (Wochenplanung): Drag-and-Drop-Raster, KPIs, Detailfenster, Veröffentlichen.
- ⏳ Phase 4 (Mitarbeitersicht + Anträge): Meine Woche, Antrag stellen, Genehmigungs-Loop.
- ⏳ Phase 5 (Zeitlogik + Konten): Sollzeit, Zeitsaldo, UEZ, Ferien, manuelle Buchungen.
- ⏳ Phase 6 (Audit + Netlify + Polish): Audit-Log-UI, `netlify.toml`, mobile QA.

## Deployment auf Netlify (Demo)

Für den Kunden-Demo ohne lokale SQLite:

1. `DATABASE_URL` setzen (z.B. Turso `libsql://...` mit `@prisma/adapter-libsql`
   oder Neon Postgres mit Provider-Wechsel auf `postgresql`).
2. `netlify.toml` mit `@netlify/plugin-nextjs` (folgt in Phase 6).
3. `npx prisma migrate deploy && npm run db:seed`.
