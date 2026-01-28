import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

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
    expect(toolNames).toHaveLength(3);
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
    const result = await client.callTool({
      name: "get_expressions_reference",
      arguments: {},
    });

    expect(result.content).toBeInstanceOf(Array);
    expect(result.content).toHaveLength(1);

    const textContent = result.content[0] as { type: string; text: string };
    expect(textContent.type).toBe("text");

    const parsed = JSON.parse(textContent.text);
    expect(parsed.availableCategories).toBeDefined();
  });

  it("can call get_predefined_variables without arguments", async () => {
    const client = await createConnectedClient();
    const result = await client.callTool({
      name: "get_predefined_variables",
      arguments: {},
    });

    expect(result.content).toBeInstanceOf(Array);
    const textContent = result.content[0] as { type: string; text: string };
    const parsed = JSON.parse(textContent.text);
    expect(parsed.availableCategories).toBeDefined();
  });

  it("can call get_yaml_schema without arguments", async () => {
    const client = await createConnectedClient();
    const result = await client.callTool({
      name: "get_yaml_schema",
      arguments: {},
    });

    expect(result.content).toBeInstanceOf(Array);
    const textContent = result.content[0] as { type: string; text: string };
    const parsed = JSON.parse(textContent.text);
    expect(parsed.availableElements).toBeDefined();
  });

  it("can call get_expressions_reference with category argument", async () => {
    const client = await createConnectedClient();
    const result = await client.callTool({
      name: "get_expressions_reference",
      arguments: { category: "comparison" },
    });

    const textContent = result.content[0] as { type: string; text: string };
    const parsed = JSON.parse(textContent.text);
    expect(parsed.title).toBe("Comparison Functions");
    expect(parsed.functions).toBeInstanceOf(Array);
  });

  it("can call get_predefined_variables with category argument", async () => {
    const client = await createConnectedClient();
    const result = await client.callTool({
      name: "get_predefined_variables",
      arguments: { category: "build" },
    });

    const textContent = result.content[0] as { type: string; text: string };
    const parsed = JSON.parse(textContent.text);
    expect(parsed.title).toBe("Build Variables");
    expect(parsed.variables).toBeInstanceOf(Array);
  });

  it("can call get_yaml_schema with element argument", async () => {
    const client = await createConnectedClient();
    const result = await client.callTool({
      name: "get_yaml_schema",
      arguments: { element: "steps" },
    });

    const textContent = result.content[0] as { type: string; text: string };
    const parsed = JSON.parse(textContent.text);
    expect(parsed.title).toBe("Steps");
    expect(parsed.types).toBeDefined();
  });
});
