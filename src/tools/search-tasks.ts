/**
 * Tool pro vyhledávání Azure Pipelines tasků.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDefaultHttpClient, NotFoundError } from "../services/http-client.js";
import { AzureDevOpsClient, TaskDefinition } from "../services/azure-devops-client.js";

// URL pro index.md s task referencí
export const TASK_INDEX_URL =
	"https://raw.githubusercontent.com/MicrosoftDocs/azure-devops-yaml-schema/main/task-reference/index.md";

// Kategorie tasků
const TASK_CATEGORIES = [
	"build",
	"deploy",
	"package",
	"test",
	"tool",
	"utility",
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export interface PipelineTask {
	name: string; // např. "DotNetCoreCLI"
	displayName: string; // např. ".NET Core"
	version: string; // např. "2"
	fullName: string; // např. "DotNetCoreCLI@2"
	description: string;
	category: TaskCategory;
	documentationPath: string; // např. "dotnet-core-cli-v2.md"
}

export interface SearchTasksResult {
	tasks: PipelineTask[];
	totalCount: number;
	query: string;
	category?: TaskCategory;
	source: "azure-devops-api" | "public-docs";
}

/**
 * Mapování názvů kategorií z markdown na naše typy.
 */
const CATEGORY_MAPPING: Record<string, TaskCategory> = {
	"build tasks": "build",
	"deploy tasks": "deploy",
	"package tasks": "package",
	"test tasks": "test",
	"tool tasks": "tool",
	"utility tasks": "utility",
	"build": "build",
	"deploy": "deploy",
	"package": "package",
	"test": "test",
	"tool": "tool",
	"utility": "utility"
};

/**
 * Parsuje index.md a extrahuje seznam tasků.
 */
export function parseTaskIndex(markdown: string): PipelineTask[] {
	const tasksMap = new Map<string, PipelineTask>();
	let currentCategory: TaskCategory | null = null;

	const lines = markdown.split("\n");

	for (const line of lines) {
		// Detekce kategorie (## Build tasks, ## Deploy tasks, atd.)
		const categoryMatch = line.match(/^##\s+(.+?)\s*$/i);
		if (categoryMatch) {
			const categoryName = categoryMatch[1].toLowerCase();
			currentCategory = CATEGORY_MAPPING[categoryName] ?? null;
			continue;
		}

		// Přeskočit pokud nemáme kategorii
		if (!currentCategory) continue;

		// Parsování řádku tabulky s tasky
		// Formát: | **Display Name**<br>[Task@V1](f1.md)<br>[Task@V2](f2.md) | Description |

		// Nejdřív zkontrolujeme, jestli je to řádek tabulky s tasky
		const tableRowMatch = line.match(/^\|\s*\*\*(.+?)\*\*.*?\|(.+?)\|$/);
		if (!tableRowMatch) continue;

		const displayName = tableRowMatch[1].trim();
		const description = tableRowMatch[2].trim();

		// Najdeme všechny [TaskName@Version](file.md) v řádku
		const taskLinkRegex = /\[([A-Za-z0-9_-]+@\d+)\]\(([^)]+)\)/g;
		let linkMatch: RegExpExecArray | null;

		while ((linkMatch = taskLinkRegex.exec(line)) !== null) {
			const fullName = linkMatch[1];
			const docPath = linkMatch[2];

			// Parsování fullName na name a version
			const nameVersionMatch = fullName.match(/^([A-Za-z0-9_-]+)@(\d+)$/);
			if (nameVersionMatch) {
				const [, name, version] = nameVersionMatch;

				const key = `${fullName}-${currentCategory}`;
				if (!tasksMap.has(key)) {
					tasksMap.set(key, {
						name,
						displayName,
						version,
						fullName,
						description,
						category: currentCategory,
						documentationPath: docPath,
					});
				}
			}
		}
	}

	return Array.from(tasksMap.values());
}

/**
 * Konvertuje TaskDefinition z API na PipelineTask.
 */
function convertApiTaskToPipelineTask(apiTask: TaskDefinition): PipelineTask {
	const category = (apiTask.category && CATEGORY_MAPPING[apiTask.category.toLowerCase()]) || "utility";
	const version = `${apiTask.version.major}`;
	
	return {
		name: apiTask.name,
		displayName: apiTask.friendlyName,
		version: version,
		fullName: `${apiTask.name}@${version}`,
		description: apiTask.description,
		category: category,
		// Konstrukce URL pro dokumentaci - best effort pro built-in tasky
		documentationPath: `https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/${apiTask.name.toLowerCase()}-v${version}`
	};
}

/**
 * Vyhledá tasky podle query a volitelné kategorie.
 */
export function searchTasks(
	tasks: PipelineTask[],
	query: string,
	category?: TaskCategory
): PipelineTask[] {
	const lowerQuery = query.toLowerCase();

	return tasks.filter((task) => {
		// Filtrování podle kategorie
		if (category && task.category !== category) {
			return false;
		}

		// Case-insensitive hledání v name, displayName a description
		return (
			task.name.toLowerCase().includes(lowerQuery) ||
			task.displayName.toLowerCase().includes(lowerQuery) ||
			task.description.toLowerCase().includes(lowerQuery) ||
			task.fullName.toLowerCase().includes(lowerQuery)
		);
	});
}

/**
 * Handler pro search_pipeline_tasks tool.
 */
export async function handleSearchPipelineTasks(
	query: string,
	category?: TaskCategory
): Promise<string> {
	// 1. Zkusíme použít Azure DevOps API, pokud máme konfiguraci
	try {
		const client = new AzureDevOpsClient();
		const apiTasks = await client.getTaskDefinitions();
		const pipelineTasks = apiTasks.map(convertApiTaskToPipelineTask);
		const matchedTasks = searchTasks(pipelineTasks, query, category);

		const result: SearchTasksResult = {
			tasks: matchedTasks,
			totalCount: matchedTasks.length,
			query,
			category,
			source: "azure-devops-api"
		};

		return JSON.stringify(result, null, 2);
	} catch (error) {
		// Pokud se nepodaří připojit k API (chybí config nebo chyba sítě), fallback na veřejné dokumentace
		// Ignorujeme chybu konfigurace, ale ostatní chyby můžeme logovat
		if (!(error instanceof Error && error.message.includes("Organization and Personal Access Token must be provided"))) {
			// console.error("Failed to fetch tasks from Azure DevOps API, falling back to public docs:", error);
		}
	}

	// 2. Fallback na veřejné dokumentace
	const httpClient = getDefaultHttpClient();

	try {
		const markdown = await httpClient.fetch(TASK_INDEX_URL);
		const allTasks = parseTaskIndex(markdown);
		const matchedTasks = searchTasks(allTasks, query, category);

		const result: SearchTasksResult = {
			tasks: matchedTasks,
			totalCount: matchedTasks.length,
			query,
			category,
			source: "public-docs"
		};

		return JSON.stringify(result, null, 2);
	} catch (error) {
		if (error instanceof NotFoundError) {
			return JSON.stringify({
				error: "Task index not found. The documentation source may be unavailable.",
				url: TASK_INDEX_URL,
			});
		}

		throw error;
	}
}

/**
 * Registruje search_pipeline_tasks tool na MCP server.
 */
export function registerSearchTasksTools(server: McpServer): void {
	server.registerTool(
		"search_pipeline_tasks",
		{
			title: "Search Pipeline Tasks",
			description:
				"Search for Azure Pipelines tasks by name, keyword, or description. Returns matching tasks with their versions, categories, and documentation links.",
			inputSchema: {
				query: z
					.string()
					.describe("Search query - matches against task name, display name, and description."),
				category: z
					.enum(TASK_CATEGORIES)
					.optional()
					.describe(
						"Optional category filter: build, deploy, package, test, tool, or utility."
					),
			},
		},
		async ({ query, category }) => {
			return {
				content: [
					{
						type: "text" as const,
						text: await handleSearchPipelineTasks(query, category),
					},
				],
			};
		}
	);
}
