import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

interface TextContent {
	type: "text";
	text: string;
}

interface ToolResult {
	content: TextContent[];
}

describe("MCP Server", () => {
	async function createConnectedClient(): Promise<Client> {
		const server = createServer();
		const client = new Client({ name: "test-client", version: "1.0.0" });
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();

		await Promise.all([
			client.connect(clientTransport),
			server.connect(serverTransport),
		]);

		return client;
	}

	it("registers all expected tools", async () => {
		const client = await createConnectedClient();
		const { tools } = await client.listTools();

		const toolNames = tools.map((t) => t.name);
		expect(toolNames).toContain("get_expressions_reference");
		expect(toolNames).toContain("get_predefined_variables");
		expect(toolNames).toContain("get_yaml_schema");
		expect(toolNames).toContain("search_pipeline_tasks");
		expect(toolNames).toContain("get_task_reference");
		expect(toolNames).toContain("validate_pipeline_yaml");
		expect(toolNames).toContain("create_dummy_pipeline");
		expect(toolNames).toContain("get_dummy_pipeline");
		expect(toolNames).toHaveLength(8);
	});

	it("each tool has a description", async () => {
		const client = await createConnectedClient();
		const { tools } = await client.listTools();

		for (const tool of tools) {
			expect(tool.description).toBeDefined();
			expect(tool.description!.length).toBeGreaterThan(0);
		}
	});

	it("can call get_expressions_reference without arguments", async () => {
		const client = await createConnectedClient();
		const result = (await client.callTool({
			name: "get_expressions_reference",
			arguments: {},
		})) as ToolResult;

		expect(result.content).toBeInstanceOf(Array);
		expect(result.content).toHaveLength(1);

		const textContent = result.content[0] as { type: string; text: string };
		expect(textContent.type).toBe("text");

		const parsed = JSON.parse(textContent.text);
		expect(parsed.availableCategories).toBeDefined();
	});

	it("can call get_predefined_variables without arguments", async () => {
		const client = await createConnectedClient();
		const result = (await client.callTool({
			name: "get_predefined_variables",
			arguments: {},
		})) as ToolResult;

		expect(result.content).toBeInstanceOf(Array);
		const textContent = result.content[0] as { type: string; text: string };
		const parsed = JSON.parse(textContent.text);
		expect(parsed.availableCategories).toBeDefined();
	});

	it("can call get_yaml_schema without arguments", async () => {
		const client = await createConnectedClient();
		const result = (await client.callTool({
			name: "get_yaml_schema",
			arguments: {},
		})) as ToolResult;

		expect(result.content).toBeInstanceOf(Array);
		const textContent = result.content[0] as { type: string; text: string };
		const parsed = JSON.parse(textContent.text);
		expect(parsed.availableElements).toBeDefined();
	});

	it("can call get_expressions_reference with category argument", async () => {
		const client = await createConnectedClient();
		const result = (await client.callTool({
			name: "get_expressions_reference",
			arguments: { category: "comparison" },
		})) as ToolResult;

		const textContent = result.content[0] as { type: string; text: string };
		const parsed = JSON.parse(textContent.text);
		expect(parsed.title).toBe("Comparison Functions");
		expect(parsed.functions).toBeInstanceOf(Array);
	});

	it("can call get_predefined_variables with category argument", async () => {
		const client = await createConnectedClient();
		const result = (await client.callTool({
			name: "get_predefined_variables",
			arguments: { category: "build" },
		})) as ToolResult;

		const textContent = result.content[0] as { type: string; text: string };
		const parsed = JSON.parse(textContent.text);
		expect(parsed.title).toBe("Build Variables");
		expect(parsed.variables).toBeInstanceOf(Array);
	});

	it("can call get_yaml_schema with element argument", async () => {
		const client = await createConnectedClient();
		const result = (await client.callTool({
			name: "get_yaml_schema",
			arguments: { element: "steps" },
		})) as ToolResult;

		const textContent = result.content[0] as { type: string; text: string };
		const parsed = JSON.parse(textContent.text);
		expect(parsed.title).toBe("Steps");
		expect(parsed.types).toBeDefined();
	});

	it("can call search_pipeline_tasks with query argument", async () => {
		const client = await createConnectedClient();
		const result = (await client.callTool({
			name: "search_pipeline_tasks",
			arguments: { query: "dotnet" },
		})) as ToolResult;

		expect(result.content).toBeInstanceOf(Array);
		const textContent = result.content[0] as { type: string; text: string };
		const parsed = JSON.parse(textContent.text);
		expect(parsed.query).toBe("dotnet");
		expect(parsed.tasks).toBeInstanceOf(Array);
	});

	it("can call get_task_reference with invalid task format", async () => {
		const client = await createConnectedClient();
		const result = (await client.callTool({
			name: "get_task_reference",
			arguments: { taskName: "invalid" },
		})) as ToolResult;

		expect(result.content).toBeInstanceOf(Array);
		const textContent = result.content[0] as { type: string; text: string };
		const parsed = JSON.parse(textContent.text);
		expect(parsed.error).toContain("Invalid task format");
	});
});
