import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AzureDevOpsClient } from "../../src/services/azure-devops-client.js";
import { resetDefaultHttpClient } from "../../src/services/http-client.js";

// Mock environment variables
const originalEnv = process.env;

describe("AzureDevOpsClient", () => {
	beforeEach(() => {
		process.env = { ...originalEnv };
		resetDefaultHttpClient();
		vi.restoreAllMocks();
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("should initialize with options", () => {
		const client = new AzureDevOpsClient({
			org: "test-org",
			pat: "test-pat",
		});
		expect(client).toBeDefined();
	});

	it("should initialize with environment variables", () => {
		process.env.AZURE_DEVOPS_ORG = "env-org";
		process.env.AZURE_DEVOPS_PAT = "env-pat";
		process.env.AZURE_DEVOPS_PROJECT = "env-project";

		const client = new AzureDevOpsClient();
		expect(client).toBeDefined();
	});

	it("should throw if config is missing", () => {
		process.env.AZURE_DEVOPS_ORG = "";
		process.env.AZURE_DEVOPS_PAT = "";

		expect(() => new AzureDevOpsClient()).toThrow();
	});

	it("should make GET request with correct headers and URL", async () => {
		const client = new AzureDevOpsClient({
			org: "test-org",
			pat: "test-pat",
			project: "test-project",
		});

		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: () => Promise.resolve(JSON.stringify({ value: "success" })),
		});
		global.fetch = mockFetch;

		const result = await client.get<{ value: string }>("builds");

		expect(result).toEqual({ value: "success" });
		expect(mockFetch).toHaveBeenCalledWith(
			"https://dev.azure.com/test-org/test-project/builds?api-version=7.1",
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: expect.stringContaining("Basic"),
					"Content-Type": "application/json",
				}),
			})
		);
	});

	it("should support dynamic project override", async () => {
		const client = new AzureDevOpsClient({
			org: "test-org",
			pat: "test-pat",
		}); // No default project

		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: () => Promise.resolve(JSON.stringify({ value: "success" })),
		});
		global.fetch = mockFetch;

		await client.get("builds", { project: "dynamic-project" });

		expect(mockFetch).toHaveBeenCalledWith(
			"https://dev.azure.com/test-org/dynamic-project/builds?api-version=7.1",
			expect.any(Object)
		);
	});

	it("should make POST request", async () => {
		const client = new AzureDevOpsClient({
			org: "test-org",
			pat: "test-pat",
		});

		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve({ success: true }),
		});
		global.fetch = mockFetch;

		const body = { foo: "bar" };
		const result = await client.post("pipelines/1/runs", body, {
			project: "my-project",
		});

		expect(result).toEqual({ success: true });
		expect(mockFetch).toHaveBeenCalledWith(
			"https://dev.azure.com/test-org/my-project/pipelines/1/runs?api-version=7.1",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify(body),
				headers: expect.objectContaining({
					Authorization: expect.stringContaining("Basic"),
				}),
			})
		);
	});
});
