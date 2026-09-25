import { describe, expect, it } from "vitest";
import {
  decodeSource,
  encodeSource,
  hasCharactersTis620CannotStore,
} from "../src/encoding/tis620";

describe("file encoding", () => {
  const thai = "//ค่าในสภาวะจริง\nFA0=3";

  it("round-trips Thai through TIS-620", () => {
    const bytes = encodeSource(thai, "tis-620");
    expect(decodeSource(bytes).text).toBe(thai);
  });

  it("detects TIS-620 rather than mangling it as UTF-8", () => {
    const bytes = encodeSource(thai, "tis-620");
    expect(decodeSource(bytes).encoding).toBe("tis-620");
  });

  it("detects UTF-8", () => {
    const bytes = encodeSource(thai, "utf-8");
    expect(decodeSource(bytes)).toEqual({ text: thai, encoding: "utf-8" });
  });

  it("honours an encoding the user picked", () => {
    const bytes = encodeSource(thai, "tis-620");
    expect(decodeSource(bytes, "tis-620").text).toBe(thai);
  });

  it("flags characters TIS-620 cannot store", () => {
    expect(hasCharactersTis620CannotStore("//ค่า A=1")).toBe(false);
    expect(hasCharactersTis620CannotStore("//温度")).toBe(true);
  });
});
