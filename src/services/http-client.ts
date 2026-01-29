/**
 * HTTP klient pro GitHub raw content s retry logikou a cache integrací.
 */

import { CacheService, getDefaultCache } from "./cache.js";

export interface HttpClientOptions {
	/** Timeout v milisekundách (default: 10000) */
	timeout?: number;
	/** Počet pokusů (default: 3) */
	retries?: number;
	/** Prodleva mezi pokusy v ms (default: 1000) */
	retryDelay?: number;
	/** TTL pro cache v ms (default: 3600000 = 1 hodina) */
	cacheTtlMs?: number;
	/** Vlastní cache instance (default: singleton) */
	cache?: CacheService;
}

export interface FetchOptions {
	/** Přeskočit cache a vynutit nový požadavek */
	skipCache?: boolean;
	/** Override TTL pro cache v ms (přepíše výchozí TTL klienta) */
	cacheTtlMs?: number;
}

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000;
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hodina

/**
 * Základní chyba HTTP klienta.
 */
export class HttpClientError extends Error {
	constructor(
		message: string,
		public readonly url: string,
		public readonly cause?: Error
	) {
		super(message);
		this.name = "HttpClientError";
	}
}

/**
 * Chyba pro HTTP 404.
 */
export class NotFoundError extends HttpClientError {
	constructor(url: string) {
		super(`Resource not found: ${url}`, url);
		this.name = "NotFoundError";
	}
}

/**
 * Chyba pro HTTP 429 (rate limiting).
 */
export class RateLimitError extends HttpClientError {
	constructor(
		url: string,
		public readonly retryAfter?: number
	) {
		super(`Rate limit exceeded for: ${url}`, url);
		this.name = "RateLimitError";
	}
}

/**
 * Chyba pro timeout.
 */
export class TimeoutError extends HttpClientError {
	constructor(url: string, timeoutMs: number) {
		super(`Request timeout after ${timeoutMs}ms: ${url}`, url);
		this.name = "TimeoutError";
	}
}

export class HttpClient {
	private timeout: number;
	private retries: number;
	private retryDelay: number;
	private cacheTtlMs: number;
	private cache: CacheService;

	constructor(options: HttpClientOptions = {}) {
		this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
		this.retries = options.retries ?? DEFAULT_RETRIES;
		this.retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY;
		this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
		this.cache = options.cache ?? getDefaultCache();
	}

	/**
	 * Provede HTTP GET požadavek s retry logikou a cache.
	 */
	async fetch(url: string, options: FetchOptions = {}): Promise<string> {
		// Zkusíme cache
		if (!options.skipCache) {
			const cached = this.cache.get<string>(url);
			if (cached !== undefined) {
				return cached;
			}
		}

		// Provedeme požadavek s retry
		const response = await this.fetchWithRetry(url);

		// Uložíme do cache
		this.cache.set(url, response, options.cacheTtlMs ?? this.cacheTtlMs);

		return response;
	}

	private async fetchWithRetry(url: string): Promise<string> {
		let lastError: Error | undefined;

		for (let attempt = 1; attempt <= this.retries; attempt++) {
			try {
				return await this.doFetch(url);
			} catch (error) {
				lastError = error as Error;

				// Některé chyby nemá smysl retryovat
				if (error instanceof NotFoundError || error instanceof TimeoutError) {
					throw error;
				}

				if (error instanceof RateLimitError) {
					// U rate limit čekáme déle
					const delay = error.retryAfter
						? error.retryAfter * 1000
						: this.retryDelay * attempt * 2;
					if (attempt < this.retries) {
						await this.delay(delay);
						continue;
					}
					throw error;
				}

				// Pro ostatní chyby použijeme exponential backoff
				if (attempt < this.retries) {
					const delay = this.retryDelay * Math.pow(2, attempt - 1);
					await this.delay(delay);
				}
			}
		}

		throw new HttpClientError(
			`Failed after ${this.retries} attempts: ${lastError?.message}`,
			url,
			lastError
		);
	}

	private async doFetch(url: string): Promise<string> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const response = await fetch(url, {
				signal: controller.signal,
				headers: {
					Accept: "text/plain, application/json, */*",
					"User-Agent": "azure-pipelines-mcp/0.1.0",
				},
			});

			if (response.status === 404) {
				throw new NotFoundError(url);
			}

			if (response.status === 429) {
				const retryAfter = response.headers.get("Retry-After");
				throw new RateLimitError(
					url,
					retryAfter ? parseInt(retryAfter, 10) : undefined
				);
			}

			if (!response.ok) {
				throw new HttpClientError(
					`HTTP ${response.status}: ${response.statusText}`,
					url
				);
			}

			return await response.text();
		} catch (error) {
			if (error instanceof HttpClientError) {
				throw error;
			}

			if ((error as Error).name === "AbortError") {
				throw new TimeoutError(url, this.timeout);
			}

			throw new HttpClientError(
				`Network error: ${(error as Error).message}`,
				url,
				error as Error
			);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Invaliduje cache pro danou URL.
	 */
	invalidateCache(url: string): void {
		this.cache.delete(url);
	}

	/**
	 * Vymaže celou cache.
	 */
	clearCache(): void {
		this.cache.clear();
	}
}

// Singleton instance
let defaultHttpClientInstance: HttpClient | null = null;

export function getDefaultHttpClient(): HttpClient {
	if (!defaultHttpClientInstance) {
		defaultHttpClientInstance = new HttpClient();
	}
	return defaultHttpClientInstance;
}

/**
 * Resetuje singleton instanci (užitečné pro testy).
 */
export function resetDefaultHttpClient(): void {
	defaultHttpClientInstance = null;
}
