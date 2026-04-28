import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("server action surface", () => {
  it("does not export internal week helpers from callable server-action modules", () => {
    const root = process.cwd();
    const bookingsSource = readFileSync(join(root, "server/bookings.ts"), "utf8");
    const weeksSource = readFileSync(join(root, "server/weeks.ts"), "utf8");

    expect(bookingsSource).not.toMatch(/export async function recalcWeekClose/);
    expect(bookingsSource).not.toMatch(/export async function removeWeekClosingBookings/);
    expect(weeksSource).not.toMatch(/export async function getOrCreateWeek/);
  });
});
