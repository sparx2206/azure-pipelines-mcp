import { describe, it, expect } from "vitest";
import { getVariablesReference } from "../../src/tools/variables.js";

describe("getVariablesReference", () => {
  it("returns overview when no category is provided", () => {
    const result = JSON.parse(getVariablesReference());

    expect(result.description).toBeDefined();
    expect(result.availableCategories).toBeInstanceOf(Array);
    expect(result.availableCategories.length).toBeGreaterThan(0);
  });

  it("returns all expected category IDs in overview", () => {
    const result = JSON.parse(getVariablesReference());
    const categoryIds = result.availableCategories.map(
      (c: { id: string }) => c.id,
    );

    expect(categoryIds).toContain("agent");
    expect(categoryIds).toContain("build");
    expect(categoryIds).toContain("system");
    expect(categoryIds).toContain("pipeline");
    expect(categoryIds).toContain("deployment");
    expect(categoryIds).toContain("checks");
  });

  it("each category in overview has id, title, description, and count", () => {
    const result = JSON.parse(getVariablesReference());

    for (const category of result.availableCategories) {
      expect(category.id).toBeDefined();
      expect(category.title).toBeDefined();
      expect(category.description).toBeDefined();
      expect(category.count).toBeGreaterThan(0);
    }
  });

  it("returns agent variables when category is 'agent'", () => {
    const result = JSON.parse(getVariablesReference("agent"));

    expect(result.title).toBe("Agent Variables");
    expect(result.variables).toBeInstanceOf(Array);
    expect(result.variables.length).toBeGreaterThan(0);

    const names = result.variables.map((v: { name: string }) => v.name);
    expect(names).toContain("Agent.BuildDirectory");
    expect(names).toContain("Agent.OS");
    expect(names).toContain("Agent.Name");
  });

  it("returns build variables when category is 'build'", () => {
    const result = JSON.parse(getVariablesReference("build"));

    expect(result.title).toBe("Build Variables");
    expect(result.variables).toBeInstanceOf(Array);

    const names = result.variables.map((v: { name: string }) => v.name);
    expect(names).toContain("Build.BuildId");
    expect(names).toContain("Build.SourceBranch");
    expect(names).toContain("Build.Reason");
  });

  it("returns system variables when category is 'system'", () => {
    const result = JSON.parse(getVariablesReference("system"));

    expect(result.title).toBe("System Variables");
    expect(result.variables).toBeInstanceOf(Array);

    const names = result.variables.map((v: { name: string }) => v.name);
    expect(names).toContain("System.AccessToken");
    expect(names).toContain("System.TeamProject");
    expect(names).toContain("System.Debug");
  });

  it("returns deployment variables", () => {
    const result = JSON.parse(getVariablesReference("deployment"));

    expect(result.title).toBe("Deployment Job Variables");
    expect(result.variables).toBeInstanceOf(Array);

    const names = result.variables.map((v: { name: string }) => v.name);
    expect(names).toContain("Environment.Name");
    expect(names).toContain("Strategy.Name");
  });

  it("returns error for unknown category", () => {
    const result = JSON.parse(getVariablesReference("nonexistent"));

    expect(result.error).toBeDefined();
    expect(result.error).toContain("Unknown category");
    expect(result.error).toContain("nonexistent");
  });

  it("each variable has name and description", () => {
    const result = JSON.parse(getVariablesReference("build"));

    for (const variable of result.variables) {
      expect(variable.name).toBeDefined();
      expect(variable.description).toBeDefined();
    }
  });
});
