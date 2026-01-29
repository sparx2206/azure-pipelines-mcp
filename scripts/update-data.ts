import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../src/data");

// --- Schemas ---

const ExpressionFunctionSchema = z.object({
	name: z.string(),
	signature: z.string(),
	description: z.string(),
	example: z.string().optional(),
});

const ExpressionCategorySchema = z.object({
	title: z.string(),
	description: z.string().optional(),
	functions: z.array(ExpressionFunctionSchema).optional(),
	syntax: z.array(z.any()).optional(),
	rules: z.array(z.any()).optional(),
});

const ExpressionsSchema = z.object({
	description: z.string(),
	syntaxVariants: z.record(z.any()),
	categories: z.record(ExpressionCategorySchema),
	contexts: z.record(z.any()),
});

const VariableSchema = z.object({
	name: z.string(),
	description: z.string(),
	example: z.string().optional(),
});

const VariablesSchema = z.object({
	description: z.string(),
	categories: z.record(z.string(), z.object({
		title: z.string(),
		description: z.string().optional(),
		variables: z.array(VariableSchema)
	})),
});

const YamlSchemaSchema = z.object({
	description: z.string(),
	notation: z.record(z.string(), z.string()),
	elements: z.record(z.string(), z.any()),
});

// --- Fetchers ---

async function fetchMarkdown(url: string): Promise<string> {
	console.error(`Fetching ${url}...`);
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
	}
	return await response.text();
}

/**
 * Parses markdown tables into objects.
 */
function parseMarkdownTable(markdown: string): Array<Record<string, string>> {
	const lines = markdown.split("\n");
	const tableLines = lines.filter((l) => l.trim().startsWith("|"));
	if (tableLines.length < 3) return [];

	// Headers are in the first line
	const headers = tableLines[0]
		.split("|")
		.map((h) => h.trim())
		.filter((h) => h !== ""); // Keep empty strings if we want to match indices, but filter(Boolean) was too aggressive

	const results: Array<Record<string, string>> = [];

	// Skip header and separator line
	for (let i = 2; i < tableLines.length; i++) {
		const cells = tableLines[i]
			.split("|")
			.map((c) => c.trim())
			.filter((c, index, array) => {
				// Remove first and last empty elements caused by leading/trailing |
				return index !== 0 && index !== array.length - 1;
			});

		if (cells.length >= headers.length) {
			const item: Record<string, string> = {};
			headers.forEach((h, index) => {
				if (h) {
					item[h] = cells[index] || "";
				}
			});
			results.push(item);
		}
	}

	return results;
}

// --- Update Logic ---

async function updateVariables() {
	const url =
		"https://raw.githubusercontent.com/MicrosoftDocs/azure-devops-docs/main/docs/pipelines/build/includes/variables-hosted.md";
	const md = await fetchMarkdown(url);

	// Split by H2 headers
	const sections = md.split(/^##\s+/m);
	const categories: Record<string, any> = {};

	for (const section of sections) {
		const lines = section.split("\n");
		const title = lines[0].trim();
		if (!title) continue;

		const table = parseMarkdownTable(section);
		if (table.length > 0) {
			const key = title
				.toLowerCase()
				.replace(/\s+/g, "_")
				.replace(/[()]/g, "")
				.replace(/[^a-z0-9_]/g, "");
			
			const variables = table
				.map((row) => ({
					name: row["Variable"] || row["variable"] || Object.values(row)[0],
					description: row["Description"] || row["description"] || Object.values(row)[1],
				}))
				.filter((v) => v.name && v.name !== "Variable");

			if (variables.length > 0) {
				categories[key] = {
					title,
					variables,
				};
			}
		}
	}

	const filePath = path.join(DATA_DIR, "variables.json");
	const oldDataRaw = await fs.readFile(filePath, "utf-8");
	const oldData = JSON.parse(oldDataRaw);

	const newData = {
		...oldData,
		categories: {
			...oldData.categories,
			...categories,
		},
	};

	// console.error("DEBUG: newData.categories keys:", Object.keys(newData.categories));
	// console.error("DEBUG: newData.categories.agent:", JSON.stringify(newData.categories.agent, null, 2));

	try {
		VariablesSchema.parse(newData);
	} catch (e) {
		console.error("Validation failed for Variables:");
		if (e instanceof z.ZodError) {
			console.error(JSON.stringify(e.format(), null, 2));
		}
		throw e;
	}
	
	await writeIfChanged(filePath, newData, "Variables");
}

async function updateExpressions() {
	const url = "https://raw.githubusercontent.com/MicrosoftDocs/azure-devops-docs/main/docs/pipelines/process/expressions.md";
	const md = await fetchMarkdown(url);

	// This is more complex because it's not all tables.
	// For now, we'll just log and let the user know we might need manual refinement 
	// or a better parser for nested structures.
	// Pragmatically, we can update specific well-known functions.
	
	const filePath = path.join(DATA_DIR, "expressions.json");
	const oldData = JSON.parse(await fs.readFile(filePath, "utf-8"));

	// In a real scenario, we would parse functions from H3 headers.
	// For this prototype, we'll keep the existing data but ensure the script structure is there.
	console.error("Expressions update: Parsing logic for nested headers would be here.");
	
	await writeIfChanged(filePath, oldData, "Expressions");
}

async function updateYamlSchema() {
	// Source: https://github.com/MicrosoftDocs/azure-devops-yaml-schema
	// The project uses a curated list. We'll check if we can fetch something new.
	const filePath = path.join(DATA_DIR, "yaml-schema.json");
	const oldData = JSON.parse(await fs.readFile(filePath, "utf-8"));
	
	// Similar to expressions, this is a highly curated file in this project.
	console.error("YAML Schema update: Curated dataset preserved.");
	
	await writeIfChanged(filePath, oldData, "YAML Schema");
}

async function writeIfChanged(filePath: string, newData: any, label: string) {
	const newJson = JSON.stringify(newData, null, 2);
	const oldJson = await fs.readFile(filePath, "utf-8").catch(() => "");

	if (newJson !== oldJson) {
		console.error(`${label}: Changes detected! Updating...`);
		await fs.writeFile(filePath, newJson, "utf-8");
		
		// Simple diff summary
		const oldObj = oldJson ? JSON.parse(oldJson) : {};
		const newObj = newData;
		
		if (label === "Variables") {
			const oldVars = Object.values(oldObj.categories || {}).flatMap((c: any) => c.variables).length;
			const newVars = Object.values(newObj.categories || {}).flatMap((c: any) => c.variables).length;
			console.error(`  Variables: ${oldVars} -> ${newVars}`);
		}
	} else {
		console.error(`${label}: No changes detected.`);
	}
}

async function main() {
	try {
		await updateVariables();
		await updateExpressions();
		await updateYamlSchema();
		console.error("Update process completed successfully.");
	} catch (error) {
		console.error("Update failed:", error);
		process.exit(1);
	}
}

main();
