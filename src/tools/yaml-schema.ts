import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import schemaData from "../data/yaml-schema.json" with { type: "json" };

const ELEMENTS = Object.keys(schemaData.elements) as Array<
  keyof typeof schemaData.elements
>;

export type YamlSchemaElement = (typeof ELEMENTS)[number];

export function getYamlSchemaReference(element?: string): string {
  if (!element) {
    const overview = {
      description: schemaData.description,
      notation: schemaData.notation,
      availableElements: ELEMENTS.map((key) => ({
        id: key,
        title: schemaData.elements[key].title,
        description: schemaData.elements[key].description,
      })),
    };
    return JSON.stringify(overview, null, 2);
  }

  if (!ELEMENTS.includes(element as YamlSchemaElement)) {
    return JSON.stringify({
      error: `Unknown element '${element}'. Available elements: ${ELEMENTS.join(", ")}`,
    });
  }

  const elementData = schemaData.elements[element as YamlSchemaElement];
  return JSON.stringify(elementData, null, 2);
}

export function registerYamlSchemaTools(server: McpServer): void {
  server.registerTool(
    "get_yaml_schema",
    {
      title: "Get YAML Schema Reference",
      description:
        "Get Azure Pipelines YAML schema reference. Without an element, returns an overview of all pipeline elements. With an element, returns detailed schema for that element including syntax, properties, and examples.",
      inputSchema: {
        element: z
          .enum(ELEMENTS as unknown as [string, ...string[]])
          .optional()
          .describe(
            "Pipeline element to get schema for (e.g. 'pipeline', 'stages', 'jobs', 'steps', 'trigger', 'resources'). Omit to get an overview.",
          ),
      },
    },
    async ({ element }) => {
      return {
        content: [
          {
            type: "text" as const,
            text: getYamlSchemaReference(element),
          },
        ],
      };
    },
  );
}
