import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { CacheService, getDefaultCache, resetDefaultCache } from "../../src/services/cache.js";

describe("CacheService", () => {
	let cache: CacheService;

	beforeEach(() => {
		cache = new CacheService();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("set and get", () => {
		it("stores and retrieves a string value", () => {
			cache.set("key1", "value1");
			expect(cache.get<string>("key1")).toBe("value1");
		});

		it("stores and retrieves an object value", () => {
			const obj = { name: "test", count: 42 };
			cache.set("key2", obj);
			expect(cache.get<typeof obj>("key2")).toEqual(obj);
		});

		it("stores and retrieves an array value", () => {
			const arr = [1, 2, 3, "test"];
			cache.set("key3", arr);
			expect(cache.get<typeof arr>("key3")).toEqual(arr);
		});

		it("returns undefined for non-existent key", () => {
			expect(cache.get("nonexistent")).toBeUndefined();
		});
	});

	describe("TTL expiration", () => {
		it("returns value before TTL expires", () => {
			cache.set("key", "value", 5000); // 5 sekund TTL
			vi.advanceTimersByTime(4999);
			expect(cache.get<string>("key")).toBe("value");
		});

		it("returns undefined after TTL expires", () => {
			cache.set("key", "value", 5000);
			vi.advanceTimersByTime(5001);
			expect(cache.get("key")).toBeUndefined();
		});

		it("uses default TTL when not specified", () => {
			const customCache = new CacheService({ defaultTtlMs: 1000 });
			customCache.set("key", "value");

			vi.advanceTimersByTime(999);
			expect(customCache.get<string>("key")).toBe("value");

			vi.advanceTimersByTime(2);
			expect(customCache.get("key")).toBeUndefined();
		});

		it("removes expired entry from cache on access (lazy cleanup)", () => {
			cache.set("key", "value", 1000);
			expect(cache.size).toBe(1);

			vi.advanceTimersByTime(1001);
			cache.get("key"); // Trigger lazy cleanup
			expect(cache.size).toBe(0);
		});
	});

	describe("has", () => {
		it("returns true for existing non-expired key", () => {
			cache.set("key", "value");
			expect(cache.has("key")).toBe(true);
		});

		it("returns false for non-existent key", () => {
			expect(cache.has("nonexistent")).toBe(false);
		});

		it("returns false for expired key", () => {
			cache.set("key", "value", 1000);
			vi.advanceTimersByTime(1001);
			expect(cache.has("key")).toBe(false);
		});
	});

	describe("delete", () => {
		it("removes existing key", () => {
			cache.set("key", "value");
			expect(cache.delete("key")).toBe(true);
			expect(cache.get("key")).toBeUndefined();
		});

		it("returns false for non-existent key", () => {
			expect(cache.delete("nonexistent")).toBe(false);
		});
	});

	describe("clear", () => {
		it("removes all entries", () => {
			cache.set("key1", "value1");
			cache.set("key2", "value2");
			cache.set("key3", "value3");

			cache.clear();

			expect(cache.size).toBe(0);
			expect(cache.get("key1")).toBeUndefined();
			expect(cache.get("key2")).toBeUndefined();
			expect(cache.get("key3")).toBeUndefined();
		});
	});

	describe("singleton", () => {
		beforeEach(() => {
			resetDefaultCache();
		});

		afterEach(() => {
			resetDefaultCache();
		});

		it("returns the same instance", () => {
			const instance1 = getDefaultCache();
			const instance2 = getDefaultCache();
			expect(instance1).toBe(instance2);
		});

		it("shares data across calls", () => {
			const instance1 = getDefaultCache();
			instance1.set("shared", "data");

			const instance2 = getDefaultCache();
			expect(instance2.get<string>("shared")).toBe("data");
		});

		it("resets singleton correctly", () => {
			const instance1 = getDefaultCache();
			instance1.set("key", "value");

			resetDefaultCache();

			const instance2 = getDefaultCache();
			expect(instance2.get("key")).toBeUndefined();
			expect(instance1).not.toBe(instance2);
		});
	});
});
