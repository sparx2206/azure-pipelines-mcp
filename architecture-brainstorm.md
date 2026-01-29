# Architecture Brainstorm: azure-pipelines-mcp

MCP server zaměřený na **asistenci při psaní Azure Pipelines YAML** — validace, dokumentace tasků, expressions, proměnných a YAML schema reference.

---

## 1. Vymezení proti existujícím řešením

Existuje několik Azure DevOps MCP serverů, ale žádný nepokrývá náš use case:

| Server | Zaměření | Naše odlišnost |
|--------|----------|----------------|

| [`@azure-devops/mcp`](https://github.com/microsoft/azure-devops-mcp) (Microsoft, official) | Operace nad Azure DevOps (work items, repos, pipelines CRUD, wiki) | My řešíme **autorskou asistenci YAML** — validaci syntaxe, dokumentaci tasků a expressions |

| [`@tiberriver256/mcp-server-azure-devops`](https://github.com/Tiberriver256/mcp-server-azure-devops) | CRUD operace nad Azure DevOps resources | Stejné — žádná YAML validace ani dokumentační nástroje |

| [Microsoft Learn MCP](https://github.com/microsoftdocs/mcp) | Generické prohledávání Microsoft docs | Příliš obecný — není optimalizovaný pro pipeline authoring |

**Náš server je komplementární** — zaměřuje se výhradně na kvalitu pipeline YAML kódu, ne na správu DevOps resources.

---

## 2. Plánované MCP Tools

### 2.1 `validate_pipeline_yaml`

Validace YAML pipeline definice přes Azure DevOps Preview (Dry Run) API.

- **API endpoint:** `POST https://dev.azure.com/{org}/{project}/_apis/pipelines/{pipelineId}/preview?api-version=7.1`
- **Request body:**

  ```json
  {
    "previewRun": true,
    "yamlOverride": "<YAML_CONTENT>"
  }
  ```

- **Response:** `{ "finalYaml": "..." }` nebo chybová zpráva s detailem validační chyby
- **Vyžaduje:** PAT token (scope `vso.build`), název organizace, project a ID existující pipeline
- **Omezení:** Potřebuje existující pipeline definici (pipelineId) — nelze validovat YAML bez kontextu pipeline

### 2.2 `search_pipeline_tasks`

Vyhledávání a dokumentace podporovaných pipeline tasků.

### 2.3 `get_task_reference`

Detailní reference konkrétního tasku (vstupy, aliasy, příklady).

### 2.4 `get_expressions_reference`

Reference expressions a funkcí (comparison, logical, string, collection, status check funkce).

### 2.5 `get_predefined_variables`

Seznam předdefinovaných proměnných (Agent, Build, System, Pipeline, Deployment, Checks).

### 2.6 `get_yaml_schema`

YAML schema reference — struktura pipeline, stages, jobs, steps, triggers, resources atd.

---

## 3. Srovnání přístupů k datovým zdrojům

### 3.1 Dokumentace tasků, expressions, proměnných a YAML schema

#### Varianta A: Microsoft Learn MCP Server (proxy)

Využití oficiálního MS Learn MCP serveru na `https://learn.microsoft.com/api/mcp` jako datového zdroje.

| | Popis |
|---|---|
| **Jak to funguje** | Náš MCP server interně volá MS Learn MCP endpoint (`microsoft_docs_search`, `microsoft_docs_fetch`) a vrací zpracovaný výsledek |
| **Výhody** | Vždy aktuální data; žádná údržba obsahu; oficiální zdroj; nepotřebuje API klíč |
| **Nevýhody** | Závislost na externím serveru; latence navíc; nelze garantovat stabilitu API; formát odpovědí nemusí být optimální pro pipeline-specifické dotazy |
| **Technická realizace** | HTTP fetch na `https://learn.microsoft.com/api/mcp` s MCP protokolem (Streamable HTTP transport) nebo přímé volání jednotlivých tools přes HTTP |

#### Varianta B: GitHub raw markdown (statický obsah)

Stahování markdown souborů přímo z GitHub repozitářů:
- [`MicrosoftDocs/azure-devops-yaml-schema`](https://github.com/MicrosoftDocs/azure-devops-yaml-schema) — `task-reference/*.md` + YAML schema definice
- [`MicrosoftDocs/azure-devops-docs`](https://github.com/MicrosoftDocs/azure-devops-docs) — expressions, variables a další docs

| | Popis |
|---|---|
| **Jak to funguje** | Při startu serveru (nebo na vyžádání) stáhnout markdown soubory z GitHub, parsovat a indexovat |
| **Výhody** | Plná kontrola nad daty; offline schopnost (cache); rychlé odpovědi; přesný targeting pipeline docs |
| **Nevýhody** | Nutnost aktualizace při změnách; parsování markdown souborů; větší initiální setup |
| **Raw URL pattern** | `https://raw.githubusercontent.com/MicrosoftDocs/azure-devops-yaml-schema/main/task-reference/{task-name}.md` |

#### Varianta C: Embedded knowledge (předpřipravené datasety)

Build-time generování JSON datasetů z dokumentace, distribuovaných přímo s npm balíčkem.

| | Popis |
|---|---|
| **Jak to funguje** | Skript při buildu stáhne a zpracuje dokumentaci do strukturovaných JSON souborů; tyto se bundlují s balíčkem |
| **Výhody** | Nulová latence; plná offline funkčnost; žádné runtime závislosti; deterministické výsledky |
| **Nevýhody** | Data zastarávají — vyžaduje periodické rebuild + publish; větší velikost balíčku |
| **Vhodné pro** | Expressions reference, predefined variables, YAML schema — tyto se mění zřídka |

#### Varianta D: Azure DevOps REST API (`/distributedtask/yamlschema`)

Stažení YAML schema přímo z cílové Azure DevOps organizace.

- **Endpoint:** `GET https://dev.azure.com/{org}/_apis/distributedtask/yamlschema?api-version=7.1`
- **Volitelný parametr:** `validateTaskNames=true`

| | Popis |
|---|---|
| **Jak to funguje** | Při připojení k organizaci stáhnout schema včetně dostupných tasků |
| **Výhody** | Schema přesně odpovídá cílové organizaci (včetně custom tasků z marketplace); živá data |
| **Nevýhody** | Vyžaduje autentizaci a připojení; nelze použít bez organizace; neposkytuje detailní dokumentaci tasků |
| **Vhodné pro** | Doplněk k jiné variantě — ověření dostupnosti tasků v konkrétní organizaci |

### Doporučení: Hybridní přístup (C + D + A fallback)

| Datový zdroj | Přístup | Důvod |
|---|---|---|
| **Expressions reference** | Varianta C (embedded) | Stabilní obsah, mění se zřídka |
| **Predefined variables** | Varianta C (embedded) | Stabilní obsah, mění se zřídka |
| **YAML schema** | Varianta C (embedded) + D (runtime z organizace) | Základ embedded, rozšíření o custom tasky z org |
| **Task reference** | Varianta B (GitHub raw) s cache + A (MS Learn MCP fallback) | Detailní task docs s aktuálností |
| **YAML validace** | Azure DevOps Preview API (viz 2.1) | Jediná možnost pro reálnou validaci |

---

## 4. Srovnání technologických stacků

### 4.1 Runtime a jazyk

#### TypeScript + Node.js (doporučeno)

```
@modelcontextprotocol/sdk + zod + node-fetch
```

| | |
|---|---|
| **Důvody pro** | Oficiální MCP SDK je TypeScript; ekosystém npm (`npx` distribuce); většina existujících MCP serverů je v TS; Zod pro validaci schémat |
| **MCP SDK verze** | `@modelcontextprotocol/sdk` v1.x (stabilní); v2 plánován na Q1 2026 |
| **Peer dependency** | `zod` (v3.25+) |
| **Build** | `tsc` → JavaScript ESM |
| **Min Node.js** | 18+ (ESM modules, fetch API) |

#### Python + mcp SDK (alternativa)

| | |
|---|---|
| **Důvody pro** | Python MCP SDK existuje; jednodušší pro prototyping |
| **Důvody proti** | `npx` distribuce je komplikovanější; Python runtime dependency pro uživatele; menší výkon pro IO-heavy operace |

#### Go / Rust (nevhodné)

| | |
|---|---|
| **Důvody proti** | Žádný oficiální MCP SDK; `npx` distribuce nemožná (binární distribuce by vyžadovala jiný mechanismus); zbytečná komplexita |

**Verdikt:** TypeScript + Node.js je jasná volba — NPX distribuce, nativní MCP SDK, ekosystém.

### 4.2 Struktura projektu

```
azure-pipelines-mcp/
├── src/
│   ├── index.ts                  # Entry point, MCP server setup
│   ├── server.ts                 # McpServer konfigurace a registrace tools
│   ├── tools/
│   │   ├── validate-pipeline.ts  # validate_pipeline_yaml tool
│   │   ├── search-tasks.ts       # search_pipeline_tasks tool
│   │   ├── task-reference.ts     # get_task_reference tool
│   │   ├── expressions.ts        # get_expressions_reference tool
│   │   ├── variables.ts          # get_predefined_variables tool
│   │   └── yaml-schema.ts        # get_yaml_schema tool
│   ├── services/
│   │   ├── azure-devops-client.ts   # HTTP klient pro Azure DevOps REST API
│   │   ├── docs-provider.ts         # Abstrakce nad datovými zdroji dokumentace
│   │   └── cache.ts                 # In-memory cache pro docs
│   ├── data/
│   │   ├── expressions.json         # Embedded expressions reference
│   │   ├── variables.json           # Embedded predefined variables
│   │   └── yaml-schema.json         # Embedded YAML schema
│   └── types/
│       └── index.ts                 # Sdílené TypeScript typy
├── scripts/
│   └── generate-data.ts          # Skript pro generování embedded datasetů
├── tests/
│   ├── tools/                    # Unit testy pro každý tool
│   ├── services/                 # Unit testy pro services
│   └── integration/              # Integrační testy
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .eslintrc.json
├── .gitignore
├── LICENSE
├── CLAUDE.md
└── README.md
```

### 4.3 Testovací framework

| Framework | Hodnocení |
|---|---|
| **Vitest** (doporučeno) | Rychlý, ESM-native, kompatibilní s Jest API, watch mode, built-in coverage |
| Jest | Rozšířený, ale ESM podpora je komplikovanější; pomalejší startup |
| Node.js test runner | Nativní, ale méně features pro mocking a coverage |

### 4.4 Linting a formátování

| Nástroj | Účel |
|---|---|
| **ESLint** (flat config) | Statická analýza kódu |
| **Prettier** | Formátování kódu |
| **typescript-eslint** | TypeScript-specifická pravidla |

### 4.5 Package.json klíčové konfigurace

```json
{
  "name": "azure-pipelines-mcp",
  "type": "module",
  "bin": {
    "azure-pipelines-mcp": "./dist/index.js"
  },
  "files": ["dist"],
  "engines": {
    "node": ">=18"
  }
}
```

Důležité: pole `bin` umožňuje spouštění přes `npx -y azure-pipelines-mcp`.

---

## 5. Autentizace a konfigurace

### 5.1 Vstupní parametry

Server potřebuje tyto konfigurace (některé povinné pouze pro validaci):

| Parametr | Povinnost | Zdroj | Popis |
|---|---|---|---|
| `organization` | Povinný pro validaci | CLI argument nebo env var `AZURE_DEVOPS_ORG` | Název Azure DevOps organizace |
| `pat` | Povinný pro validaci | Env var `AZURE_DEVOPS_PAT` | Personal Access Token (scope: `vso.build`) |
| `project` | Povinný pro validaci | CLI argument nebo env var `AZURE_DEVOPS_PROJECT` | Název projektu |
| `pipelineId` | Povinný pro validaci | Tool input parametr | ID pipeline pro preview run |

### 5.2 Použití z klienta (Claude Desktop, Cursor, VS Code)

```json
{
  "mcpServers": {
    "azure-pipelines": {
      "command": "npx",
      "args": ["-y", "azure-pipelines-mcp"],
      "env": {
        "AZURE_DEVOPS_ORG": "my-organization",
        "AZURE_DEVOPS_PAT": "xxxxxxxxxxxx",
        "AZURE_DEVOPS_PROJECT": "my-project"
      }
    }
  }
}
```

### 5.3 Transport

- **stdio** (výchozí) — standardní pro lokální MCP servery spouštěné přes `npx`
- Server komunikuje přes stdin/stdout pomocí MCP protokolu

---

## 6. Datové zdroje — detailní rozbor

### 6.1 Task Reference

**Primární zdroj:** GitHub repo [`MicrosoftDocs/azure-devops-yaml-schema`](https://github.com/MicrosoftDocs/azure-devops-yaml-schema)

- Adresář `task-reference/` obsahuje markdown soubory pro každý task a verzi
- Pojmenování: `{task-name}-v{version}.md` (např. `dot-net-core-cli-v2.md`)
- Index: `task-reference/index.md` — seznam všech tasků s kategoriemi (Build, Deploy, Package, Test, Tool, Utility)
- Obsah souborů: YAML syntax, vstupy, aliasy, default hodnoty, příklady, remarks
- **Automaticky generované** při Azure DevOps sprint deploys — obsah je aktuální

**Strategie:**
1. Při prvním dotazu na task stáhnout `index.md` a cache-ovat seznam tasků
2. Při dotazu na konkrétní task stáhnout odpovídající markdown
3. Cache s TTL (např. 1 hodina) pro opakované dotazy

### 6.2 Expressions & Functions

**Zdroj:** [`MicrosoftDocs/azure-devops-docs`](https://github.com/MicrosoftDocs/azure-devops-docs) → `docs/pipelines/process/expressions.md`

Obsah zahrnuje:
- 25+ built-in funkcí (comparison, logical, string, collection, utility, job status)
- 2 syntaxe: compile-time `${{ }}` vs runtime `$[ ]`
- Type conversion matice
- Conditional statements (`if`/`elseif`/`else`) a `each` loop
- Dependencies context

**Strategie:** Embedded JSON dataset — obsah se mění velmi zřídka.

### 6.3 Predefined Variables

**Zdroj:** `docs/pipelines/build/variables.md`

~80-100 proměnných v kategoriích: Agent, Build, System, Pipeline, Deployment, Checks.

**Strategie:** Embedded JSON dataset.

### 6.4 YAML Schema

**Zdroje:**
- Embedded: Strukturovaný popis pipeline elementů (pipeline, stages, jobs, steps, trigger, pr, schedules, parameters, variables, resources, pool, extends)
- Runtime: `GET https://dev.azure.com/{org}/_apis/distributedtask/yamlschema?api-version=7.1` — pro task definitions specifické pro organizaci

---

## 7. Fáze vývoje

### Fáze 1: Základ
- Inicializace TypeScript projektu s MCP SDK
- Implementace `get_expressions_reference` (embedded data)
- Implementace `get_predefined_variables` (embedded data)
- Implementace `get_yaml_schema` (embedded data)
- Unit testy, CI pipeline

### Fáze 2: Task Reference
- Implementace `search_pipeline_tasks` s GitHub raw markdown source
- Implementace `get_task_reference` s cache
- NPM publish jako veřejný balíček

### Fáze 3: Validace
- Implementace `validate_pipeline_yaml` přes Preview API
- Integrace s Azure DevOps autentizací (PAT)
- Integrační testy

### Fáze 4: Polish
- README s návodem k použití
- Error handling a edge cases
- Rate limiting a retry logika pro API volání
- Skript `generate-data.ts` pro aktualizaci embedded dat

---

## 8. Rizika a omezení

| Riziko | Dopad | Mitigace |
|---|---|---|
| Preview API vyžaduje existující pipelineId | Uživatel musí mít alespoň jednu pipeline v projektu | Dokumentace + srozumitelná chybová zpráva |
| MS Learn docs se změní a embedded data zastarají | Nepřesné informace | Periodický re-generate + verze v package.json |
| Rate limiting na GitHub raw content | Nefunkční task reference | Cache + conditional requests (ETag/If-Modified-Since) |
| MCP SDK v2 breaking changes | Nutnost refaktoru | Sledovat changelog; v1.x má 6-měsíční support po v2 release |
| PAT token expiry | Validace přestane fungovat | Srozumitelná chybová zpráva + dokumentace renewal procesu |

---

## 9. Zdroje

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP SDK na npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [Azure DevOps Preview API](https://learn.microsoft.com/en-us/rest/api/azure/devops/pipelines/preview/preview?view=azure-devops-rest-7.1)
- [Azure DevOps Yamlschema GET](https://learn.microsoft.com/en-us/rest/api/azure/devops/distributedtask/yamlschema/get?view=azure-devops-rest-7.1)
- [Azure Pipelines Task Reference](https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/?view=azure-pipelines)
- [Azure Pipelines Expressions](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/expressions?view=azure-devops)
- [Azure Pipelines Predefined Variables](https://learn.microsoft.com/en-us/azure/devops/pipelines/build/variables?view=azure-devops&tabs=yaml)
- [Azure Pipelines YAML Schema](https://learn.microsoft.com/en-us/azure/devops/pipelines/yaml-schema/?view=azure-pipelines)
- [MicrosoftDocs/azure-devops-yaml-schema (GitHub)](https://github.com/MicrosoftDocs/azure-devops-yaml-schema)
- [MicrosoftDocs/azure-devops-docs (GitHub)](https://github.com/MicrosoftDocs/azure-devops-docs)
- [Microsoft Learn MCP Server](https://github.com/microsoftdocs/mcp)
- [MS Learn Catalog API](https://learn.microsoft.com/en-us/training/support/catalog-api-developer-reference)
- [Validating YAML using Azure DevOps (blog)](https://johnlokerse.dev/2022/02/07/validating-yaml-using-azure-devops-or-cli/)
- [Official @azure-devops/mcp](https://github.com/microsoft/azure-devops-mcp)

---

## 10. Backlog

### 10.1 Helper Tools
- [ ] **`get_repositories`**: Získání seznamu repozitářů (ID, jméno) v projektu, aby uživatel mohl snadno vybrat správné repo pro vytvoření dummy pipeline.