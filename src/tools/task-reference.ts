/**
 * Tool pro získání detailní reference Azure Pipelines tasku.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDefaultHttpClient, NotFoundError } from "../services/http-client.js";
import { TASK_INDEX_URL, parseTaskIndex, type PipelineTask } from "./search-tasks.js";

const TASK_REFERENCE_BASE_URL =
	"https://raw.githubusercontent.com/MicrosoftDocs/azure-devops-yaml-schema/main/task-reference/";

// Task reference se mění zřídka — cache na 24 hodin
const TASK_REFERENCE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface TaskInput {
	name: string;
	label: string;
	type: string;
	required: boolean;
	defaultValue?: string;
	allowedValues?: string[];
	aliases?: string[];
	helpText?: string;
}

export interface TaskReference {
	name: string;
	version: string;
	fullName: string;
	description: string;
	syntax?: string;
	inputs: TaskInput[];
	outputVariables: string[];
	remarks?: string;
	examples?: string;
}

/**
 * Extrahuje popis tasku z front matter nebo description sekce.
 */
export function parseDescription(markdown: string): string {
	// Zkusíme front matter (description: ...)
	const frontMatterMatch = markdown.match(
		/^---\s*\n[\s\S]*?description:\s*(.+?)\s*\n[\s\S]*?---/
	);
	if (frontMatterMatch) {
		return frontMatterMatch[1].trim();
	}

	// Fallback: editable-content description
	const editableMatch = markdown.match(
		/<!-- :::editable-content name="description"::: -->\s*\n([\s\S]*?)\n\s*<!-- :::editable-content-end::: -->/
	);
	if (editableMatch) {
		return editableMatch[1].trim();
	}

	return "";
}

/**
 * Extrahuje první YAML syntax blok ze syntax sekce.
 */
export function parseSyntax(markdown: string): string | undefined {
	const syntaxSection = markdown.match(
		/<!-- :::syntax::: -->([\s\S]*?)<!-- :::syntax-end::: -->/
	);
	if (!syntaxSection) return undefined;

	// Najdeme první YAML code block v syntax sekci
	const yamlMatch = syntaxSection[1].match(/```yaml\s*\n([\s\S]*?)```/);
	if (!yamlMatch) return undefined;

	return yamlMatch[1].trim();
}

/**
 * Parsuje jeden input blok z markdown.
 */
export function parseInputBlock(block: string): TaskInput | null {
	// Název inputu z item komentáře
	const nameMatch = block.match(/<!-- :::item name="([^"]+)"::: -->/);
	if (!nameMatch) return null;

	const name = nameMatch[1];

	// Label z bold formátu: **`name`** - **Label**
	const labelMatch = block.match(
		/\*\*`[^`]+`\*\*\s*-\s*\*\*([^*]+)\*\*/
	);
	const label = labelMatch ? labelMatch[1].trim() : name;

	// Typ a metadata z řádku s type info
	const typeLineMatch = block.match(
		/`(string|boolean|int|filePath|multiLine|secureFile|identities|radio|pickList|queryControl)`/
	);
	const type = typeLineMatch ? typeLineMatch[1] : "string";

	// Required
	const required = /\.\s*Required\b/.test(block);

	// Default value
	const defaultMatch = block.match(/Default value:\s*`([^`]*)`/);
	const defaultFromInline = block.match(/Default:\s*`?([^`.]+)`?\./);
	const defaultValue = defaultMatch
		? defaultMatch[1]
		: defaultFromInline
			? defaultFromInline[1].trim()
			: undefined;

	// Allowed values
	const allowedMatch = block.match(
		/Allowed values:\s*`([^`]+(?:`\s*,\s*`[^`]+)*)`/
	);
	let allowedValues: string[] | undefined;
	if (allowedMatch) {
		allowedValues = allowedMatch[0]
			.match(/`([^`]+)`/g)
			?.map((v) => v.replace(/`/g, ""));
	} else {
		// Alternativní formát: 'value1' | 'value2' | ...
		const pipeMatch = block.match(
			/`'([^']+)'(?:\s*\|\s*'([^']+)')+`/
		);
		if (pipeMatch) {
			allowedValues = pipeMatch[0]
				.match(/'([^']+)'/g)
				?.map((v) => v.replace(/'/g, ""));
		}
	}

	// Aliases
	const aliasMatch = block.match(
		/\[Input alias\].*?:\s*`([^`]+)`/
	);
	const aliases = aliasMatch ? [aliasMatch[1]] : undefined;

	// Help text z editable-content helpMarkDown
	const helpMatch = block.match(
		/<!-- :::editable-content name="helpMarkDown"::: -->\s*\n([\s\S]*?)\n\s*<!-- :::editable-content-end::: -->/
	);
	let helpText: string | undefined;
	if (helpMatch) {
		const text = helpMatch[1].trim();
		if (text.length > 0) {
			helpText = text;
		}
	}

	return {
		name,
		label,
		type,
		required,
		...(defaultValue !== undefined && { defaultValue }),
		...(allowedValues && { allowedValues }),
		...(aliases && { aliases }),
		...(helpText && { helpText }),
	};
}

/**
 * Parsuje vstupy tasku z inputs sekce.
 */
export function parseInputs(markdown: string): TaskInput[] {
	const inputsSection = markdown.match(
		/<!-- :::inputs::: -->([\s\S]*?)<!-- :::inputs-end::: -->/
	);
	if (!inputsSection) return [];

	const inputs: TaskInput[] = [];

	// Rozdělíme na bloky podle <!-- :::item name="..." ::: -->
	const itemBlocks = inputsSection[1].split(/(?=<!-- :::item name=")/);

	for (const block of itemBlocks) {
		if (!block.includes(":::item name=")) continue;

		const input = parseInputBlock(block);
		if (input) {
			inputs.push(input);
		}
	}

	return inputs;
}

/**
 * Parsuje output variables z outputVariables sekce.
 */
export function parseOutputVariables(markdown: string): string[] {
	const outputSection = markdown.match(
		/<!-- :::outputVariables::: -->([\s\S]*?)<!-- :::outputVariables-end::: -->/
	);
	if (!outputSection) return [];

	const variables: string[] = [];
	const varRegex = /<!-- :::item name="([^"]+)"::: -->/g;
	let match;

	while ((match = varRegex.exec(outputSection[1])) !== null) {
		variables.push(match[1]);
	}

	return variables;
}

/**
 * Extrahuje remarks sekci.
 */
export function parseRemarks(markdown: string): string | undefined {
	const remarksSection = markdown.match(
		/<!-- :::remarks::: -->([\s\S]*?)<!-- :::remarks-end::: -->/
	);
	if (!remarksSection) return undefined;

	// Odstraníme moniker tagy a editable-content wrappery
	let content = remarksSection[1]
		.replace(/^:::moniker.*$/gm, "")
		.replace(/<!-- :::editable-content[^>]*-->/g, "")
		.replace(/<!-- :::editable-content-end::: -->/g, "")
		.trim();

	// Odstraníme ## Remarks heading
	content = content.replace(/^##\s*Remarks\s*\n*/i, "").trim();

	return content.length > 0 ? content : undefined;
}

/**
 * Extrahuje examples sekci.
 */
export function parseExamples(markdown: string): string | undefined {
	const examplesSection = markdown.match(
		/<!-- :::examples::: -->([\s\S]*?)<!-- :::examples-end::: -->/
	);
	if (!examplesSection) return undefined;

	let content = examplesSection[1]
		.replace(/^:::moniker.*$/gm, "")
		.replace(/<!-- :::editable-content[^>]*-->/g, "")
		.replace(/<!-- :::editable-content-end::: -->/g, "")
		.trim();

	// Odstraníme ## Examples heading
	content = content.replace(/^##\s*Examples\s*\n*/i, "").trim();

	return content.length > 0 ? content : undefined;
}

/**
 * Kompletní parsování markdown dokumentace tasku.
 */
export function parseTaskMarkdown(
	markdown: string,
	name: string,
	version: string
): TaskReference {
	return {
		name,
		version,
		fullName: `${name}@${version}`,
		description: parseDescription(markdown),
		syntax: parseSyntax(markdown),
		inputs: parseInputs(markdown),
		outputVariables: parseOutputVariables(markdown),
		remarks: parseRemarks(markdown),
		examples: parseExamples(markdown),
	};
}

/**
 * Najde task v indexu podle fullName.
 */
async function findTaskInIndex(fullName: string): Promise<PipelineTask | null> {
	const httpClient = getDefaultHttpClient();
	const indexMarkdown = await httpClient.fetch(TASK_INDEX_URL);
	const allTasks = parseTaskIndex(indexMarkdown);

	return allTasks.find((t) => t.fullName.toLowerCase() === fullName.toLowerCase()) ?? null;
}

/**
 * Handler pro get_task_reference tool.
 */
export async function handleGetTaskReference(taskName: string): Promise<string> {
	// Validace formátu TaskName@Version
	const taskMatch = taskName.match(/^([A-Za-z0-9_-]+)@(\d+)$/);
	if (!taskMatch) {
		return JSON.stringify({
			error: `Invalid task format '${taskName}'. Expected format: TaskName@Version (e.g., DotNetCoreCLI@2)`,
		});
	}

	const [, name, version] = taskMatch;
	const httpClient = getDefaultHttpClient();

	// Najdeme task v indexu pro documentationPath
	let taskInfo: PipelineTask | null;
	try {
		taskInfo = await findTaskInIndex(taskName);
	} catch (error) {
		if (error instanceof NotFoundError) {
			return JSON.stringify({
				error: "Task index not found. The documentation source may be unavailable.",
				url: TASK_INDEX_URL,
			});
		}
		throw error;
	}

	if (!taskInfo) {
		return JSON.stringify({
			error: `Task '${taskName}' not found. Use search_pipeline_tasks to find available tasks.`,
		});
	}

	// Fetchneme dokumentaci
	const docUrl = `${TASK_REFERENCE_BASE_URL}${taskInfo.documentationPath}`;
	try {
		const markdown = await httpClient.fetch(docUrl, { cacheTtlMs: TASK_REFERENCE_CACHE_TTL_MS });
		const reference = parseTaskMarkdown(markdown, name, version);
		return JSON.stringify(reference, null, 2);
	} catch (error) {
		if (error instanceof NotFoundError) {
			return JSON.stringify({
				error: `Documentation for task '${taskName}' not found.`,
				url: docUrl,
			});
		}
		throw error;
	}
}

/**
 * Registruje get_task_reference tool na MCP server.
 */
export function registerTaskReferenceTools(server: McpServer): void {
	server.registerTool(
		"get_task_reference",
		{
			title: "Get Task Reference",
			description:
				"Get detailed reference documentation for a specific Azure Pipelines task — inputs, syntax, output variables, and examples. Use search_pipeline_tasks first to find the correct task name.",
			inputSchema: {
				taskName: z
					.string()
					.describe(
						"Task name with version in format TaskName@Version (e.g., DotNetCoreCLI@2, Docker@2)."
					),
			},
		},
		async ({ taskName }) => {
			return {
				content: [
					{
						type: "text" as const,
						text: await handleGetTaskReference(taskName),
					},
				],
			};
		}
	);
}
