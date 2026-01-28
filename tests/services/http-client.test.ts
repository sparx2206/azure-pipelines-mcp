import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	HttpClient,
	HttpClientError,
	NotFoundError,
	RateLimitError,
	TimeoutError,
	getDefaultHttpClient,
	resetDefaultHttpClient,
} from "../../src/services/http-client.js";
import { CacheService, resetDefaultCache } from "../../src/services/cache.js";

describe("HttpClient", () => {
	let cache: CacheService;
	let client: HttpClient;

	beforeEach(() => {
		cache = new CacheService();
		client = new HttpClient({
			cache,
			timeout: 5000,
			retries: 3,
			retryDelay: 100,
		});
		vi.restoreAllMocks();
	});

	afterEach(() => {
		resetDefaultCache();
		resetDefaultHttpClient();
	});

	describe("successful fetch", () => {
		it("returns response text on success", async () => {
			const mockResponse = "Hello, World!";
			vi.spyOn(global, "fetch").mockResolvedValueOnce(
				new Response(mockResponse, { status: 200 })
			);

			const result = await client.fetch("https://example.com/test");
			expect(result).toBe(mockResponse);
		});

		it("caches successful response", async () => {
			const mockResponse = "Cached content";
			const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
				new Response(mockResponse, { status: 200 })
			);

			// První volání - fetch
			await client.fetch("https://example.com/cached");
			expect(fetchSpy).toHaveBeenCalledTimes(1);

			// Druhé volání - z cache
			const result = await client.fetch("https://example.com/cached");
			expect(result).toBe(mockResponse);
			expect(fetchSpy).toHaveBeenCalledTimes(1); // Stále jen 1 volání
		});

		it("skips cache when skipCache is true", async () => {
			const fetchSpy = vi
				.spyOn(global, "fetch")
				.mockResolvedValueOnce(new Response("first", { status: 200 }))
				.mockResolvedValueOnce(new Response("second", { status: 200 }));

			await client.fetch("https://example.com/skip");
			const result = await client.fetch("https://example.com/skip", {
				skipCache: true,
			});

			expect(result).toBe("second");
			expect(fetchSpy).toHaveBeenCalledTimes(2);
		});
	});

	describe("retry logic", () => {
		it("retries on network error and succeeds", async () => {
			const fetchSpy = vi
				.spyOn(global, "fetch")
				.mockRejectedValueOnce(new Error("Network error"))
				.mockResolvedValueOnce(new Response("Success", { status: 200 }));

			const result = await client.fetch("https://example.com/retry");
			expect(result).toBe("Success");
			expect(fetchSpy).toHaveBeenCalledTimes(2);
		});

		it("throws after max retries", async () => {
			vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

			await expect(client.fetch("https://example.com/fail")).rejects.toThrow(
				HttpClientError
			);
		});

		it("does not retry on 404", async () => {
			const fetchSpy = vi
				.spyOn(global, "fetch")
				.mockResolvedValueOnce(new Response("", { status: 404 }));

			await expect(
				client.fetch("https://example.com/notfound")
			).rejects.toThrow(NotFoundError);
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe("error handling", () => {
		it("throws NotFoundError on 404", async () => {
			vi.spyOn(global, "fetch").mockResolvedValueOnce(
				new Response("", { status: 404 })
			);

			await expect(
				client.fetch("https://example.com/notfound")
			).rejects.toThrow(NotFoundError);
		});

		it("throws RateLimitError on 429", async () => {
			// Použijeme klienta s retries: 1 aby test nemusel čekat na retry
			const noRetryClient = new HttpClient({
				cache,
				retries: 1,
			});

			vi.spyOn(global, "fetch").mockResolvedValue(
				new Response("", {
					status: 429,
					headers: { "Retry-After": "60" },
				})
			);

			await expect(
				noRetryClient.fetch("https://example.com/ratelimit")
			).rejects.toThrow(RateLimitError);
		});

		it("throws RateLimitError with retryAfter value", async () => {
			// Použijeme klienta s retries: 1 aby test nemusel čekat na retry
			const noRetryClient = new HttpClient({
				cache,
				retries: 1,
			});

			vi.spyOn(global, "fetch").mockResolvedValue(
				new Response("", {
					status: 429,
					headers: { "Retry-After": "120" },
				})
			);

			try {
				await noRetryClient.fetch("https://example.com/ratelimit");
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(RateLimitError);
				expect((error as RateLimitError).retryAfter).toBe(120);
			}
		});

		it("throws HttpClientError on other HTTP errors", async () => {
			vi.spyOn(global, "fetch").mockResolvedValue(
				new Response("", { status: 500, statusText: "Internal Server Error" })
			);

			await expect(
				client.fetch("https://example.com/error")
			).rejects.toThrow(HttpClientError);
		});

		it("throws TimeoutError on timeout", async () => {
			const fastClient = new HttpClient({
				cache,
				timeout: 10,
				retries: 1,
			});

			// Mock fetch který respektuje AbortSignal
			vi.spyOn(global, "fetch").mockImplementation(
				(_url, options) =>
					new Promise((resolve, reject) => {
						const signal = options?.signal;

						// Pokud už je aborted, okamžitě rejectujeme
						if (signal?.aborted) {
							reject(new DOMException("Aborted", "AbortError"));
							return;
						}

						const timeoutId = setTimeout(() => resolve(new Response("late")), 100);
						signal?.addEventListener("abort", () => {
							clearTimeout(timeoutId);
							reject(new DOMException("Aborted", "AbortError"));
						});
					})
			);

			try {
				await fastClient.fetch("https://example.com/slow");
				expect.fail("Should have thrown");
			} catch (error) {
				expect(error).toBeInstanceOf(TimeoutError);
				expect((error as TimeoutError).name).toBe("TimeoutError");
				expect((error as TimeoutError).url).toBe("https://example.com/slow");
			}
		});
	});

	describe("cache management", () => {
		it("invalidates cache for specific URL", async () => {
			vi.spyOn(global, "fetch")
				.mockResolvedValueOnce(new Response("first", { status: 200 }))
				.mockResolvedValueOnce(new Response("second", { status: 200 }));

			await client.fetch("https://example.com/inv");
			client.invalidateCache("https://example.com/inv");
			const result = await client.fetch("https://example.com/inv");

			expect(result).toBe("second");
		});

		it("clears entire cache", async () => {
			vi.spyOn(global, "fetch")
				.mockResolvedValueOnce(new Response("a", { status: 200 }))
				.mockResolvedValueOnce(new Response("b", { status: 200 }))
				.mockResolvedValueOnce(new Response("a2", { status: 200 }))
				.mockResolvedValueOnce(new Response("b2", { status: 200 }));

			await client.fetch("https://example.com/a");
			await client.fetch("https://example.com/b");

			client.clearCache();

			const resultA = await client.fetch("https://example.com/a");
			const resultB = await client.fetch("https://example.com/b");

			expect(resultA).toBe("a2");
			expect(resultB).toBe("b2");
		});
	});

	describe("singleton", () => {
		it("returns the same instance", () => {
			const instance1 = getDefaultHttpClient();
			const instance2 = getDefaultHttpClient();
			expect(instance1).toBe(instance2);
		});

		it("resets singleton correctly", () => {
			const instance1 = getDefaultHttpClient();
			resetDefaultHttpClient();
			const instance2 = getDefaultHttpClient();
			expect(instance1).not.toBe(instance2);
		});
	});
});
