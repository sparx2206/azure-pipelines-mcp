import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AzureDevOpsClient } from "../services/azure-devops-client.js";

/**
 * Repository information.
 */
export interface RepositoryInfo {
	id: string;
	name: string;
	url: string;
	defaultBranch?: string;
}

/**
 * Azure DevOps Repositories list response.
 */
interface RepositoriesListResponse {
	value: Array<{
		id: string;
		name: string;
		webUrl: string;
		defaultBranch?: string;
	}>;
}

/**
 * Fetches the list of repositories from Azure DevOps.
 */
export async function getRepositories(
	project?: string
): Promise<RepositoryInfo[]> {
	const client = new AzureDevOpsClient();

	const endpoint = "_apis/git/repositories";

	try {
		const response = await client.get<RepositoriesListResponse>(endpoint, {
			project,
		});

		return response.value.map((repo) => ({
			id: repo.id,
			name: repo.name,
			url: repo.webUrl,
			defaultBranch: repo.defaultBranch,
		}));
	} catch (error) {
		const baseMessage =
			error instanceof Error
				? error.message
				: error != null
					? String(error)
					: "Unknown error";
		throw new Error(`Failed to fetch Azure DevOps repositories: ${baseMessage}`);
	}
}

/**
 * Registers get_repositories tool.
 */
export function registerRepositoryTools(server: McpServer): void {
	server.registerTool(
		"get_repositories",
		{
			title: "Get Repositories",
			description:
				"Retrieves a list of Git repositories in an Azure DevOps project. " +
				"Returns the repository name and ID, which are needed for other tools like create_dummy_pipeline.",
			inputSchema: {
				project: z
					.string()
					.optional()
					.describe(
						"Optional project name override. Uses default project from config if not provided."
					),
			},
		},
		async ({ project }) => {
			try {
				const repositories = await getRepositories(project);

				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(repositories, null, 2),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify({
								error: error instanceof Error ? error.message : String(error)
							}, null, 2),
						},
					],
					isError: true
				};
			}
		}
	);
}
