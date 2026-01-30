import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AzureDevOpsClient } from "../services/azure-devops-client.js";

/**
 * Result of creating a pipeline.
 */
export interface CreatePipelineResult {
	pipelineId: number;
	name: string;
	folder: string;
	url: string;
}

/**
 * Azure DevOps Pipeline creation response.
 */
interface PipelineResponse {
	id: number;
	name: string;
	folder: string;
	_links?: {
		web?: { href: string };
	};
}

/**
 * Creates a YAML pipeline in Azure DevOps.
 * @param name Pipeline name
 * @param repositoryId Repository ID
 * @param yamlPath Path to the YAML file in the repository (default: "/azure-pipelines.yml")
 * @param folder Optional folder path (e.g., "\\CI\\Builds")
 * @param project Optional project name override
 */
export async function createPipeline(
	name: string,
	repositoryId: string,
	yamlPath: string = "/azure-pipelines.yml",
	folder?: string,
	project?: string
): Promise<CreatePipelineResult> {
	const client = new AzureDevOpsClient();

	if (!project && !client.getProject()) {
		throw new Error(
			"Project must be provided via the 'project' argument or AZURE_DEVOPS_PROJECT environment variable."
		);
	}

	// Normalize yamlPath to start with /
	let normalizedYamlPath = yamlPath.trim();
	if (!normalizedYamlPath.startsWith("/")) {
		normalizedYamlPath = "/" + normalizedYamlPath;
	}

	// Ensure folder exists if provided
	if (folder) {
		await client.ensureFolderExists(folder, project);
	}

	// Create the pipeline
	const endpoint = "_apis/pipelines";
	const body: {
		name: string;
		folder?: string;
		configuration: {
			type: string;
			path: string;
			repository: {
				id: string;
				type: string;
			};
		};
	} = {
		name,
		configuration: {
			type: "yaml",
			path: normalizedYamlPath,
			repository: {
				id: repositoryId,
				type: "azureReposGit",
			},
		},
	};

	// Add folder if provided
	if (folder) {
		body.folder = folder;
	}

	const response = await client.post<PipelineResponse>(endpoint, body, {
		project,
	});

	return {
		pipelineId: response.id,
		name: response.name,
		folder: response.folder,
		url: response._links?.web?.href ?? "",
	};
}

/**
 * Registers create_pipeline tool.
 */
export function registerCreatePipelineTools(server: McpServer): void {
	server.registerTool(
		"create_pipeline",
		{
			title: "Create Pipeline",
			description:
				"Creates a new YAML pipeline definition in Azure DevOps. " +
				"The pipeline is only created, not executed. " +
				"Returns the pipeline ID, name, folder, and web URL.",
			inputSchema: {
				name: z.string().describe("Name of the pipeline"),
				repositoryId: z
					.string()
					.describe(
						"ID of the repository. Use get_repositories tool to find the repository ID."
					),
				yamlPath: z
					.string()
					.optional()
					.describe(
						"Path to the YAML file in the repository. Defaults to '/azure-pipelines.yml'"
					),
				folder: z
					.string()
					.optional()
					.describe(
						"Optional folder path for the pipeline (e.g., '\\CI\\Builds'). " +
						"The folder will be created if it doesn't exist."
					),
				project: z
					.string()
					.optional()
					.describe(
						"Optional project name override. Uses default project from config if not provided."
					),
			},
		},
		async ({ name, repositoryId, yamlPath, folder, project }) => {
			try {
				const result = await createPipeline(
					name,
					repositoryId,
					yamlPath,
					folder,
					project
				);

				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(
								{
									error:
										error instanceof Error ? error.message : String(error),
								},
								null,
								2
							),
						},
					],
					isError: true,
				};
			}
		}
	);
}
