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
}
