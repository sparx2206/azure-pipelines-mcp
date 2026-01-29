import { describe, it, expect, beforeEach } from "vitest";
import {
	parseTaskIndex,
	searchTasks,
	PipelineTask,
} from "../../src/tools/search-tasks.js";

// Sample markdown pro testování parseru
const SAMPLE_INDEX_MARKDOWN = `
# Azure Pipelines task reference

## Build tasks

| Task | Description |
|---|---|
| **.NET Core**<br>[DotNetCoreCLI@2](dotnet-core-cli-v2.md)<br>[DotNetCoreCLI@1](dotnet-core-cli-v1.md) | Build, test, package, or publish a .NET application. |
| **Docker**<br>[Docker@2](docker-v2.md)<br>[Docker@1](docker-v1.md) | Build or push Docker images. |
| **MSBuild**<br>[MSBuild@1](msbuild-v1.md) | Build with MSBuild. |

## Deploy tasks

| Task | Description |
|---|---|
| **Azure App Service deploy**<br>[AzureRmWebAppDeployment@4](azure-rm-web-app-deployment-v4.md) | Deploy to Azure App Service. |
| **Azure CLI**<br>[AzureCLI@2](azure-cli-v2.md) | Run Azure CLI commands. |

## Test tasks

| Task | Description |
|---|---|
| **Visual Studio Test**<br>[VSTest@2](vstest-v2.md) | Run unit and functional tests. |

## Utility tasks

| Task | Description |
|---|---|
| **Copy files**<br>[CopyFiles@2](copy-files-v2.md) | Copy files from a source folder to a target folder. |
`;

describe("parseTaskIndex", () => {
	it("parses markdown and extracts tasks correctly", () => {
		const tasks = parseTaskIndex(SAMPLE_INDEX_MARKDOWN);

		expect(tasks.length).toBeGreaterThan(0);
	});

	it("extracts correct task properties", () => {
		const tasks = parseTaskIndex(SAMPLE_INDEX_MARKDOWN);

		const dotnetTask = tasks.find((t) => t.name === "DotNetCoreCLI" && t.version === "2");
		expect(dotnetTask).toBeDefined();
		expect(dotnetTask!.displayName).toBe(".NET Core");
		expect(dotnetTask!.fullName).toBe("DotNetCoreCLI@2");
		expect(dotnetTask!.category).toBe("build");
		expect(dotnetTask!.documentationPath).toBe("dotnet-core-cli-v2.md");
		expect(dotnetTask!.description).toContain("Build, test, package");
	});

	it("assigns correct categories to tasks", () => {
		const tasks = parseTaskIndex(SAMPLE_INDEX_MARKDOWN);

		const buildTasks = tasks.filter((t) => t.category === "build");
		const deployTasks = tasks.filter((t) => t.category === "deploy");
		const testTasks = tasks.filter((t) => t.category === "test");
		const utilityTasks = tasks.filter((t) => t.category === "utility");

		expect(buildTasks.length).toBeGreaterThan(0);
		expect(deployTasks.length).toBeGreaterThan(0);
		expect(testTasks.length).toBeGreaterThan(0);
		expect(utilityTasks.length).toBeGreaterThan(0);
	});

	it("parses multiple versions of the same task", () => {
		const tasks = parseTaskIndex(SAMPLE_INDEX_MARKDOWN);

		const dockerV1 = tasks.find((t) => t.fullName === "Docker@1");
		const dockerV2 = tasks.find((t) => t.fullName === "Docker@2");

		expect(dockerV1).toBeDefined();
		expect(dockerV2).toBeDefined();
		expect(dockerV1!.name).toBe("Docker");
		expect(dockerV2!.name).toBe("Docker");
	});

	it("returns empty array for empty markdown", () => {
		const tasks = parseTaskIndex("");
		expect(tasks).toEqual([]);
	});

	it("returns empty array for markdown without tasks", () => {
		const tasks = parseTaskIndex("# Some other content\n\nNo tasks here.");
		expect(tasks).toEqual([]);
	});

	it("deduplicates tasks when they appear multiple times", () => {
		const DUPLICATE_MARKDOWN = `
## Build tasks

| Task | Description |
|---|---|
| **Bash**<br>[Bash@3](bash-v3.md) | Run a Bash script. |

## Build tasks

| Task | Description |
|---|---|
| **Bash**<br>[Bash@3](bash-v3.md) | Run a Bash script. |
`;
		const tasks = parseTaskIndex(DUPLICATE_MARKDOWN);
		const bashTasks = tasks.filter(t => t.fullName === "Bash@3");
		expect(bashTasks.length).toBe(1);
	});
});

describe("searchTasks", () => {
	let sampleTasks: PipelineTask[];

	beforeEach(() => {
		sampleTasks = parseTaskIndex(SAMPLE_INDEX_MARKDOWN);
	});

	it("finds tasks by name (case-insensitive)", () => {
		const results = searchTasks(sampleTasks, "docker");

		expect(results.length).toBeGreaterThan(0);
		expect(results.every((t) => t.name.toLowerCase().includes("docker"))).toBe(true);
	});

	it("finds tasks by display name", () => {
		const results = searchTasks(sampleTasks, ".NET Core");

		expect(results.length).toBeGreaterThan(0);
		expect(results.some((t) => t.displayName === ".NET Core")).toBe(true);
	});

	it("finds tasks by description", () => {
		const results = searchTasks(sampleTasks, "publish");

		expect(results.length).toBeGreaterThan(0);
	});

	it("finds tasks by fullName", () => {
		const results = searchTasks(sampleTasks, "DotNetCoreCLI@2");

		expect(results.length).toBe(1);
		expect(results[0].fullName).toBe("DotNetCoreCLI@2");
	});

	it("filters by category", () => {
		const results = searchTasks(sampleTasks, "azure", "deploy");

		expect(results.length).toBeGreaterThan(0);
		expect(results.every((t) => t.category === "deploy")).toBe(true);
	});

	it("returns empty array when no match", () => {
		const results = searchTasks(sampleTasks, "nonexistent12345");

		expect(results).toEqual([]);
	});

	it("returns empty array when category does not match", () => {
		const results = searchTasks(sampleTasks, "docker", "deploy");

		expect(results).toEqual([]);
	});

	it("is case-insensitive for query", () => {
		const resultsLower = searchTasks(sampleTasks, "docker");
		const resultsUpper = searchTasks(sampleTasks, "DOCKER");
		const resultsMixed = searchTasks(sampleTasks, "Docker");

		expect(resultsLower.length).toBe(resultsUpper.length);
		expect(resultsLower.length).toBe(resultsMixed.length);
	});
});
