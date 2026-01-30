import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	createPipeline,
	registerCreatePipelineTools,
} from "../../src/tools/create-pipeline.js";
import { getDefaultCache } from "../../src/services/cache.js";

// Mock environment variables
const originalEnv = process.env;

describe("create-pipeline", () => {
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

	describe("createPipeline", () => {
		it("should create a pipeline without folder", async () => {
			const mockFetch = vi.spyOn(global, "fetch").mockImplementation((url) => {
				if (url.toString().includes("_apis/pipelines")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								id: 123,
								name: "my-pipeline",
								folder: "\\",
								_links: { web: { href: "https://dev.azure.com/test/pipeline/123" } },
							}),
					} as Response);
				}
				return Promise.reject(new Error("Unknown URL: " + url));
			});

			const result = await createPipeline(
				"my-pipeline",
				"repo-123",
				"azure-pipelines.yml",
				undefined,
				"test-project"
			);

			expect(result.pipelineId).toBe(123);
			expect(result.name).toBe("my-pipeline");
			expect(result.folder).toBe("\\");
			expect(result.url).toBe("https://dev.azure.com/test/pipeline/123");

			// Verify POST was called with correct body
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("_apis/pipelines"),
				expect.objectContaining({
					method: "POST",
					body: expect.stringContaining("my-pipeline"),
				})
			);

			// Verify body structure
			const call = mockFetch.mock.calls[0];
			const body = JSON.parse(call[1]!.body as string);
			expect(body.name).toBe("my-pipeline");
			expect(body.configuration.type).toBe("yaml");
			expect(body.configuration.path).toBe("/azure-pipelines.yml");
			expect(body.configuration.repository.id).toBe("repo-123");
			expect(body.folder).toBeUndefined();
		});

		it("should create a pipeline with folder", async () => {
			const mockFetch = vi.spyOn(global, "fetch").mockImplementation((url) => {
				if (url.toString().includes("folders?path=")) {
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
								id: 456,
								name: "my-pipeline-with-folder",
								folder: "\\CI\\Builds",
								_links: { web: { href: "https://dev.azure.com/test/pipeline/456" } },
							}),
					} as Response);
				}
				return Promise.reject(new Error("Unknown URL: " + url));
			});

			const result = await createPipeline(
				"my-pipeline-with-folder",
				"repo-456",
				"azure-pipelines.yml",
				"\\CI\\Builds",
				"test-project"
			);

			expect(result.pipelineId).toBe(456);
			expect(result.name).toBe("my-pipeline-with-folder");
			expect(result.folder).toBe("\\CI\\Builds");

			// Check that folder creation was called
			expect(mockFetch).toHaveBeenNthCalledWith(
				1,
				expect.stringContaining("folders?path="),
				expect.objectContaining({ method: "PUT" })
			);

			// Check that pipeline creation was called
			expect(mockFetch).toHaveBeenNthCalledWith(
				2,
				expect.stringContaining("_apis/pipelines"),
				expect.objectContaining({ method: "POST" })
			);

			// Verify pipeline body includes folder
			const pipelineCall = mockFetch.mock.calls[1];
			const body = JSON.parse(pipelineCall[1]!.body as string);
			expect(body.folder).toBe("\\CI\\Builds");
		});

		it("should use default yamlPath", async () => {
			const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue({
				ok: true,
				status: 200,
				json: () =>
					Promise.resolve({
						id: 789,
						name: "default-path-pipeline",
						folder: "\\",
					}),
			} as Response);

			await createPipeline("default-path-pipeline", "repo-789");

			const call = mockFetch.mock.calls[0];
			const body = JSON.parse(call[1]!.body as string);
			expect(body.configuration.path).toBe("/azure-pipelines.yml");
		});

		it("should normalize yamlPath to start with /", async () => {
			const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue({
				ok: true,
				status: 200,
				json: () =>
					Promise.resolve({
						id: 999,
						name: "normalize-path",
						folder: "\\",
					}),
			} as Response);

			await createPipeline("normalize-path", "repo-999", "ci/build.yml");

			const call = mockFetch.mock.calls[0];
			const body = JSON.parse(call[1]!.body as string);
			expect(body.configuration.path).toBe("/ci/build.yml");
		});

		it("should not add extra / if yamlPath already starts with /", async () => {
			const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue({
				ok: true,
				status: 200,
				json: () =>
					Promise.resolve({
						id: 888,
						name: "already-normalized",
						folder: "\\",
					}),
			} as Response);

			await createPipeline("already-normalized", "repo-888", "/ci/build.yml");

			const call = mockFetch.mock.calls[0];
			const body = JSON.parse(call[1]!.body as string);
			expect(body.configuration.path).toBe("/ci/build.yml");
		});

		it("should throw error if project is missing", async () => {
			// Remove project from env
			delete process.env.AZURE_DEVOPS_PROJECT;

			await expect(
				createPipeline("no-project", "repo-123")
			).rejects.toThrow(
				"Project must be provided via the 'project' argument or AZURE_DEVOPS_PROJECT environment variable."
			);
		});

		it("should handle API error", async () => {
			vi.spyOn(global, "fetch").mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				text: () => Promise.resolve("Server error"),
			} as Response);

			await expect(
				createPipeline("error-pipeline", "repo-err")
			).rejects.toThrow();
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
								name: "existing-folder-pipeline",
								folder: "\\Existing",
							}),
					} as Response);
				}
				return Promise.reject(new Error("Unknown URL"));
			});

			const result = await createPipeline(
				"existing-folder-pipeline",
				"repo-1000",
				"azure-pipelines.yml",
				"\\Existing"
			);

			expect(result.pipelineId).toBe(1000);
			// Should still proceed to create pipeline
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});
	});

	describe("registerCreatePipelineTools", () => {
		it("should register create_pipeline tool", async () => {
			const mockServer = {
				registerTool: vi.fn(),
			};

			// @ts-expect-error - using mock server
			registerCreatePipelineTools(mockServer);

			expect(mockServer.registerTool).toHaveBeenCalledTimes(1);

			const registeredTools = mockServer.registerTool.mock.calls.map(
				(call) => call[0]
			);
			expect(registeredTools).toContain("create_pipeline");
		});

		it("should handler return correct format on success", async () => {
			const mockServer = {
				registerTool: vi.fn(),
			};

			// @ts-expect-error - using mock server
			registerCreatePipelineTools(mockServer);

			const createPipelineCall = mockServer.registerTool.mock.calls.find(
				(call) => call[0] === "create_pipeline"
			);
			expect(createPipelineCall).toBeDefined();

			if (!createPipelineCall)
				throw new Error("create_pipeline not registered");

			const handler = createPipelineCall[2];

			// Mock fetch for successful pipeline creation
			vi.spyOn(global, "fetch").mockResolvedValue({
				ok: true,
				status: 200,
				json: () =>
					Promise.resolve({
						id: 2000,
						name: "test-pipeline",
						folder: "\\",
						_links: { web: { href: "https://dev.azure.com/test/2000" } },
					}),
			} as Response);

			const result = await handler({
				name: "test-pipeline",
				repositoryId: "repo-2000",
				project: "test-project",
			});

			expect(result.content).toHaveLength(1);
			expect(result.content[0].type).toBe("text");
			expect(result.content[0].text).toContain("2000");
			expect(result.content[0].text).toContain("test-pipeline");
			expect(result.isError).toBeUndefined();
		});

		it("should handler return error format on failure", async () => {
			const mockServer = {
				registerTool: vi.fn(),
			};

			// @ts-expect-error - using mock server
			registerCreatePipelineTools(mockServer);

			const createPipelineCall = mockServer.registerTool.mock.calls.find(
				(call) => call[0] === "create_pipeline"
			);

			if (!createPipelineCall)
				throw new Error("create_pipeline not registered");

			const handler = createPipelineCall[2];

			// Mock fetch to fail
			vi.spyOn(global, "fetch").mockResolvedValue({
				ok: false,
				status: 400,
				statusText: "Bad Request",
				text: () => Promise.resolve("Invalid request"),
			} as Response);

			const result = await handler({
				name: "fail-pipeline",
				repositoryId: "repo-fail",
				project: "test-project",
			});

			expect(result.content).toHaveLength(1);
			expect(result.content[0].type).toBe("text");
			expect(result.content[0].text).toContain("error");
			expect(result.isError).toBe(true);
		});
	});
});
