# Azure Pipelines MCP Server

[![npm version](https://img.shields.io/npm/v/azure-pipelines-mcp)](https://www.npmjs.com/package/azure-pipelines-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides AI assistants with deep knowledge and capabilities for **Azure Pipelines**.

This server enables LLMs (like Claude, Gemini, etc.) to:
*   **Validate** pipeline YAML against the Azure DevOps API.
*   **Search** for available tasks and their schema.
*   **Reference** expressions, predefined variables, and YAML structure.
*   **Inspect** Git repositories within your Azure DevOps project.

## Features

*   **🔍 Task Search & Reference**: Look up task names, inputs, and documentation (e.g., "How do I use DotNetCoreCLI@2?").
*   **✅ Pipeline Validation**: Validate your YAML content using the official Azure DevOps Pipeline Preview API (detects syntax errors, invalid keywords, etc.).
*   **📚 Documentation Access**: Instant access to Azure Pipelines expressions, variables, and schema definitions.
*   **📂 Repository Context**: List available repositories to help context-aware pipeline creation.

## Installation

### Using `npx` (Recommended)

You can run the server directly using `npx`:

```bash
npx azure-pipelines-mcp
```

### From Source

```bash
git clone https://github.com/sparx2206/azure-pipelines-mcp.git
cd azure-pipelines-mcp
npm install
npm run build
node dist/index.js
```

## Configuration

To use the validation features and repository inspection, you must provide Azure DevOps credentials. These can be set as environment variables.

| Variable | Description | Required? |
| :--- | :--- | :--- |
| `AZURE_DEVOPS_ORG` | Your organization name (e.g., `https://dev.azure.com/{org}`). | ✅ Yes |
| `AZURE_DEVOPS_PAT` | Personal Access Token with **Build (Read & Execute)** and **Code (Read)** scopes. | ✅ Yes |
| `AZURE_DEVOPS_PROJECT` | Default project name. | ❌ Optional |

### Claude Desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "azure-pipelines": {
      "command": "npx",
      "args": ["-y", "azure-pipelines-mcp"],
      "env": {
        "AZURE_DEVOPS_ORG": "my-org",
        "AZURE_DEVOPS_PAT": "my-pat-token",
        "AZURE_DEVOPS_PROJECT": "my-project"
      }
    }
  }
}
```

### VS Code (with MCP Extension)

If you are using an MCP extension in VS Code, configure it in `.vscode/settings.json` or the extension specific config:

```json
{
  "mcp.servers": {
    "azure-pipelines": {
      "command": "npx",
      "args": ["-y", "azure-pipelines-mcp"],
      "env": {
        "AZURE_DEVOPS_ORG": "...",
        "AZURE_DEVOPS_PAT": "..."
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
| :--- | :--- |
| `validate_pipeline_yaml` | Validates YAML content using Azure DevOps API. |
| `search_pipeline_tasks` | Searches for pipeline tasks (e.g., "docker"). |
| `get_task_reference` | Gets detailed schema/inputs for a specific task. |
| `get_expressions_reference` | Documentation for YAML expressions (functions, syntax). |
| `get_predefined_variables` | List of system variables (`Build.BuildId`, etc.). |
| `get_yaml_schema` | Reference for YAML structure (`steps`, `stages`, `pool`). |
| `get_repositories` | Lists Git repositories in the project. |
| `get_dummy_pipeline` | utility to find a pipeline for validation context. |
| `create_dummy_pipeline` | Utility to create a pipeline for validation context. |

## Development

### Setup

```bash
npm install
```

### Testing

```bash
# Run unit tests
npm test

# Watch mode
npm run test:watch
```

### Updating Data

The server uses embedded datasets for speed. To update them from Microsoft documentation:

```bash
npm run update-data
```

## License

MIT