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

	/**
	 * Vrátí aktuálně nastavený projekt (pokud existuje).
	 */
	public getProject(): string | undefined {
		return this.project;
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
		const normalizedEndpoint = endpoint.trim().replace(/^\/+/, "");
		const apiVersion = "7.1";

		let url: string;
		if (proj) {
			url = `${baseUrl}/${proj}/${normalizedEndpoint}`;
		} else {
			url = `${baseUrl}/${normalizedEndpoint}`;
		}

		// Skip if api-version already present
		if (/[?&]api-version=/.test(url)) {
			return url;
		}

		const separator = url.includes("?") ? "&" : "?";
		return `${url}${separator}api-version=${apiVersion}`;
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
	 * Pomocná metoda pro zpracování odpovědi a chyb.
	 */
	private async handleResponse<T>(response: Response, url: string): Promise<T> {
		if (!response.ok) {
			let errorBody = await response.text().catch(() => "");
			if (errorBody.includes("<!DOCTYPE html") || errorBody.includes("<html>")) {
				// Extract title from HTML if possible
				const titleMatch = errorBody.match(/<title>(.*?)<\/title>/i);
				errorBody = titleMatch 
					? `HTML Error: ${titleMatch[1]}` 
					: "HTML Error (possibly 404 or authentication issue)";
			} else if (errorBody.length > 1000) {
				errorBody = errorBody.substring(0, 1000) + "... (truncated)";
			}

			throw new Error(
				`HTTP ${response.status}: ${response.statusText} - ${url}${errorBody ? ` - ${errorBody}` : ""}`
			);
		}
		return (await response.json()) as T;
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
	 * Performs a POST request to Azure DevOps API.
	 */
	async post<T>(
		endpoint: string,
		body: unknown,
		options: { project?: string } = {}
	): Promise<T> {
		const url = this.buildUrl(endpoint, options.project);
		const headers = this.getHeaders();
		const controller = new AbortController();

		const timeoutId = setTimeout(
			() => controller.abort(),
			this.timeout ?? 10000
		);

		try {
			const response = await fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
				signal: controller.signal,
			});

			return await this.handleResponse<T>(response, url);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Performs a PUT request to Azure DevOps API.
	 */
	async put<T>(
		endpoint: string,
		body: unknown,
		options: { project?: string } = {}
	): Promise<T> {
		const url = this.buildUrl(endpoint, options.project);
		const headers = this.getHeaders();
		const controller = new AbortController();

		const timeoutId = setTimeout(
			() => controller.abort(),
			this.timeout ?? 10000
		);

		try {
			const response = await fetch(url, {
				method: "PUT",
				headers,
				body: JSON.stringify(body),
				signal: controller.signal,
			});

			return await this.handleResponse<T>(response, url);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Ensures a folder exists in Azure DevOps build folders.
	 * Creates the folder if it doesn't exist, ignores errors if it already exists.
	 * @param folderPath The folder path (e.g., "\\AI\\DummyValidationPipeline")
	 * @param project Optional project override
	 */
	async ensureFolderExists(
		folderPath: string,
		project?: string
	): Promise<void> {
		const endpoint = `_apis/build/folders?path=${encodeURIComponent(folderPath)}`;

		try {
			await this.put(
				endpoint,
				{ path: folderPath },
				{ project }
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : "";
			if (!message.includes("409") && !message.includes("400")) {
				throw error;
			}
		}
	}
}
