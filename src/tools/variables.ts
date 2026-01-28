import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import variablesData from "../data/variables.json" with { type: "json" };

const CATEGORIES = Object.keys(variablesData.categories) as Array<
  keyof typeof variablesData.categories
>;

export type VariablesCategory = (typeof CATEGORIES)[number];

export function getVariablesReference(category?: string): string {
  if (!category) {
    const overview = {
      description: variablesData.description,
      availableCategories: CATEGORIES.map((key) => ({
        id: key,
        title: variablesData.categories[key].title,
        description: variablesData.categories[key].description,
        count: variablesData.categories[key].variables.length,
      })),
    };
    return JSON.stringify(overview, null, 2);
  }

  if (!CATEGORIES.includes(category as VariablesCategory)) {
    return JSON.stringify({
      error: `Unknown category '${category}'. Available categories: ${CATEGORIES.join(", ")}`,
    });
  }

  const categoryData = variablesData.categories[category as VariablesCategory];
  return JSON.stringify(categoryData, null, 2);
}

export function registerVariablesTools(server: McpServer): void {
  server.registerTool(
    "get_predefined_variables",
    {
      title: "Get Predefined Variables",
      description:
        "Get Azure Pipelines predefined variables reference. Without a category, returns an overview with available categories and variable counts. With a category, returns all variables in that category.",
      inputSchema: {
        category: z
          .enum(CATEGORIES as unknown as [string, ...string[]])
          .optional()
          .describe(
            "Variable category to get details for. Omit to get an overview of all categories.",
          ),
      },
    },
    async ({ category }) => {
      return {
        content: [
          {
            type: "text" as const,
            text: getVariablesReference(category),
          },
        ],
      };
    },
  );
}
