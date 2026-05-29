import { CONFIG } from './config.js';

export class StorageService {
    constructor() {
        this.db = null;
        this.ready = false;
        this.useFallback = false;
        this.initPromise = null;
    }

    async init() {
        if (this.initPromise) return this.initPromise;
        
        this.initPromise = new Promise(async (resolve) => {
            try {
                if (typeof Dexie === 'undefined') {
                    throw new Error('Dexie not loaded');
                }
                
                this.db = new Dexie(CONFIG.DB_NAME);
                
                this.db.version(CONFIG.DB_VERSION).stores({
                    [CONFIG.STORES.IMAGES]: 'url, blob, timestamp',
                    [CONFIG.STORES.API_CACHE]: 'key, data, timestamp'
                });
                
                await this.db.open();
                console.log('[StorageService] IndexedDB initialized');
                this.ready = true;
                this.useFallback = false;
                
                // تنظيف الكاش القديم تلقائيًا
                await this.cleanOldCache();
                resolve();
            } catch (err) {
                console.warn('[StorageService] IndexedDB failed, using localStorage fallback', err);
                this.useFallback = true;
                this.ready = true;
                resolve();
            }
        });
        
        return this.initPromise;
    }

    async waitForReady() {
        if (!this.ready) {
            await this.init();
        }
    }

    // ========== إدارة كاش API ==========
    async saveApiCache(data) {
        await this.waitForReady();
        const timestamp = Date.now();
        
        if (this.useFallback) {
            try {
                const cacheObj = { data, timestamp };
                localStorage.setItem('apiCache', JSON.stringify(cacheObj));
                return true;
            } catch (e) {
                return false;
            }
        }
        
        try {
            await this.db.apiCache.put({ key: 'mainData', data, timestamp });
            return true;
        } catch (err) {
            return false;
        }
    }

    async getApiCache() {
        await this.waitForReady();
        
        if (this.useFallback) {
            try {
                const cached = localStorage.getItem('apiCache');
                if (!cached) return null;
                const { data, timestamp } = JSON.parse(cached);
                if (timestamp && (Date.now() - timestamp) > CONFIG.CACHE_TTL) {
                    return null;
                }
                return data;
            } catch (e) {
                return null;
            }
        }
        
        try {
            const record = await this.db.apiCache.get('mainData');
            if (!record) return null;
            if (record.timestamp && (Date.now() - record.timestamp) > CONFIG.CACHE_TTL) {
                return null;
            }
            return record.data;
        } catch (err) {
            return null;
        }
    }

    async getLastUpdateTimestamp() {
        await this.waitForReady();
        
        if (this.useFallback) {
            try {
                const cached = localStorage.getItem('apiCache');
                if (cached) {
                    const { timestamp } = JSON.parse(cached);
                    return timestamp || null;
                }
                return null;
            } catch(e) {
                return null;
            }
        }
        
        try {
            const record = await this.db.apiCache.get('mainData');
            return record ? record.timestamp : null;
        } catch(e) {
            return null;
        }
    }

    // ========== إدارة صور المنتجات ==========
    async saveImageBlob(url, blob) {
        if (!url || !blob) return false;
        await this.waitForReady();
        
        if (this.useFallback) return false;
        
        try {
            await this.db.images.put({ url, blob, timestamp: Date.now() });
            return true;
        } catch (err) {
            return false;
        }
    }

    async getImageBlob(url) {
        if (!url) return null;
        await this.waitForReady();
        
        if (this.useFallback) return null;
        
        try {
            const record = await this.db.images.get(url);
            return record ? record.blob : null;
        } catch (err) {
            return null;
        }
    }

    // ========== مسح الكاش بالكامل ==========
    async clearAllCache() {
        await this.waitForReady();
        
        if (this.useFallback) {
            localStorage.removeItem('apiCache');
            localStorage.removeItem('imagesIndex');
            return;
        }
        
        try {
            await this.db.images.clear();
            await this.db.apiCache.clear();
        } catch (err) {
            console.error('[StorageService] Clear cache error', err);
        }
    }

    // ========== تنظيف الكاش القديم ==========
    async cleanOldCache(maxAgeMs = CONFIG.CACHE_TTL) {
        await this.waitForReady();
        if (this.useFallback) return;
        
        const expiryTime = Date.now() - maxAgeMs;
        
        try {
            await this.db.images.where('timestamp').below(expiryTime).delete();
            
            const apiRecord = await this.db.apiCache.get('mainData');
            if (apiRecord && apiRecord.timestamp < expiryTime) {
                await this.db.apiCache.delete('mainData');
            }
        } catch (err) {
            console.warn('[StorageService] Clean cache error', err);
        }
    }
}
