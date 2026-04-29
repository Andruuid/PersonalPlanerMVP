-- Add BookingType.UEZ_PAYOUT.
--
-- SQLite has no native enum type; Prisma persists enum values in a plain
-- TEXT column on Booking.bookingType. Adding a new variant is therefore a
-- schema-only change with no DDL. This file is intentionally a no-op so
-- the migration history stays in sync with prisma/schema.prisma.
SELECT 1;
