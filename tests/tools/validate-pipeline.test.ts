import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	validatePipelineYaml,
	parseValidationErrors,
} from "../../src/tools/validate-pipeline.js";

// Mock environment variables
const originalEnv = process.env;

describe("validate-pipeline", () => {
	beforeEach(() => {
		process.env = {
			...originalEnv,
			AZURE_DEVOPS_ORG: "test-org",
			AZURE_DEVOPS_PAT: "test-pat",
			AZURE_DEVOPS_PROJECT: "test-project",
		};
		vi.restoreAllMocks();
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("parseValidationErrors", () => {
		it("should parse line numbers from error messages", () => {
			const errorMessage = "Line 10, Column 5: Invalid task name";
			const errors = parseValidationErrors(errorMessage);

			expect(errors).toHaveLength(1);
			expect(errors[0].line).toBe(10);
			expect(errors[0].message).toContain("Invalid task name");
		});

		it("should handle multiple errors", () => {
			const errorMessage =
				"Line 5: Missing required field\nLine 12: Unknown keyword";
			const errors = parseValidationErrors(errorMessage);

			expect(errors).toHaveLength(2);
			expect(errors[0].line).toBe(5);
			expect(errors[1].line).toBe(12);
		});

		it("should handle errors without line numbers", () => {
			const errorMessage = "Generic validation error";
			const errors = parseValidationErrors(errorMessage);

			expect(errors).toHaveLength(1);
			expect(errors[0].line).toBeUndefined();
			expect(errors[0].message).toBe("Generic validation error");
		});
	});

	describe("validatePipelineYaml", () => {
		it("should return valid result on success", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ finalYaml: "expanded: yaml" }),
			});
			global.fetch = mockFetch;

			const result = await validatePipelineYaml(
				"trigger: none",
				123,
				"my-project"
			);

			expect(result.valid).toBe(true);
			expect(result.expandedYaml).toBe("expanded: yaml");
			expect(result.errors).toBeUndefined();
		});

		it("should return errors on validation failure", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				statusText: "Bad Request",
				text: () => Promise.resolve("Line 5: Missing required field"),
			});
			global.fetch = mockFetch;

			const result = await validatePipelineYaml("invalid: yaml", 123);

			expect(result.valid).toBe(false);
			expect(result.errors).toBeDefined();
			expect(result.errors!.length).toBeGreaterThan(0);
		});

		it("should call correct API endpoint", async () => {
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ finalYaml: "yaml" }),
			});
			global.fetch = mockFetch;

			await validatePipelineYaml("trigger: none", 456, "custom-project");

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("_apis/pipelines/456/preview"),
				expect.objectContaining({
					method: "POST",
					body: expect.stringContaining("yamlOverride"),
				})
			);
		});
	});
});
