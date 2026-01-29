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
	project?: string
): Promise<ValidationResult> {
	const client = new AzureDevOpsClient();

	const endpoint = `_apis/pipelines/${pipelineId}/preview`;
	const body = {
		previewRun: true,
		yamlOverride: yaml,
	};

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
			},
		},
		async ({ yaml, pipelineId, project }) => {
			const result = await validatePipelineYaml(yaml, pipelineId, project);

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
						"Path to the YAML file in the repository. Defaults to 'azure-pipelines.yml'"
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
 * Creates a folder in Azure DevOps if it doesn't exist.
 */
async function ensureFolderExists(
	client: AzureDevOpsClient,
	folderPath: string,
	project?: string
): Promise<void> {
	const endpoint = `_apis/build/folders/${encodeURIComponent(folderPath)}`;

	try {
		await client.put(
			endpoint,
			{ path: folderPath },
			{ project }
		);
	} catch (error) {
		// Folder might already exist, ignore 409 Conflict
		const message = error instanceof Error ? error.message : "";
		if (!message.includes("409")) {
			throw error;
		}
	}
}

/**
 * Creates a dummy pipeline for YAML validation.
 */
export async function createDummyPipeline(
	repositoryId: string,
	project?: string,
	yamlPath: string = "azure-pipelines.yml"
): Promise<CreateDummyPipelineResult> {
	const client = new AzureDevOpsClient();

	// Ensure folder exists
	await ensureFolderExists(client, DUMMY_PIPELINE_FOLDER, project);

	// Create the pipeline
	const endpoint = "_apis/pipelines";
	const body = {
		name: DUMMY_PIPELINE_NAME,
		folder: DUMMY_PIPELINE_FOLDER,
		configuration: {
			type: "yaml",
			path: yamlPath,
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
