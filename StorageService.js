import { CONFIG } from './config.js';

export class StorageService {
    constructor() {
        this.db = null;
        this.useFallback = false;
        this.ready = false;
        this.initPromise = this.init();
    }

    async init() {
        try {
            if (!window.Dexie) {
                throw new Error("Dexie library not loaded");
            }
            this.db = new Dexie(CONFIG.DB_NAME);
            this.db.version(CONFIG.DB_VERSION).stores({
                [CONFIG.STORES.IMAGES]: "url",
                [CONFIG.STORES.API_CACHE]: "key"
            });
            await this.db.open();
            console.log("[Storage] IndexedDB ready");
        } catch (err) {
            console.warn("[Storage] IndexedDB failed, using localStorage fallback", err);
            this.useFallback = true;
        }
        this.ready = true;
    }

    async waitForReady() {
        if (this.ready) return;
        await this.initPromise;
    }

    // ========== إدارة الصور ==========
    async getImageBlob(url) {
        await this.waitForReady();
        if (!url) return null;

        if (this.useFallback) {
            const data = localStorage.getItem(`img_${url}`);
            if (data && data.startsWith("data:image")) {
                const response = await fetch(data);
                return await response.blob();
            }
            return null;
        }

        try {
            const record = await this.db.images.get(url);
            return record ? record.blob : null;
        } catch (e) {
            console.warn("[Storage] getImageBlob error", e);
            return null;
        }
    }

    async saveImageBlob(url, blob) {
        await this.waitForReady();
        if (!url || !blob) return;

        if (this.useFallback) {
            const reader = new FileReader();
            reader.onloadend = () => {
                try {
                    localStorage.setItem(`img_${url}`, reader.result);
                } catch (e) {
                    console.warn("[Storage] localStorage full", e);
                }
            };
            reader.readAsDataURL(blob);
            return;
        }

        try {
            await this.db.images.put({ url, blob });
        } catch (e) {
            console.warn("[Storage] saveImageBlob failed", e);
        }
    }

    // ========== إدارة كاش API ==========
    async getApiCache() {
        await this.waitForReady();
        
        let record = null;
        
        if (this.useFallback) {
            const cached = localStorage.getItem("apiCache");
            if (cached) {
                try {
                    const { timestamp, data } = JSON.parse(cached);
                    // التحقق من صلاحية الكاش
                    if (timestamp && (Date.now() - timestamp < CONFIG.CACHE_TTL)) {
                        // التحقق من صحة البيانات (يجب أن تكون object غير فارغ)
                        if (data && typeof data === 'object' && Object.keys(data).length > 0) {
                            console.log("[Storage] Returning valid cached data from localStorage");
                            return data;
                        } else {
                            console.warn("[Storage] Cached data is invalid (empty or not object)");
                            localStorage.removeItem("apiCache");
                        }
                    } else {
                        console.log("[Storage] Cached data expired");
                        localStorage.removeItem("apiCache");
                    }
                } catch (e) {
                    console.warn("[Storage] Failed to parse cached data", e);
                    localStorage.removeItem("apiCache");
                }
            }
            return null;
        }
        
        // IndexedDB mode
        try {
            record = await this.db.apiCache.get("mainData");
            if (record && record.timestamp && (Date.now() - record.timestamp < CONFIG.CACHE_TTL)) {
                // التحقق من صحة البيانات
                if (record.data && typeof record.data === 'object' && Object.keys(record.data).length > 0) {
                    console.log("[Storage] Returning valid cached data from IndexedDB");
                    return record.data;
                } else {
                    console.warn("[Storage] Cached data is invalid, deleting");
                    await this.db.apiCache.delete("mainData");
                }
            } else if (record) {
                console.log("[Storage] Cached data expired");
                await this.db.apiCache.delete("mainData");
            }
        } catch (e) {
            console.warn("[Storage] getApiCache error", e);
        }
        return null;
    }

    async saveApiCache(data) {
        await this.waitForReady();
        
        // التحقق من صحة البيانات قبل الحفظ
        if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
            console.warn("[Storage] Refusing to save invalid API cache");
            return;
        }
        
        if (this.useFallback) {
            try {
                localStorage.setItem("apiCache", JSON.stringify({
                    timestamp: Date.now(),
                    data: data
                }));
                console.log("[Storage] API cache saved to localStorage");
            } catch (e) {
                console.warn("[Storage] Failed to save API cache to localStorage", e);
            }
            return;
        }
        
        try {
            await this.db.apiCache.put({
                key: "mainData",
                timestamp: Date.now(),
                data: data
            });
            console.log("[Storage] API cache saved to IndexedDB");
        } catch (e) {
            console.warn("[Storage] saveApiCache failed", e);
        }
    }

    async clearAllCache() {
        await this.waitForReady();
        
        if (this.useFallback) {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith("img_") || key === "apiCache") {
                    localStorage.removeItem(key);
                }
            });
            console.log("[Storage] All cache cleared from localStorage");
            return;
        }
        
        try {
            await this.db.images.clear();
            await this.db.apiCache.clear();
            console.log("[Storage] All cache cleared from IndexedDB");
        } catch (e) {
            console.warn("[Storage] clearAllCache failed", e);
        }
    }
    
    // دوال مساعدة للسلة (موجودة سابقاً لكن مع تحسين)
    saveCart(cartMap) {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEYS.CART, JSON.stringify(cartMap));
        } catch (e) {
            console.warn("[Storage] saveCart failed", e);
        }
    }
    
    loadCart() {
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.CART);
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.warn("[Storage] loadCart failed", e);
            return {};
        }
    }
    
    getLastUpdateTimestamp() {
        if (this.useFallback) {
            const cached = localStorage.getItem("apiCache");
            if (cached) {
                try {
                    const { timestamp } = JSON.parse(cached);
                    return timestamp;
                } catch(e) {}
            }
        } else {
            // يمكن قراءة من IndexedDB ولكنها عملية غير متزامنة، لهذا نعيد null
            // يمكن تنفيذها بشكل غير متزامن إذا لزم الأمر
        }
        return null;
    }
    
    // دالة للحصول على حجم الكاش (للواجهة)
    async getCacheSize() {
        await this.waitForReady();
        if (this.useFallback) {
            let total = 0;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('img_') || key === 'apiCache')) {
                    const item = localStorage.getItem(key);
                    total += item ? item.length : 0;
                }
            }
            return total;
        }
        
        try {
            const imagesCount = await this.db.images.count();
            const apiCount = await this.db.apiCache.count();
            return { imagesCount, apiCount };
        } catch(e) {
            return null;
        }
    }
}
