import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AzureDevOpsClient } from "../services/azure-devops-client.js";

/**
 * Výsledek validace pipeline YAML.
 */
export interface ValidationResult {
	valid: boolean;
	errors?: Array<{ line?: number; message: string }>;
	expandedYaml?: string;
}

/**
 * Odpověď z Azure DevOps Preview API při úspěchu.
 */
interface PreviewResponse {
	finalYaml?: string;
}

/**
 * Parsuje chybové zprávy z Azure DevOps API odpovědi.
 * Formát chyb bývá: "Line X, Column Y: Error message"
 */
export function parseValidationErrors(
	errorMessage: string
): Array<{ line?: number; message: string }> {
	const errors: Array<{ line?: number; message: string }> = [];
	const lines = errorMessage.split("\n");

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		// Pokus o parsování formátu "Line X, Column Y: message"
		const match = trimmed.match(/^Line\s+(\d+)/i);
		if (match) {
			errors.push({
				line: parseInt(match[1], 10),
				message: trimmed,
			});
		} else {
			errors.push({ message: trimmed });
		}
	}

	return errors.length > 0 ? errors : [{ message: errorMessage }];
}

/**
 * Validuje pipeline YAML přes Azure DevOps Preview API.
 */
export async function validatePipelineYaml(
	yaml: string,
	pipelineId: number,
	project?: string,
	branch?: string
): Promise<ValidationResult> {
	const client = new AzureDevOpsClient();
	
	// Ensure project is available (either from args or config)
	if (!project && !client.getProject()) {
		return {
			valid: false,
			errors: [{ 
				message: "Project must be provided via the 'project' argument or AZURE_DEVOPS_PROJECT environment variable for pipeline validation." 
			}],
		};
	}

	// Preview API needs specific api-version to work reliably
	const endpoint = `_apis/pipelines/${pipelineId}/preview?api-version=7.1-preview.1`;
	
	const body: {
		previewRun: boolean;
		yamlOverride: string;
		resources?: {
			repositories: {
				self: {
					refName: string;
				};
			};
		};
	} = {
		previewRun: true,
		yamlOverride: yaml,
	};

	if (branch) {
		const refName = branch.startsWith("refs/") ? branch : `refs/heads/${branch}`;
		body.resources = {
			repositories: {
				self: {
					refName
				}
			}
		};
	}

	try {
		const response = await client.post<PreviewResponse>(endpoint, body, {
			project,
		});

		return {
			valid: true,
			expandedYaml: response.finalYaml,
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown validation error";

		return {
			valid: false,
			errors: parseValidationErrors(message),
		};
	}
}

/**
 * Registruje validate_pipeline_yaml tool.
 */
export function registerValidatePipelineTools(server: McpServer): void {
	server.registerTool(
		"validate_pipeline_yaml",
		{
			title: "Validate Pipeline YAML",
			description:
				"Validates Azure Pipelines YAML content using the Azure DevOps Preview API. " +
				"Requires a pipelineId of an existing pipeline as context. " +
				"Returns validation result with errors (if any) or the expanded YAML on success.",
			inputSchema: {
				yaml: z
					.string()
					.describe("The complete YAML content of the pipeline to validate"),
				pipelineId: z
					.number()
					.describe(
						"ID of an existing pipeline to use as context for validation. " +
						"Use get_dummy_pipeline tool to find or create a validation pipeline."
					),
				project: z
					.string()
					.optional()
					.describe(
						"Optional project name override. Uses default project from config if not provided."
					),
				branch: z
					.string()
					.optional()
					.describe(
						"Optional branch name to validate against (e.g. 'main', 'feature/123'). " +
						"Useful when the pipeline relies on templates or variables from a specific branch."
					),
			},
		},
		async ({ yaml, pipelineId, project, branch }) => {
			const result = await validatePipelineYaml(yaml, pipelineId, project, branch);

			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		}
	);

	// create_dummy_pipeline tool
	server.registerTool(
		"create_dummy_pipeline",
		{
			title: "Create Dummy Pipeline",
			description:
				"Creates a dummy pipeline in Azure DevOps for YAML validation purposes. " +
				"The pipeline is created in the \\AI\\DummyValidationPipeline folder with a predictable name. " +
				"Use this when get_dummy_pipeline returns no existing pipeline.",
			inputSchema: {
				repositoryId: z
					.string()
					.describe("The ID of the repository to create the pipeline in"),
				project: z
					.string()
					.optional()
					.describe(
						"Optional project name override. Uses default project from config if not provided."
					),
				yamlPath: z
					.string()
					.optional()
					.describe(
						"Path to the YAML file in the repository. Defaults to '/azure-pipelines.yml'"
					),
			},
		},
		async ({ repositoryId, project, yamlPath }) => {
			const result = await createDummyPipeline(
				repositoryId,
				project,
				yamlPath
			);

			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		}
	);

	// get_dummy_pipeline tool
	server.registerTool(
		"get_dummy_pipeline",
		{
			title: "Get Dummy Pipeline",
			description:
				"Finds an existing dummy pipeline in Azure DevOps for YAML validation. " +
				"Searches for a pipeline named 'DummyValidationPipeline' in the \\AI\\DummyValidationPipeline folder. " +
				"If not found, use create_dummy_pipeline to create one.",
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
			const result = await getDummyPipeline(project);

			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		}
	);
}

// Constants for dummy pipeline
const DUMMY_PIPELINE_FOLDER = "\\AI\\DummyValidationPipeline";
const DUMMY_PIPELINE_NAME = "DummyValidationPipeline";

/**
 * Result of creating a dummy pipeline.
 */
export interface CreateDummyPipelineResult {
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
 * Creates a dummy pipeline for YAML validation.
 */
export async function createDummyPipeline(
	repositoryId: string,
	project?: string,
	yamlPath: string = "/azure-pipelines.yml"
): Promise<CreateDummyPipelineResult> {
	const client = new AzureDevOpsClient();

	if (!project && !client.getProject()) {
		throw new Error("Project must be provided via the 'project' argument or AZURE_DEVOPS_PROJECT environment variable.");
	}

	// Normalize yamlPath to start with /
	let normalizedYamlPath = yamlPath.trim();
	if (!normalizedYamlPath.startsWith("/")) {
		normalizedYamlPath = "/" + normalizedYamlPath;
	}

	// Ensure folder exists
	await client.ensureFolderExists(DUMMY_PIPELINE_FOLDER, project);

	// Create the pipeline
	const endpoint = "_apis/pipelines";
	const body = {
		name: DUMMY_PIPELINE_NAME,
		folder: DUMMY_PIPELINE_FOLDER,
		configuration: {
			type: "yaml",
			path: normalizedYamlPath,
			repository: {
				id: repositoryId,
				type: "azureReposGit",
			},
		},
	};

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
 * Result of searching for a dummy pipeline.
 */
export interface GetDummyPipelineResult {
	found: boolean;
	pipelineId?: number;
	name?: string;
	folder?: string;
}

/**
 * Azure DevOps Pipelines list response.
 */
interface PipelinesListResponse {
	value: Array<{
		id: number;
		name: string;
		folder: string;
	}>;
}

/**
 * Finds an existing dummy pipeline for YAML validation.
 */
export async function getDummyPipeline(
	project?: string
): Promise<GetDummyPipelineResult> {
	const client = new AzureDevOpsClient();

	if (!project && !client.getProject()) {
		return { found: false }; // Cannot search without project
	}

	const endpoint = "_apis/pipelines";

	try {
		const response = await client.get<PipelinesListResponse>(endpoint, {
			project,
		});

		// Find pipeline matching our naming convention
		const dummyPipeline = response.value.find(
			(p) =>
				p.name === DUMMY_PIPELINE_NAME &&
				p.folder === DUMMY_PIPELINE_FOLDER
		);

		if (dummyPipeline) {
			return {
				found: true,
				pipelineId: dummyPipeline.id,
				name: dummyPipeline.name,
				folder: dummyPipeline.folder,
			};
		}

		return { found: false };
	} catch {
		return { found: false };
	}
}
