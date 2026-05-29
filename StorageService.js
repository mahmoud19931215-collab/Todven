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
                // التحقق من وجود Dexie
                if (typeof Dexie === 'undefined') {
                    throw new Error('Dexie not loaded');
                }
                
                this.db = new Dexie(CONFIG.DB_NAME);
                
                // تعريف المخطط (schema)
                this.db.version(CONFIG.DB_VERSION).stores({
                    [CONFIG.STORES.IMAGES]: 'url, blob, timestamp',
                    [CONFIG.STORES.API_CACHE]: 'key, data, timestamp'
                });
                
                await this.db.open();
                console.log('[StorageService] IndexedDB initialized successfully');
                this.ready = true;
                this.useFallback = false;
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
                const cacheObj = {
                    data: data,
                    timestamp: timestamp
                };
                localStorage.setItem('apiCache', JSON.stringify(cacheObj));
                console.log('[StorageService] API cache saved to localStorage');
                return true;
            } catch (e) {
                console.error('[StorageService] Failed to save API cache to localStorage', e);
                return false;
            }
        }
        
        try {
            await this.db.apiCache.put({
                key: 'mainData',
                data: data,
                timestamp: timestamp
            });
            console.log('[StorageService] API cache saved to IndexedDB');
            return true;
        } catch (err) {
            console.error('[StorageService] Failed to save API cache', err);
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
                // التحقق من صلاحية الكاش (اختياري)
                if (timestamp && (Date.now() - timestamp) > CONFIG.CACHE_TTL) {
                    console.log('[StorageService] localStorage cache expired');
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
            
            // التحقق من صلاحية الكاش
            if (record.timestamp && (Date.now() - record.timestamp) > CONFIG.CACHE_TTL) {
                console.log('[StorageService] IndexedDB cache expired');
                return null;
            }
            
            return record.data;
        } catch (err) {
            console.error('[StorageService] Failed to get API cache', err);
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
        
        if (this.useFallback) {
            // localStorage لا يدعم تخزين الصور كـ blob، نقوم بتخزين الرابط فقط
            try {
                const imagesIndex = JSON.parse(localStorage.getItem('imagesIndex') || '{}');
                imagesIndex[url] = Date.now();
                localStorage.setItem('imagesIndex', JSON.stringify(imagesIndex));
            } catch(e) {}
            return false;
        }
        
        try {
            await this.db.images.put({
                url: url,
                blob: blob,
                timestamp: Date.now()
            });
            return true;
        } catch (err) {
            console.warn('[StorageService] Failed to save image blob', err);
            return false;
        }
    }

    async getImageBlob(url) {
        if (!url) return null;
        await this.waitForReady();
        
        if (this.useFallback) {
            return null; // localStorage لا يدعم تخزين الصور
        }
        
        try {
            const record = await this.db.images.get(url);
            if (record && record.blob) {
                // التحقق من صلاحية الصورة (اختياري: حذف القديمة)
                return record.blob;
            }
            return null;
        } catch (err) {
            console.warn('[StorageService] Failed to get image blob', err);
            return null;
        }
    }

    // ========== مسح الكاش بالكامل ==========
    async clearAllCache() {
        await this.waitForReady();
        
        if (this.useFallback) {
            try {
                localStorage.removeItem('apiCache');
                localStorage.removeItem('imagesIndex');
                console.log('[StorageService] localStorage cache cleared');
            } catch(e) {}
            return;
        }
        
        try {
            await this.db.images.clear();
            await this.db.apiCache.clear();
            console.log('[StorageService] All IndexedDB caches cleared');
        } catch (err) {
            console.error('[StorageService] Failed to clear caches', err);
        }
    }

    // ========== تنظيف الكاش القديم (اختياري) ==========
    async cleanOldCache(maxAgeMs = CONFIG.CACHE_TTL) {
        await this.waitForReady();
        if (this.useFallback) return;
        
        const expiryTime = Date.now() - maxAgeMs;
        
        try {
            // حذف صور قديمة
            await this.db.images.where('timestamp').below(expiryTime).delete();
            
            // حذف كاش API قديم
            const apiRecord = await this.db.apiCache.get('mainData');
            if (apiRecord && apiRecord.timestamp < expiryTime) {
                await this.db.apiCache.delete('mainData');
            }
            console.log('[StorageService] Old cache cleaned');
        } catch (err) {
            console.warn('[StorageService] Clean cache error', err);
        }
    }
}
