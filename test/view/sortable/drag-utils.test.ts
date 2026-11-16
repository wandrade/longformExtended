import { describe, expect, it } from "vitest";

import { getDragX } from "../../../src/view/sortable/drag-utils";

describe("getDragX", () => {
  it("reads touch coordinates from the original touch event", () => {
    const event = {
      originalEvent: {
        touches: [{ clientX: 208 }],
      },
    };

    expect(getDragX(event)).toBe(208);
  });

  it("falls back to mouse coordinates when present", () => {
    const event = {
      originalEvent: {
        x: 101,
      },
    };

    expect(getDragX(event)).toBe(101);
  });
});
