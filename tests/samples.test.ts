import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validate } from "../src/lang";
import { renderDiagnostic } from "../src/i18n/messages";

const read = (name: string) =>
  readFileSync(new URL(`../samples/${name}`, import.meta.url), "utf8");

function report(source: string): string[] {
  return validate(source)
    .diagnostics.map(
      (d) =>
        `${d.severity} ${d.code} line ${d.span.start.line}: ${
          renderDiagnostic(d, "en").message
        }`,
    );
}

describe("real models", () => {
  it("accepts the CSTR model with no errors", () => {
    const messages = report(read("lec6-cstr.eqs"));
    expect(messages.filter((m) => m.startsWith("error"))).toEqual([]);
  });

  it("accepts the packed-bed model with no errors", () => {
    const messages = report(read("fixed-bed-isothermal.eqs"));
    expect(messages.filter((m) => m.startsWith("error"))).toEqual([]);
  });

  it("accepts the PFR model with no errors", () => {
    const messages = report(read("pfr-first-order.eqs"));
    expect(messages.filter((m) => m.startsWith("error"))).toEqual([]);
  });
});
