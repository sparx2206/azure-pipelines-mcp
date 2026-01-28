import { describe, it, expect } from "vitest";
import { getYamlSchemaReference } from "../../src/tools/yaml-schema.js";

describe("getYamlSchemaReference", () => {
  it("returns overview when no element is provided", () => {
    const result = JSON.parse(getYamlSchemaReference());

    expect(result.description).toBeDefined();
    expect(result.notation).toBeDefined();
    expect(result.availableElements).toBeInstanceOf(Array);
    expect(result.availableElements.length).toBeGreaterThan(0);
  });

  it("returns all expected element IDs in overview", () => {
    const result = JSON.parse(getYamlSchemaReference());
    const elementIds = result.availableElements.map(
      (e: { id: string }) => e.id,
    );

    expect(elementIds).toContain("pipeline");
    expect(elementIds).toContain("stages");
    expect(elementIds).toContain("jobs");
    expect(elementIds).toContain("steps");
    expect(elementIds).toContain("trigger");
    expect(elementIds).toContain("pr");
    expect(elementIds).toContain("schedules");
    expect(elementIds).toContain("parameters");
    expect(elementIds).toContain("variables");
    expect(elementIds).toContain("resources");
    expect(elementIds).toContain("pool");
    expect(elementIds).toContain("extends");
  });

  it("each element in overview has id, title, and description", () => {
    const result = JSON.parse(getYamlSchemaReference());

    for (const element of result.availableElements) {
      expect(element.id).toBeDefined();
      expect(element.title).toBeDefined();
      expect(element.description).toBeDefined();
    }
  });

  it("returns pipeline element details", () => {
    const result = JSON.parse(getYamlSchemaReference("pipeline"));

    expect(result.title).toBe("Pipeline (root)");
    expect(result.syntax).toBeDefined();
    expect(result.description).toBeDefined();
  });

  it("returns stages element with properties and example", () => {
    const result = JSON.parse(getYamlSchemaReference("stages"));

    expect(result.title).toBe("Stages");
    expect(result.properties).toBeInstanceOf(Array);
    expect(result.example).toBeDefined();
    expect(result.syntax).toBeDefined();
  });

  it("returns jobs element with multiple job types", () => {
    const result = JSON.parse(getYamlSchemaReference("jobs"));

    expect(result.title).toBe("Jobs");
    expect(result.types).toBeDefined();
    expect(result.types.job).toBeDefined();
    expect(result.types.deployment).toBeDefined();
    expect(result.types.template).toBeDefined();
  });

  it("returns steps element with step types", () => {
    const result = JSON.parse(getYamlSchemaReference("steps"));

    expect(result.title).toBe("Steps");
    expect(result.types).toBeDefined();
    expect(result.types.script).toBeDefined();
    expect(result.types.bash).toBeDefined();
    expect(result.types.powershell).toBeDefined();
    expect(result.types.task).toBeDefined();
    expect(result.types.checkout).toBeDefined();
  });

  it("returns trigger element with shorthand and disable options", () => {
    const result = JSON.parse(getYamlSchemaReference("trigger"));

    expect(result.title).toBe("Trigger (CI)");
    expect(result.syntax).toBeDefined();
    expect(result.shorthand).toBeDefined();
    expect(result.disable).toBe("trigger: none");
  });

  it("returns pool element with Microsoft-hosted images list", () => {
    const result = JSON.parse(getYamlSchemaReference("pool"));

    expect(result.title).toBe("Pool");
    expect(result.microsoftHostedImages).toBeInstanceOf(Array);
    expect(result.microsoftHostedImages).toContain("ubuntu-latest");
    expect(result.microsoftHostedImages).toContain("windows-latest");
  });

  it("returns resources element with resource types", () => {
    const result = JSON.parse(getYamlSchemaReference("resources"));

    expect(result.title).toBe("Resources");
    expect(result.types).toBeDefined();
    expect(result.types.pipelines).toBeDefined();
    expect(result.types.repositories).toBeDefined();
    expect(result.types.containers).toBeDefined();
  });

  it("returns parameters element with supported types list", () => {
    const result = JSON.parse(getYamlSchemaReference("parameters"));

    expect(result.title).toBe("Parameters");
    expect(result.types).toBeInstanceOf(Array);
    expect(result.types).toContain("string");
    expect(result.types).toContain("boolean");
  });

  it("returns error for unknown element", () => {
    const result = JSON.parse(getYamlSchemaReference("nonexistent"));

    expect(result.error).toBeDefined();
    expect(result.error).toContain("Unknown element");
    expect(result.error).toContain("nonexistent");
  });
});
