import { describe, it, expect } from "vitest";
import { getExpressionsReference } from "../../src/tools/expressions.js";

describe("getExpressionsReference", () => {
  it("returns overview when no category is provided", () => {
    const result = JSON.parse(getExpressionsReference());

    expect(result.description).toBeDefined();
    expect(result.syntaxVariants).toBeDefined();
    expect(result.syntaxVariants.compileTime).toBeDefined();
    expect(result.syntaxVariants.runtime).toBeDefined();
    expect(result.availableCategories).toBeInstanceOf(Array);
    expect(result.availableCategories.length).toBeGreaterThan(0);
    expect(result.contexts).toBeDefined();
  });

  it("returns all expected category IDs in overview", () => {
    const result = JSON.parse(getExpressionsReference());
    const categoryIds = result.availableCategories.map(
      (c: { id: string }) => c.id,
    );

    expect(categoryIds).toContain("comparison");
    expect(categoryIds).toContain("logical");
    expect(categoryIds).toContain("string");
    expect(categoryIds).toContain("collection");
    expect(categoryIds).toContain("utility");
    expect(categoryIds).toContain("status_check");
    expect(categoryIds).toContain("conditional");
    expect(categoryIds).toContain("type_conversion");
  });

  it("returns comparison functions when category is 'comparison'", () => {
    const result = JSON.parse(getExpressionsReference("comparison"));

    expect(result.title).toBe("Comparison Functions");
    expect(result.functions).toBeInstanceOf(Array);
    expect(result.functions.length).toBe(8);

    const names = result.functions.map((f: { name: string }) => f.name);
    expect(names).toContain("eq");
    expect(names).toContain("ne");
    expect(names).toContain("in");
    expect(names).toContain("notIn");
  });

  it("returns logical functions when category is 'logical'", () => {
    const result = JSON.parse(getExpressionsReference("logical"));

    expect(result.title).toBe("Logical Functions");
    expect(result.functions).toBeInstanceOf(Array);

    const names = result.functions.map((f: { name: string }) => f.name);
    expect(names).toContain("and");
    expect(names).toContain("or");
    expect(names).toContain("not");
    expect(names).toContain("xor");
  });

  it("returns string functions when category is 'string'", () => {
    const result = JSON.parse(getExpressionsReference("string"));

    expect(result.title).toBe("String Functions");
    expect(result.functions).toBeInstanceOf(Array);

    const names = result.functions.map((f: { name: string }) => f.name);
    expect(names).toContain("contains");
    expect(names).toContain("replace");
    expect(names).toContain("lower");
    expect(names).toContain("upper");
  });

  it("returns status check functions", () => {
    const result = JSON.parse(getExpressionsReference("status_check"));

    expect(result.title).toBe("Job Status Check Functions");
    expect(result.functions).toBeInstanceOf(Array);

    const names = result.functions.map((f: { name: string }) => f.name);
    expect(names).toContain("always");
    expect(names).toContain("failed");
    expect(names).toContain("succeeded");
  });

  it("returns conditional expressions", () => {
    const result = JSON.parse(getExpressionsReference("conditional"));

    expect(result.title).toBe("Conditional Expressions");
    expect(result.syntax).toBeInstanceOf(Array);
  });

  it("returns type conversion rules", () => {
    const result = JSON.parse(getExpressionsReference("type_conversion"));

    expect(result.title).toBe("Type Conversion Rules");
    expect(result.rules).toBeInstanceOf(Array);
    expect(result.rules.length).toBeGreaterThan(0);
  });

  it("returns error for unknown category", () => {
    const result = JSON.parse(getExpressionsReference("nonexistent"));

    expect(result.error).toBeDefined();
    expect(result.error).toContain("Unknown category");
    expect(result.error).toContain("nonexistent");
  });

  it("each function has name, signature, description, and example", () => {
    const result = JSON.parse(getExpressionsReference("comparison"));

    for (const fn of result.functions) {
      expect(fn.name).toBeDefined();
      expect(fn.signature).toBeDefined();
      expect(fn.description).toBeDefined();
      expect(fn.example).toBeDefined();
    }
  });
});
