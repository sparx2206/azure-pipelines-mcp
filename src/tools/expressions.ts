import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import expressionsData from "../data/expressions.json" with { type: "json" };

const CATEGORIES = Object.keys(expressionsData.categories) as Array<
  keyof typeof expressionsData.categories
>;

export type ExpressionsCategory = (typeof CATEGORIES)[number];

export function getExpressionsReference(category?: string): string {
  if (!category) {
    const overview = {
      description: expressionsData.description,
      syntaxVariants: expressionsData.syntaxVariants,
      availableCategories: CATEGORIES.map((key) => ({
        id: key,
        title: expressionsData.categories[key].title,
      })),
      contexts: expressionsData.contexts,
    };
    return JSON.stringify(overview, null, 2);
  }

  if (!CATEGORIES.includes(category as ExpressionsCategory)) {
    return JSON.stringify({
      error: `Unknown category '${category}'. Available categories: ${CATEGORIES.join(", ")}`,
    });
  }

  const categoryData =
    expressionsData.categories[category as ExpressionsCategory];
  return JSON.stringify(categoryData, null, 2);
}

export function registerExpressionsTools(server: McpServer): void {
  server.registerTool(
    "get_expressions_reference",
    {
      title: "Get Expressions Reference",
      description:
        "Get Azure Pipelines expressions and functions reference. Without a category, returns an overview with available categories and syntax variants. With a category, returns detailed function reference for that category.",
      inputSchema: {
        category: z
          .enum(CATEGORIES as unknown as [string, ...string[]])
          .optional()
          .describe(
            "Expression category to get details for. Omit to get an overview of all categories.",
          ),
      },
    },
    async ({ category }) => {
      return {
        content: [
          {
            type: "text" as const,
            text: getExpressionsReference(category),
          },
        ],
      };
    },
  );
}
