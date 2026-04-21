import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("concatenates simple class names", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("drops falsy values from clsx", () => {
    expect(cn("a", false && "b", undefined, null, "c")).toBe("a c");
  });

  it("merges conflicting tailwind classes, keeping the last one", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("supports arrays and object forms accepted by clsx", () => {
    expect(cn(["text-sm", { "font-bold": true, hidden: false }])).toBe(
      "text-sm font-bold",
    );
  });

  it("returns an empty string when given no inputs", () => {
    expect(cn()).toBe("");
  });
});
