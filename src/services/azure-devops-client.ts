import { HttpClient, HttpClientOptions } from "./http-client.js";
import { loadConfig } from "../config.js";

export interface AzureDevOpsClientOptions extends HttpClientOptions {
	org?: string;
	pat?: string;
	project?: string;
}

/**
 * Klient pro komunikaci s Azure DevOps REST API.
 */
export class AzureDevOpsClient extends HttpClient {
	private readonly org: string;
	private readonly pat: string;
	private readonly project?: string;

	constructor(options: AzureDevOpsClientOptions = {}) {
		super(options);

		// Načtení výchozí konfigurace z env
		// Pokud volající nepředal options, použijeme env vars.
		const config = this.getSafeConfig();

		this.org = options.org ?? config.org ?? "";
		this.pat = options.pat ?? config.pat ?? "";
		this.project = options.project ?? config.project;

		if (!this.org || !this.pat) {
			throw new Error(
				"Azure DevOps Organization and Personal Access Token must be provided via options or environment variables."
			);
		}
	}

	private getSafeConfig() {
		try {
			const cfg = loadConfig();
			return cfg.azureDevOps;
		} catch {
			return { org: undefined, pat: undefined, project: undefined };
		}
	}

	/**
	 * Sestaví URL pro požadavek.
	 * @param endpoint Relativní cesta endpointu (bez / na začátku, např. "_apis/pipelines")
	 * @param projectOverride Volitelné přepsání projektu pro tento request
	 */
	private buildUrl(endpoint: string, projectOverride?: string): string {
		const proj = projectOverride ?? this.project;
		const baseUrl = `https://dev.azure.com/${this.org}`;

		if (proj) {
			return `${baseUrl}/${proj}/${endpoint}`;
		}
		return `${baseUrl}/${endpoint}`;
	}

	/**
	 * Přidá autorizační hlavičku.
	 */
	private getHeaders(): Record<string, string> {
		const auth = Buffer.from(`:${this.pat}`).toString("base64");
		return {
			Authorization: `Basic ${auth}`,
			"Content-Type": "application/json",
		};
	}

	/**
	 * Provede GET požadavek na Azure DevOps API.
	 */
	async get<T>(
		endpoint: string,
		options: { project?: string } = {}
	): Promise<T> {
		const url = this.buildUrl(endpoint, options.project);
		const response = await this.fetch(url, {
			headers: this.getHeaders(),
		});

		return JSON.parse(response);
	}

	/**
	 * Provede POST požadavek na Azure DevOps API (momentálně není plně implementováno v HttpClientu metody,
	 * HttpClient je primárně pro GET. Pro POST budeme muset rozšířit HttpClient nebo použít fetch přímo).
	 *
	 * Vzhledem k tomu, že Base HttpClient je navržen pro GET (caching atd.),
	 * bude lepší pro POST použít přímo fetch uvnitř této třídy,
	 * nebo rozšířit Base HttpClient o metodu request().
	 *
	 * Pro tento úkol (Issue #5) zatím stačí základ pro GET, ale pro Issue #4 budeme potřebovat POST.
	 * Rozšířím Base HttpClient o metodu `post` nebo obecnou `request`.
	 *
	 * Jelikož HttpClient je nyní "jen" wrapper kolem fetch s retry a cache pro GET,
	 * přidám sem prozatím specifickou implementaci POST.
	 */
	async post<T>(
		endpoint: string,
		body: unknown,
		options: { project?: string } = {}
	): Promise<T> {
		// TODO: Implementovat retry logiku pro POST?
		// Pro POST většinou nechceme automatický retry u všech chyb (není idempotentní).
		// Prozatím jednoduchá implementace s fetch.

		const url = this.buildUrl(endpoint, options.project);
		const headers = this.getHeaders();
		const controller = new AbortController();
		// Timeout 10s
		const timeoutId = setTimeout(() => controller.abort(), 10000);

		try {
			const response = await fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(
					`HTTP ${response.status}: ${response.statusText} - ${url}`
				);
			}

			return (await response.json()) as T;
		} finally {
			clearTimeout(timeoutId);
		}
	}
}
