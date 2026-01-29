import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExpressionsTools } from "./tools/expressions.js";
import { registerVariablesTools } from "./tools/variables.js";
import { registerYamlSchemaTools } from "./tools/yaml-schema.js";
import { registerSearchTasksTools } from "./tools/search-tasks.js";
import { registerTaskReferenceTools } from "./tools/task-reference.js";

export function createServer(): McpServer {
	const server = new McpServer({
		name: "azure-pipelines-mcp",
		version: "0.1.0",
	});

	registerExpressionsTools(server);
	registerVariablesTools(server);
	registerYamlSchemaTools(server);
	registerSearchTasksTools(server);
	registerTaskReferenceTools(server);

	return server;
}
