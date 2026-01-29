# GEMINI.md

This file provides guidance to Gemini CLI and Gemini Code Assist when working with code in this repository.

## Project

MCP server for Azure Pipelines YAML authoring — validation, task reference, expressions, variables, and YAML schema. Distributed via npm/npx, compatible with all MCP clients (Claude, Gemini, GitHub Copilot, Cursor, VS Code, etc.).

## Commands

```bash
npm run build        # TypeScript compilation (tsc → dist/)
npm test             # Run all tests (vitest run)
npm run test:watch   # Tests in watch mode
npx vitest run tests/tools/expressions.test.ts  # Single test file
npm run lint         # ESLint check
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier formatting
npm run inspect      # Build + run MCP Inspector for local testing
```

## Architecture

```
src/
  index.ts          — Entry point (shebang, stdio transport, server startup)
  server.ts         — McpServer instance, registers all tools
  tools/            — Individual MCP tools (one file = one tool)
  services/         — Shared services (HTTP client, cache)
  data/             — Embedded JSON datasets (expressions, variables, schema)
tests/
  tools/            — Unit tests for tool handlers
  services/         — Unit tests for shared services
  server.test.ts    — Integration test for tool registration via MCP Client
```

**Transport:** stdio (standard for npx-distributed MCP servers).

**Data sources:** Embedded JSON datasets in `src/data/` for stable references (expressions, variables, schema). Runtime tools (task reference, search) fetch from GitHub raw content (`MicrosoftDocs/azure-devops-yaml-schema`). Future validation tool will use Azure DevOps REST API.

## Adding a new tool

1. Create `src/tools/new-tool.ts` — export handler function and `registerXxxTools(server)` function
2. In `src/server.ts` import and call the registration function
3. Add tests to `tests/tools/new-tool.test.ts`
4. Add integration test to `tests/server.test.ts`

Each tool handler returns `{ content: [{ type: "text", text: JSON.stringify(...) }] }`.

## Configuration (env variables)

None yet — will be added in Phase 3 (validation via Azure DevOps API):

- `AZURE_DEVOPS_ORG` — organization name
- `AZURE_DEVOPS_PAT` — Personal Access Token
- `AZURE_DEVOPS_PROJECT` — project name

## Conventions

- ESM module (`"type": "module"` in package.json)
- Imports with `.js` extensions (TypeScript ESM requirement)
- JSON imports with `with { type: "json" }` attribute
- `console.error()` for logging (never `console.log` — breaks stdio MCP protocol)
- Zod for tool input schema validation
- Git commit messages and GitHub issues in **English**
- Follow branch naming convention: `features/*`
