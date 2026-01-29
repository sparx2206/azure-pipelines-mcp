import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	validatePipelineYaml,
	parseValidationErrors,
	getDummyPipeline,
	createDummyPipeline,
	registerValidatePipelineTools,
} from "../../src/tools/validate-pipeline.js";
import { getDefaultCache } from "../../src/services/cache.js";

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
		getDefaultCache().clear();
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
			vi.spyOn(global, "fetch").mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ finalYaml: "expanded: yaml" }),
			} as Response);

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
			vi.spyOn(global, "fetch").mockResolvedValue({
				ok: false,
				status: 400,
				statusText: "Bad Request",
				text: () => Promise.resolve("Line 5: Missing required field"),
			} as Response);

			const result = await validatePipelineYaml("invalid: yaml", 123);

			expect(result.valid).toBe(false);
			expect(result.errors).toBeDefined();
			expect(result.errors!.length).toBeGreaterThan(0);
		});

		it("should call correct API endpoint", async () => {
			const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ finalYaml: "yaml" }),
			} as Response);

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

	describe("getDummyPipeline", () => {
		it("should find existing tool pipeline", async () => {
			const mockResponseData = {
				value: [
					{
						id: 999,
						name: "DummyValidationPipeline",
						folder: "\\AI\\DummyValidationPipeline",
					},
				],
			};
			vi.spyOn(global, "fetch").mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve(mockResponseData),
				text: () => Promise.resolve(JSON.stringify(mockResponseData)),
			} as Response);

			const result = await getDummyPipeline();

			expect(result.found).toBe(true);
			expect(result.pipelineId).toBe(999);
			expect(result.name).toBe("DummyValidationPipeline");
		});

		it("should return found: false when not found", async () => {
			const mockResponseData = {
				value: [
					{
						id: 111,
						name: "OtherPipeline",
						folder: "\\",
					},
				],
			};
			vi.spyOn(global, "fetch").mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve(mockResponseData),
				text: () => Promise.resolve(JSON.stringify(mockResponseData)),
			} as Response);

			const result = await getDummyPipeline();

			expect(result.found).toBe(false);
		});

		it("should return found: false on API error", async () => {
			vi.spyOn(global, "fetch").mockRejectedValue(new Error("API Error"));

			const result = await getDummyPipeline();

			expect(result.found).toBe(false);
		});
	});

	describe("createDummyPipeline", () => {
		it("should create folder and pipeline", async () => {
			const mockFetch = vi.spyOn(global, "fetch").mockImplementation((url) => {
				if (url.toString().includes("folders")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve({}),
					} as Response);
				}
				if (url.toString().includes("_apis/pipelines")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								id: 1000,
								name: "DummyValidationPipeline",
								folder: "\\AI\\DummyValidationPipeline",
								_links: { web: { href: "http://pipeline/1000" } },
							}),
					} as Response);
				}
				return Promise.reject(new Error("Unknown URL"));
			});

			const result = await createDummyPipeline("repo-id");

			expect(result.pipelineId).toBe(1000);
			expect(result.url).toBe("http://pipeline/1000");

			// Check first call (PUT folder)
			expect(mockFetch).toHaveBeenNthCalledWith(
				1,
				expect.stringContaining("folders"),
				expect.objectContaining({ method: "PUT" })
			);

			// Check second call (POST pipeline)
			expect(mockFetch).toHaveBeenNthCalledWith(
				2,
				expect.stringContaining("_apis/pipelines"),
				expect.objectContaining({
					method: "POST",
					body: expect.stringContaining("DummyValidationPipeline"),
				})
			);
		});

		it("should ignore 409 Conflict when folder exists", async () => {
			const mockFetch = vi.spyOn(global, "fetch").mockImplementation((url) => {
				if (url.toString().includes("folders")) {
					return Promise.reject(new Error("HTTP 409: Conflict"));
				}
				if (url.toString().includes("_apis/pipelines")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								id: 1000,
								name: "DummyValidationPipeline",
								folder: "\\AI\\DummyValidationPipeline",
							}),
					} as Response);
				}
				return Promise.reject(new Error("Unknown URL"));
			});


			const result = await createDummyPipeline("repo-id");

			expect(result.pipelineId).toBe(1000);
			// Should still proceed to create pipeline
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it("should throw on non-409 error when creating folder", async () => {
			vi.spyOn(global, "fetch").mockImplementation((url) => {
				if (url.toString().includes("folders")) {
					return Promise.reject(new Error("HTTP 403: Forbidden"));
				}
				return Promise.resolve({} as Response);
			});

			await expect(createDummyPipeline("repo-id")).rejects.toThrow(
				"HTTP 403: Forbidden"
			);
		});
	});

	describe("registerValidatePipelineTools", () => {
		it("should register all tools and handlers should work", async () => {
			const mockServer = {
				tool: vi.fn(),
				registerTool: vi.fn(),
			};

			// @ts-expect-error - using mock server
			registerValidatePipelineTools(mockServer);

			// Check that 3 tools were registered
			expect(mockServer.registerTool).toHaveBeenCalledTimes(3);

			// Verify tool names
			const registeredTools = mockServer.registerTool.mock.calls.map(
				(call) => call[0]
			);
			expect(registeredTools).toContain("validate_pipeline_yaml");
			expect(registeredTools).toContain("get_dummy_pipeline");
			expect(registeredTools).toContain("create_dummy_pipeline");

			// Test "get_dummy_pipeline" handler
			// Find the call for get_dummy_pipeline
			const getDummyCall = mockServer.registerTool.mock.calls.find(
				(call) => call[0] === "get_dummy_pipeline"
			);
			expect(getDummyCall).toBeDefined();

			if (!getDummyCall) throw new Error("get_dummy_pipeline not registered");

			const getDummyHandler = getDummyCall[2]; // 3rd argument is the handler

			// Mock fetch for successful response
			const mockResponseData = {
				value: [
					{
						id: 999,
						name: "DummyValidationPipeline",
						folder: "\\AI\\DummyValidationPipeline",
					},
				],
			};
			vi.spyOn(global, "fetch").mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve(mockResponseData),
				text: () => Promise.resolve(JSON.stringify(mockResponseData)),
			} as Response);

			const result = await getDummyHandler({ project: "test-project" });
			expect(result.content[0].text).toContain("999");
			expect(result.content[0].text).toContain("DummyValidationPipeline");

			// Test "validate_pipeline_yaml" handler
			const validatePipelineCall = mockServer.registerTool.mock.calls.find(
				(call) => call[0] === "validate_pipeline_yaml"
			);
			expect(validatePipelineCall).toBeDefined();
			if (!validatePipelineCall)
				throw new Error("validate_pipeline_yaml not registered");
			const validateHandler = validatePipelineCall[2];

			// Mock fetch for validation (POST /_apis/pipelines/{id}/preview YAML preview endpoint)
			vi.spyOn(global, "fetch").mockImplementation((url) => {
				if (url.toString().includes("/preview")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve({ finalYaml: "stages:\n- stage: A" }),
					} as Response);
				}
				return Promise.reject(new Error("Unknown URL"));
			});

			const validateResult = await validateHandler({
				yaml: "stages:\n- stage: A",
				pipelineId: 1000,
				project: "test-project",
			});
			expect(validateResult.content[0].text).toContain("stages:");
			expect(validateResult.content[0].text).toContain("- stage: A");

			// Test "create_dummy_pipeline" handler
			const createDummyCall = mockServer.registerTool.mock.calls.find(
				(call) => call[0] === "create_dummy_pipeline"
			);
			expect(createDummyCall).toBeDefined();

			if (!createDummyCall)
				throw new Error("create_dummy_pipeline not registered");

			const createDummyHandler = createDummyCall[2];

			// Mock fetch for create (PUT folder + POST pipeline)
			vi.spyOn(global, "fetch").mockImplementation((url) => {
				if (url.toString().includes("folders")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () => Promise.resolve({}),
					} as Response);
				}
				if (url.toString().includes("_apis/pipelines")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								id: 1000,
								name: "DummyValidationPipeline",
								folder: "\\AI\\DummyValidationPipeline",
								_links: { web: { href: "http://pipeline/1000" } },
							}),
					} as Response);
				}
				return Promise.reject(new Error("Unknown URL"));
			});

			const createResult = await createDummyHandler({
				repositoryId: "repo-123",
				project: "test-project",
			});
			expect(createResult.content[0].text).toContain("1000");
			expect(createResult.content[0].text).toContain("http://pipeline/1000");
		});
	});
});
