import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	parseDescription,
	parseSyntax,
	parseInputBlock,
	parseInputs,
	parseOutputVariables,
	parseRemarks,
	parseExamples,
	parseTaskMarkdown,
	handleGetTaskReference,
} from "../../src/tools/task-reference.js";
import { resetDefaultHttpClient } from "../../src/services/http-client.js";
import { resetDefaultCache } from "../../src/services/cache.js";

// Mock environment variables
const originalEnv = process.env;

// Sample markdown pro testování
const SAMPLE_TASK_MARKDOWN = `---
title: DotNetCoreCLI@2 - .NET Core v2 task
description: Build, test, package, or publish a .NET application.
ms.date: 01/27/2026
monikerRange: "=azure-pipelines"
---

# DotNetCoreCLI@2 - .NET Core v2 task

<!-- :::description::: -->
:::moniker range="<=azure-pipelines"

<!-- :::editable-content name="description"::: -->
Build, test, package, or publish a .NET application, or run a custom .NET CLI command.
<!-- :::editable-content-end::: -->

:::moniker-end

<!-- :::description-end::: -->

<!-- :::syntax::: -->
## Syntax

:::moniker range=">=azure-pipelines-server"

\`\`\`yaml
# .NET Core v2
# Build, test, package, or publish a .NET application.
- task: DotNetCoreCLI@2
  inputs:
    command: 'build' # 'build' | 'push' | 'pack' | 'publish' | 'restore' | 'run' | 'test' | 'custom'. Required. Command. Default: build.
    #projects: # string. Path to project(s) or solution(s).
    #arguments: # string. Arguments.
\`\`\`

:::moniker-end

:::moniker range="=azure-pipelines-2022"

\`\`\`yaml
# .NET Core v2 (older)
- task: DotNetCoreCLI@2
  inputs:
    command: 'build'
\`\`\`

:::moniker-end

<!-- :::syntax-end::: -->

<!-- :::inputs::: -->
## Inputs

<!-- :::item name="command"::: -->
:::moniker range="<=azure-pipelines"

**\`command\`** - **Command**<br>
\`string\`. Required. Allowed values: \`build\`, \`push\`, \`pack\`, \`publish\`, \`restore\`, \`run\`, \`test\`, \`custom\`. Default value: \`build\`.<br>
<!-- :::editable-content name="helpMarkDown"::: -->
The dotnet command to run. Select 'Custom' to add arguments or use a command not listed here.
<!-- :::editable-content-end::: -->
<br>

:::moniker-end
<!-- :::item-end::: -->

<!-- :::item name="projects"::: -->
:::moniker range="<=azure-pipelines"

**\`projects\`** - **Path to project(s)**<br>
\`string\`.<br>
<!-- :::editable-content name="helpMarkDown"::: -->
The path to the csproj or sln file(s) to use. Glob patterns are supported.
<!-- :::editable-content-end::: -->
<br>

:::moniker-end
<!-- :::item-end::: -->

<!-- :::item name="publishVstsFeed"::: -->
:::moniker range="<=azure-pipelines"

**\`publishVstsFeed\`** - **Target feed**<br>
[Input alias](index.md#what-are-task-input-aliases): \`feedPublish\`. \`string\`. Required.<br>
<!-- :::editable-content name="helpMarkDown"::: -->
Select a feed hosted in your organization.
<!-- :::editable-content-end::: -->
<br>

:::moniker-end
<!-- :::item-end::: -->

<!-- :::item name="verbosityRestore"::: -->
:::moniker range="<=azure-pipelines"

**\`verbosityRestore\`** - **Verbosity**<br>
\`string\`. Allowed values: \`Quiet\`, \`Minimal\`, \`Normal\`, \`Detailed\`, \`Diagnostic\`. Default value: \`Normal\`.<br>
<!-- :::editable-content name="helpMarkDown"::: -->
Specifies the amount of detail displayed in the output.
<!-- :::editable-content-end::: -->
<br>

:::moniker-end
<!-- :::item-end::: -->

<!-- :::inputs-end::: -->

<!-- :::outputVariables::: -->
## Output variables

<!-- :::item name="publishedCount"::: -->
:::moniker range="<=azure-pipelines"

**\`publishedCount\`**<br><!-- :::editable-content name="Description"::: -->
Count of packages published.
<!-- :::editable-content-end::: -->

:::moniker-end
<!-- :::item-end::: -->

<!-- :::item name="packCount"::: -->
:::moniker range="<=azure-pipelines"

**\`packCount\`**<br><!-- :::editable-content name="Description"::: -->
Count of packages packed.
<!-- :::editable-content-end::: -->

:::moniker-end
<!-- :::item-end::: -->

<!-- :::outputVariables-end::: -->

<!-- :::remarks::: -->
<!-- :::editable-content name="remarks"::: -->
## Remarks

The task uses \`dotnet\` CLI under the hood.

### Troubleshooting

If you encounter issues, check the logs.
<!-- :::editable-content-end::: -->
<!-- :::remarks-end::: -->

<!-- :::examples::: -->
<!-- :::editable-content name="examples"::: -->
## Examples

### Build

\`\`\`yaml
steps:
  - task: DotNetCoreCLI@2
    inputs:
      command: 'build'
      projects: '**/*.csproj'
\`\`\`

### Test

\`\`\`yaml
steps:
  - task: DotNetCoreCLI@2
    inputs:
      command: 'test'
      projects: '**/*Tests.csproj'
\`\`\`
<!-- :::editable-content-end::: -->
<!-- :::examples-end::: -->

<!-- :::properties::: -->
## Requirements

| Requirement | Description |
|---|---|
| Pipeline types | YAML, Classic build, Classic release |
| Runs on | Agent |
<!-- :::properties-end::: -->
`;

const EMPTY_MARKDOWN = "";

const MINIMAL_MARKDOWN = `---
title: SimpleTask@1
description: A simple task.
---

# SimpleTask@1

<!-- :::syntax::: -->
<!-- :::syntax-end::: -->

<!-- :::inputs::: -->
<!-- :::inputs-end::: -->

<!-- :::outputVariables::: -->
<!-- :::outputVariables-end::: -->

<!-- :::remarks::: -->
<!-- :::editable-content name="remarks"::: -->
<!-- :::editable-content-end::: -->
<!-- :::remarks-end::: -->

<!-- :::examples::: -->
<!-- :::editable-content name="examples"::: -->
<!-- :::editable-content-end::: -->
<!-- :::examples-end::: -->
`;

describe("parseDescription", () => {
	it("extrahuje popis z front matter", () => {
		const desc = parseDescription(SAMPLE_TASK_MARKDOWN);
		expect(desc).toBe(
			"Build, test, package, or publish a .NET application."
		);
	});

	it("vrátí prázdný string pro prázdný markdown", () => {
		expect(parseDescription(EMPTY_MARKDOWN)).toBe("");
	});
});

describe("parseSyntax", () => {
	it("extrahuje první YAML syntax blok", () => {
		const syntax = parseSyntax(SAMPLE_TASK_MARKDOWN);
		expect(syntax).toBeDefined();
		expect(syntax).toContain("- task: DotNetCoreCLI@2");
		expect(syntax).toContain("command: 'build'");
	});

	it("bere nejnovější moniker (první blok)", () => {
		const syntax = parseSyntax(SAMPLE_TASK_MARKDOWN);
		// První blok obsahuje komentář "# .NET Core v2"
		expect(syntax).toContain("# .NET Core v2");
		// Neměl by obsahovat starší verzi
		expect(syntax).not.toContain("# .NET Core v2 (older)");
	});

	it("vrátí undefined pro prázdný markdown", () => {
		expect(parseSyntax(EMPTY_MARKDOWN)).toBeUndefined();
	});

	it("vrátí undefined pro markdown bez syntax sekce", () => {
		expect(parseSyntax(MINIMAL_MARKDOWN)).toBeUndefined();
	});
});

describe("parseInputBlock", () => {
	const commandBlock = `<!-- :::item name="command"::: -->
:::moniker range="<=azure-pipelines"

**\`command\`** - **Command**<br>
\`string\`. Required. Allowed values: \`build\`, \`push\`, \`pack\`. Default value: \`build\`.<br>
<!-- :::editable-content name="helpMarkDown"::: -->
The dotnet command to run.
<!-- :::editable-content-end::: -->
<br>

:::moniker-end
<!-- :::item-end::: -->`;

	it("parsuje název inputu", () => {
		const input = parseInputBlock(commandBlock);
		expect(input).not.toBeNull();
		expect(input!.name).toBe("command");
	});

	it("parsuje label", () => {
		const input = parseInputBlock(commandBlock);
		expect(input!.label).toBe("Command");
	});

	it("parsuje typ", () => {
		const input = parseInputBlock(commandBlock);
		expect(input!.type).toBe("string");
	});

	it("detekuje required", () => {
		const input = parseInputBlock(commandBlock);
		expect(input!.required).toBe(true);
	});

	it("parsuje default value", () => {
		const input = parseInputBlock(commandBlock);
		expect(input!.defaultValue).toBe("build");
	});

	it("parsuje allowed values", () => {
		const input = parseInputBlock(commandBlock);
		expect(input!.allowedValues).toEqual(["build", "push", "pack"]);
	});

	it("parsuje help text", () => {
		const input = parseInputBlock(commandBlock);
		expect(input!.helpText).toBe("The dotnet command to run.");
	});

	it("detekuje optional input", () => {
		const optionalBlock = `<!-- :::item name="projects"::: -->
**\`projects\`** - **Path to project(s)**<br>
\`string\`.<br>
<!-- :::editable-content name="helpMarkDown"::: -->
The path to the csproj file.
<!-- :::editable-content-end::: -->`;

		const input = parseInputBlock(optionalBlock);
		expect(input).not.toBeNull();
		expect(input!.required).toBe(false);
	});

	it("parsuje alias", () => {
		const aliasBlock = `<!-- :::item name="publishVstsFeed"::: -->
**\`publishVstsFeed\`** - **Target feed**<br>
[Input alias](index.md#what-are-task-input-aliases): \`feedPublish\`. \`string\`. Required.<br>
<!-- :::editable-content name="helpMarkDown"::: -->
Select a feed.
<!-- :::editable-content-end::: -->`;

		const input = parseInputBlock(aliasBlock);
		expect(input).not.toBeNull();
		expect(input!.aliases).toEqual(["feedPublish"]);
	});

	it("vrátí null pro nevalidní blok", () => {
		expect(parseInputBlock("no item here")).toBeNull();
	});
});

describe("parseInputs", () => {
	it("parsuje všechny inputy ze sample", () => {
		const inputs = parseInputs(SAMPLE_TASK_MARKDOWN);
		expect(inputs.length).toBe(4);

		const names = inputs.map((i) => i.name);
		expect(names).toContain("command");
		expect(names).toContain("projects");
		expect(names).toContain("publishVstsFeed");
		expect(names).toContain("verbosityRestore");
	});

	it("vrátí prázdné pole pro prázdný markdown", () => {
		expect(parseInputs(EMPTY_MARKDOWN)).toEqual([]);
	});

	it("vrátí prázdné pole pro markdown bez inputů", () => {
		expect(parseInputs(MINIMAL_MARKDOWN)).toEqual([]);
	});
});

describe("parseOutputVariables", () => {
	it("parsuje output variables", () => {
		const vars = parseOutputVariables(SAMPLE_TASK_MARKDOWN);
		expect(vars).toEqual(["publishedCount", "packCount"]);
	});

	it("vrátí prázdné pole pro prázdný markdown", () => {
		expect(parseOutputVariables(EMPTY_MARKDOWN)).toEqual([]);
	});

	it("vrátí prázdné pole pro markdown bez output variables", () => {
		expect(parseOutputVariables(MINIMAL_MARKDOWN)).toEqual([]);
	});
});

describe("parseRemarks", () => {
	it("extrahuje remarks obsah", () => {
		const remarks = parseRemarks(SAMPLE_TASK_MARKDOWN);
		expect(remarks).toBeDefined();
		expect(remarks).toContain("dotnet");
		expect(remarks).toContain("Troubleshooting");
	});

	it("odstraní ## Remarks heading", () => {
		const remarks = parseRemarks(SAMPLE_TASK_MARKDOWN);
		expect(remarks).not.toMatch(/^##\s*Remarks/);
	});

	it("vrátí undefined pro prázdný markdown", () => {
		expect(parseRemarks(EMPTY_MARKDOWN)).toBeUndefined();
	});

	it("vrátí undefined pro prázdnou remarks sekci", () => {
		expect(parseRemarks(MINIMAL_MARKDOWN)).toBeUndefined();
	});
});

describe("parseExamples", () => {
	it("extrahuje examples obsah", () => {
		const examples = parseExamples(SAMPLE_TASK_MARKDOWN);
		expect(examples).toBeDefined();
		expect(examples).toContain("### Build");
		expect(examples).toContain("### Test");
		expect(examples).toContain("command: 'build'");
	});

	it("odstraní ## Examples heading", () => {
		const examples = parseExamples(SAMPLE_TASK_MARKDOWN);
		expect(examples).not.toMatch(/^##\s*Examples/);
	});

	it("vrátí undefined pro prázdný markdown", () => {
		expect(parseExamples(EMPTY_MARKDOWN)).toBeUndefined();
	});

	it("vrátí undefined pro prázdnou examples sekci", () => {
		expect(parseExamples(MINIMAL_MARKDOWN)).toBeUndefined();
	});
});

describe("parseTaskMarkdown", () => {
	it("vrátí kompletní TaskReference objekt", () => {
		const ref = parseTaskMarkdown(
			SAMPLE_TASK_MARKDOWN,
			"DotNetCoreCLI",
			"2"
		);

		expect(ref.name).toBe("DotNetCoreCLI");
		expect(ref.version).toBe("2");
		expect(ref.fullName).toBe("DotNetCoreCLI@2");
		expect(ref.description).toBeTruthy();
		expect(ref.syntax).toBeDefined();
		expect(ref.inputs.length).toBeGreaterThan(0);
		expect(ref.outputVariables.length).toBe(2);
		expect(ref.remarks).toBeDefined();
		expect(ref.examples).toBeDefined();
	});

	it("zpracuje minimální markdown", () => {
		const ref = parseTaskMarkdown(MINIMAL_MARKDOWN, "SimpleTask", "1");

		expect(ref.name).toBe("SimpleTask");
		expect(ref.version).toBe("1");
		expect(ref.fullName).toBe("SimpleTask@1");
		expect(ref.description).toBe("A simple task.");
		expect(ref.syntax).toBeUndefined();
		expect(ref.inputs).toEqual([]);
		expect(ref.outputVariables).toEqual([]);
		expect(ref.remarks).toBeUndefined();
		expect(ref.examples).toBeUndefined();
	});

	it("zpracuje prázdný markdown", () => {
		const ref = parseTaskMarkdown(EMPTY_MARKDOWN, "Empty", "1");

		expect(ref.fullName).toBe("Empty@1");
		expect(ref.description).toBe("");
		expect(ref.inputs).toEqual([]);
		expect(ref.outputVariables).toEqual([]);
	});
});

describe("handleGetTaskReference", () => {
	it("vrátí chybu pro nevalidní formát task name", async () => {
		const result = JSON.parse(await handleGetTaskReference("invalid"));
		expect(result.error).toContain("Invalid task format");
	});

	it("vrátí chybu pro task bez verze", async () => {
		const result = JSON.parse(await handleGetTaskReference("DotNetCoreCLI"));
		expect(result.error).toContain("Invalid task format");
	});

	it("vrátí chybu pro prázdný task name", async () => {
		const result = JSON.parse(await handleGetTaskReference(""));
		expect(result.error).toContain("Invalid task format");
	});
});
