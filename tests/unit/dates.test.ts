import { describe, expect, it } from "vitest";
import { addDays, damascusToday, daysBetween, formatDate, formatDateTime } from "@/lib/dates";

describe("dates (Asia/Damascus, Arabic with Latin digits)", () => {
  it("formats calendar dates", () => {
    expect(formatDate("2026-11-21")).toBe("21 تشرين الثاني 2026");
    expect(formatDate("2026-08-01")).toBe("1 آب 2026");
  });

  it("uses the Damascus calendar day, not UTC", () => {
    // 22:30 UTC on 31 Dec is already 1 Jan in Damascus (UTC+3).
    expect(damascusToday(new Date("2026-12-31T22:30:00Z"))).toBe("2027-01-01");
    expect(damascusToday(new Date("2026-12-31T20:30:00Z"))).toBe("2026-12-31");
  });

  it("date math", () => {
    expect(addDays("2026-10-28", 29)).toBe("2026-11-26");
    expect(daysBetween("2026-10-28", "2026-11-26")).toBe(29);
  });

  it("relative timestamps", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    expect(formatDateTime("2026-10-28T06:12:00Z", now)).toBe("اليوم، 09:12");
    expect(formatDateTime("2026-10-27T15:22:00Z", now)).toBe("أمس، 18:22");
    expect(formatDateTime("2026-10-02T08:05:00Z", now)).toBe("2 تشرين الأول، 11:05");
  });
});
