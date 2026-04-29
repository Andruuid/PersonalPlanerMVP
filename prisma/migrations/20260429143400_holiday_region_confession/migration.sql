-- Migrate Location.holidayRegionCode from canton codes to a confession choice.
-- Going forward only "EVANGELISCH" and "KATHOLISCH" are valid values; the
-- application enforces this via Zod and the UI. The mapping mirrors the
-- behaviour of `holidaysForRegion` in lib/holidays-ch.ts so existing
-- generated holidays stay consistent.
UPDATE "Location" SET "holidayRegionCode" = 'KATHOLISCH' WHERE "holidayRegionCode" IN ('LU','BE','BS');
UPDATE "Location" SET "holidayRegionCode" = 'EVANGELISCH' WHERE "holidayRegionCode" = 'ZH';
UPDATE "Location" SET "holidayRegionCode" = 'EVANGELISCH' WHERE "holidayRegionCode" NOT IN ('EVANGELISCH','KATHOLISCH');
