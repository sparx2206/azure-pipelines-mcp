#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
	try {
		// Validate configuration at startup
		// We import dynamically to avoid side effects during static analysis if needed,
		// but here strict validation at startup is desired.
		const { loadConfig } = await import("./config.js");
		loadConfig();
	} catch (error) {
		if (error instanceof Error) {
			console.error("Configuration error:", error.message);
			if ("issues" in error && Array.isArray((error as { issues: unknown[] }).issues)) {
				// Zod error details
				console.error(JSON.stringify((error as { issues: unknown[] }).issues, null, 2));
			}
		}
		process.exit(1);
	}

	const server = createServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("azure-pipelines-mcp server running on stdio");
}

main().catch((error: unknown) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
