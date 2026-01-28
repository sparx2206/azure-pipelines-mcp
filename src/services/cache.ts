/**
 * In-memory cache služba s konfigurovatelným TTL.
 * Používá lazy cleanup - položky jsou odstraněny až při pokusu o čtení.
 */

export interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

export interface CacheOptions {
	/** Default TTL v milisekundách (default: 1 hodina) */
	defaultTtlMs?: number;
}

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hodina

export class CacheService {
	private cache: Map<string, CacheEntry<unknown>> = new Map();
	private defaultTtlMs: number;

	constructor(options: CacheOptions = {}) {
		this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS;
	}

	/**
	 * Získá data z cache. Vrací undefined pokud klíč neexistuje nebo vypršel.
	 */
	get<T>(key: string): T | undefined {
		const entry = this.cache.get(key);

		if (!entry) {
			return undefined;
		}

		// Lazy cleanup - odstraníme expirované položky při čtení
		if (Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			return undefined;
		}

		return entry.data as T;
	}

	/**
	 * Uloží data do cache s volitelným TTL.
	 */
	set<T>(key: string, data: T, ttlMs?: number): void {
		const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
		this.cache.set(key, { data, expiresAt });
	}

	/**
	 * Kontroluje, zda klíč existuje a není expirovaný.
	 */
	has(key: string): boolean {
		return this.get(key) !== undefined;
	}

	/**
	 * Smaže položku z cache.
	 */
	delete(key: string): boolean {
		return this.cache.delete(key);
	}

	/**
	 * Vymaže celou cache.
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Vrátí počet položek v cache (včetně potenciálně expirovaných).
	 */
	get size(): number {
		return this.cache.size;
	}
}

// Singleton instance pro sdílené použití
let defaultCacheInstance: CacheService | null = null;

export function getDefaultCache(): CacheService {
	if (!defaultCacheInstance) {
		defaultCacheInstance = new CacheService();
	}
	return defaultCacheInstance;
}

/**
 * Resetuje singleton instanci (užitečné pro testy).
 */
export function resetDefaultCache(): void {
	defaultCacheInstance = null;
}
