import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getRepositories, registerRepositoryTools } from "../../src/tools/repositories.js";
import { getDefaultCache } from "../../src/services/cache.js";

// Mock environment variables
const originalEnv = process.env;

describe("repositories", () => {
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

	describe("getRepositories", () => {
		it("should return a list of repositories on success", async () => {
			const mockResponseData = {
				value: [
					{
						id: "repo-1",
						name: "Repo 1",
						webUrl: "https://dev.azure.com/test-org/test-project/_git/Repo%201",
						defaultBranch: "refs/heads/main"
					},
					{
						id: "repo-2",
						name: "Repo 2",
						webUrl: "https://dev.azure.com/test-org/test-project/_git/Repo%202",
						defaultBranch: "refs/heads/develop"
					}
				]
			};

			vi.spyOn(global, "fetch").mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve(mockResponseData),
				text: () => Promise.resolve(JSON.stringify(mockResponseData)),
			} as Response);

			const result = await getRepositories("test-project");

			expect(result).toHaveLength(2);
			expect(result[0].id).toBe("repo-1");
			expect(result[0].name).toBe("Repo 1");
			expect(result[0].defaultBranch).toBe("refs/heads/main");
		});

		it("should use default project if none provided", async () => {
			const mockResponseData = { value: [] };
			const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve(mockResponseData),
				text: () => Promise.resolve(JSON.stringify(mockResponseData)),
			} as Response);

			await getRepositories();

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("/test-project/_apis/git/repositories"),
				expect.any(Object)
			);
		});

		it("should throw error on API failure", async () => {
			vi.spyOn(global, "fetch").mockResolvedValue({
				ok: false,
				status: 404,
				statusText: "Not Found",
				text: () => Promise.resolve("Project not found"),
			} as Response);

			await expect(getRepositories("invalid-project")).rejects.toThrow("Resource not found");
		});
	});

	describe("registerRepositoryTools", () => {
		it("should register get_repositories tool", () => {
			const mockServer = {
				registerTool: vi.fn(),
			};

			// @ts-expect-error - using mock server
			registerRepositoryTools(mockServer);

			expect(mockServer.registerTool).toHaveBeenCalledWith(
				"get_repositories",
				expect.any(Object),
				expect.any(Function)
			);
		});

		it("handler should return formatted JSON", async () => {
			const mockServer = {
				registerTool: vi.fn(),
			};

			// @ts-expect-error - using mock server
			registerRepositoryTools(mockServer);

			const handler = mockServer.registerTool.mock.calls[0][2];

			const mockResponseData = {
				value: [
					{
						id: "repo-1",
						name: "Repo 1",
						webUrl: "url1"
					}
				]
			};

			vi.spyOn(global, "fetch").mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.resolve(mockResponseData),
				text: () => Promise.resolve(JSON.stringify(mockResponseData)),
			} as Response);

			const result = await handler({ project: "test-project" });
			
			expect(result.content[0].type).toBe("text");
			const parsed = JSON.parse(result.content[0].text);
			expect(parsed[0].id).toBe("repo-1");
		});

		it("handler should handle errors and return isError: true", async () => {
			const mockServer = {
				registerTool: vi.fn(),
			};

			// @ts-expect-error - using mock server
			registerRepositoryTools(mockServer);

			const handler = mockServer.registerTool.mock.calls[0][2];

			vi.spyOn(global, "fetch").mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Server Error",
				text: () => Promise.resolve("Error message"),
			} as Response);

			const result = await handler({ project: "test-project" });
			
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("HTTP 500: Server Error");
		});
	});
});
