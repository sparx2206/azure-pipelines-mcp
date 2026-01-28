# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt

MCP server pro Azure Pipelines YAML authoring — validace, task reference, expressions, proměnné a YAML schema. Distribuován přes npm/npx, kompatibilní se všemi MCP klienty (Claude, Gemini, GitHub Copilot, Cursor, VS Code aj.).

## Příkazy

```bash
npm run build        # TypeScript kompilace (tsc → dist/)
npm test             # Spuštění všech testů (vitest run)
npm run test:watch   # Testy ve watch módu
npx vitest run tests/tools/expressions.test.ts  # Jeden testovací soubor
npm run lint         # ESLint kontrola
npm run lint:fix     # ESLint s auto-fix
npm run format       # Prettier formátování
npm run inspect      # Build + spuštění MCP Inspector pro lokální testování
```

## Architektura

```
src/
  index.ts          — Entry point (shebang, stdio transport, spuštění serveru)
  server.ts         — McpServer instance, registrace všech tools
  tools/            — Jednotlivé MCP tools (jeden soubor = jeden tool)
  data/             — Embedded JSON datasety (expressions, variables, schema)
tests/
  tools/            — Unit testy pro tool handlery
  server.test.ts    — Integrační test registrace tools přes MCP Client
```

**Transport:** stdio (standardní pro npx-distribuované MCP servery).

**Datové zdroje:** Embedded JSON datasety v `src/data/` pro stabilní reference (expressions, variables, schema). Budoucí tools (task reference, validace) budou používat runtime fetch z GitHub/Azure DevOps API.

## Přidání nového toolu

1. Vytvořit `src/tools/novy-tool.ts` — exportovat handler funkci a `registerXxxTools(server)` funkci
2. V `src/server.ts` importovat a zavolat registrační funkci
3. Přidat testy do `tests/tools/novy-tool.test.ts`
4. Přidat integrační test do `tests/server.test.ts`

Každý tool handler vrací `{ content: [{ type: "text", text: JSON.stringify(...) }] }`.

## Konfigurace (env proměnné)

Zatím žádné — budou přidány ve Fázi 3 (validace přes Azure DevOps API):
- `AZURE_DEVOPS_ORG` — název organizace
- `AZURE_DEVOPS_PAT` — Personal Access Token
- `AZURE_DEVOPS_PROJECT` — název projektu

## Konvence

- ESM modul (`"type": "module"` v package.json)
- Import s `.js` příponami (TypeScript ESM requirement)
- JSON importy s `with { type: "json" }` atributem
- `console.error()` pro logování (nikdy `console.log` — narušuje stdio MCP protokol)
- Zod pro validaci vstupních schémat tools
