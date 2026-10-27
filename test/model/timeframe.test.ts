import { describe, expect, it } from "vitest";

import {
  compareTimeframes,
  deriveUnits,
  isTimeframeParseError,
  parseTimeframe,
  presentUnits,
  type TimeframeValues,
} from "src/model/timeframe";
import { isTimeframeFormat } from "../../src/model/types";

describe("isTimeframeFormat", () => {
  it("accepts every configured format and rejects anything else", () => {
    for (const format of [
      "epoch-datetime-dmy",
      "epoch-datetime-mdy",
      "datetime",
      "time",
      "number",
    ]) {
      expect(isTimeframeFormat(format)).toBe(true);
    }
    for (const value of ["", "date", "datetime-dmy", null, undefined, 3]) {
      expect(isTimeframeFormat(value)).toBe(false);
    }
  });
});

describe("parseTimeframe", () => {
  it("parses every datetime format and its trailing units", () => {
    expect(parseTimeframe("04/03/2026 09:30:45", "datetime")).toEqual({
      ok: true,
      values: {
        day: 4,
        month: 3,
        year: 2026,
        hour: 9,
        minute: 30,
        second: 45,
      },
    });
    expect(parseTimeframe("04/03/2026 09:30", "datetime")).toEqual({
      ok: true,
      values: { day: 4, month: 3, year: 2026, hour: 9, minute: 30 },
    });
    expect(parseTimeframe("4/3/2026", "datetime")).toEqual({
      ok: true,
      values: { day: 4, month: 3, year: 2026 },
    });
  });

  it("parses the epoch formats with their configured date order", () => {
    expect(
      parseTimeframe("123 04/03/2026 09:30", "epoch-datetime-dmy")
    ).toEqual({
      ok: true,
      values: {
        epoch: 123,
        day: 4,
        month: 3,
        year: 2026,
        hour: 9,
        minute: 30,
      },
    });
    expect(
      parseTimeframe("123 03/04/2026 09:30", "epoch-datetime-mdy")
    ).toEqual({
      ok: true,
      values: {
        epoch: 123,
        month: 3,
        day: 4,
        year: 2026,
        hour: 9,
        minute: 30,
      },
    });
  });

  it("parses time-only and number values", () => {
    expect(parseTimeframe("09:30", "time")).toEqual({
      ok: true,
      values: { hour: 9, minute: 30 },
    });
    expect(parseTimeframe("09:30:15", "time")).toEqual({
      ok: true,
      values: { hour: 9, minute: 30, second: 15 },
    });
    expect(parseTimeframe("5", "number")).toEqual({
      ok: true,
      values: { number: 5 },
    });
    expect(parseTimeframe(12, "number")).toEqual({
      ok: true,
      values: { number: 12 },
    });
  });

  it("rejects empty, malformed, and out-of-range values", () => {
    for (const raw of ["", "   ", null, undefined, {}, []]) {
      const parsed = parseTimeframe(raw, "datetime");
      expect(isTimeframeParseError(parsed)).toBe(true);
      if (isTimeframeParseError(parsed)) {
        expect(parsed.error).toEqual({ kind: "empty" });
      }
    }

    // Too few units for the format.
    expect(parseTimeframe("04/03", "datetime")).toEqual({
      ok: false,
      error: { kind: "format" },
    });
    expect(parseTimeframe("09", "time")).toEqual({
      ok: false,
      error: { kind: "format" },
    });
    expect(parseTimeframe("not a date", "datetime")).toEqual({
      ok: false,
      error: { kind: "format" },
    });
    expect(parseTimeframe("-3", "number")).toEqual({
      ok: false,
      error: { kind: "format" },
    });
  });

  it("reports the first out-of-range unit", () => {
    expect(parseTimeframe("04/13/2026", "datetime")).toEqual({
      ok: false,
      error: { kind: "range", unit: "month", value: 13 },
    });
    expect(parseTimeframe("32/03/2026", "datetime")).toEqual({
      ok: false,
      error: { kind: "range", unit: "day", value: 32 },
    });
    expect(parseTimeframe("04/03/2026 24:00", "datetime")).toEqual({
      ok: false,
      error: { kind: "range", unit: "hour", value: 24 },
    });
    expect(parseTimeframe("04/03/2026 09:60", "datetime")).toEqual({
      ok: false,
      error: { kind: "range", unit: "minute", value: 60 },
    });
  });
});

describe("presentUnits", () => {
  it("returns format units coarsest first", () => {
    expect(presentUnits("datetime")).toEqual([
      "year",
      "month",
      "day",
      "hour",
      "minute",
      "second",
    ]);
    expect(presentUnits("epoch-datetime-dmy")).toEqual([
      "epoch",
      "year",
      "month",
      "day",
      "hour",
      "minute",
      "second",
    ]);
    expect(presentUnits("time")).toEqual(["hour", "minute", "second"]);
    // `number` is a chronological order, not a date magnitude, so it is not
    // included in the coarsest-first unit list.
    expect(presentUnits("number")).toEqual([]);
  });
});

describe("deriveUnits", () => {
  it("uses number for number timelines and empty input", () => {
    expect(deriveUnits([], "number")).toEqual(["number", "number"]);
    expect(deriveUnits([{ year: 2026 }], "number")).toEqual([
      "number",
      "number",
    ]);
    expect(deriveUnits([], "datetime")).toEqual(["year", "year"]);
  });

  it("picks the finest changing unit as primary and the cadence", () => {
    const values: TimeframeValues[] = [
      { year: 2026, month: 3, day: 4, hour: 9, minute: 0 },
      { year: 2026, month: 3, day: 5, hour: 10, minute: 0 },
      { year: 2026, month: 3, day: 6, hour: 11, minute: 0 },
    ];

    expect(deriveUnits(values, "datetime")).toEqual(["day", "day"]);
  });
});

describe("compareTimeframes", () => {
  it("orders numbers and dates chronologically", () => {
    expect(compareTimeframes({ number: 2 }, { number: 10 })).toBeLessThan(0);
    expect(compareTimeframes({ number: 10 }, { number: 2 })).toBeGreaterThan(
      0
    );
    expect(compareTimeframes({ number: 2 }, { number: 2 })).toBe(0);

    expect(
      compareTimeframes(
        { year: 2026, month: 3, day: 4 },
        { year: 2026, month: 3, day: 5 }
      )
    ).toBeLessThan(0);
    expect(
      compareTimeframes(
        { year: 2026, month: 4, day: 1 },
        { year: 2026, month: 3, day: 31 }
      )
    ).toBeGreaterThan(0);
    // A missing coarser unit sorts before a present one.
    expect(compareTimeframes({ hour: 1 }, { day: 1, hour: 0 })).toBeLessThan(
      0
    );
  });

  it("treats a missing number as zero", () => {
    expect(compareTimeframes({}, { number: 0 })).toBe(0);
    expect(compareTimeframes({ number: 1 }, {})).toBeGreaterThan(0);
  });
});
