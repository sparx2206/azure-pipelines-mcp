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
	 *
	 * NOTE: No automatic retry for POST requests because they are not idempotent.
	 * Retrying a non-idempotent operation could cause duplicate side-effects
	 * (e.g., creating multiple pipelines, triggering multiple builds).
	 * Callers should implement their own retry logic if needed for specific endpoints.
	 */
	async post<T>(
		endpoint: string,
		body: unknown,
		options: { project?: string } = {}
	): Promise<T> {

		const url = this.buildUrl(endpoint, options.project);
		const headers = this.getHeaders();
		const controller = new AbortController();

		// Use configured timeout or default 10s
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

	/**
	 * Performs a PUT request to Azure DevOps API.
	 *
	 * NOTE: PUT is typically idempotent, but we don't implement retry
	 * to keep behavior consistent with POST.
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
