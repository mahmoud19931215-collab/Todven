import { CONFIG } from './config.js';

export class StorageService {
    constructor() { this.db = null; this.useFallback = false; this.ready = false; this.initPromise = this.init(); }
    async init() { try { this.db = new Dexie(CONFIG.DB_NAME); this.db.version(CONFIG.DB_VERSION).stores({ [CONFIG.STORES.IMAGES]: "url", [CONFIG.STORES.API_CACHE]: "key" }); await this.db.open(); } catch(e) { console.warn("IndexedDB failed", e); this.useFallback = true; } this.ready = true; }
    async waitForReady() { if (this.ready) return; await this.initPromise; }
    async getImageBlob(url) { await this.waitForReady(); if (!url) return null; if (this.useFallback) { const data = localStorage.getItem(`img_${url}`); if (data?.startsWith("data:image")) { const r = await fetch(data); return await r.blob(); } return null; } try { const r = await this.db.images.get(url); return r?.blob || null; } catch(e) { return null; } }
    async saveImageBlob(url, blob) { await this.waitForReady(); if (!url || !blob) return; if (this.useFallback) { const r = new FileReader(); r.onloadend = () => { try { localStorage.setItem(`img_${url}`, r.result); } catch(e) {} }; r.readAsDataURL(blob); return; } try { await this.db.images.put({ url, blob }); } catch(e) {} }
    async getApiCache() { await this.waitForReady(); if (this.useFallback) { const c = localStorage.getItem("apiCache"); if (c) { const { timestamp, data } = JSON.parse(c); if (Date.now() - timestamp < CONFIG.CACHE_TTL) return data; } return null; } try { const r = await this.db.apiCache.get("mainData"); if (r && Date.now() - r.timestamp < CONFIG.CACHE_TTL) return r.data; return null; } catch(e) { return null; } }
    async saveApiCache(data) { await this.waitForReady(); if (this.useFallback) { localStorage.setItem("apiCache", JSON.stringify({ timestamp: Date.now(), data })); return; } try { await this.db.apiCache.put({ key: "mainData", timestamp: Date.now(), data }); } catch(e) {} }
    async clearAllCache() { await this.waitForReady(); if (this.useFallback) { Object.keys(localStorage).forEach(k => { if (k.startsWith("img_") || k === "apiCache") localStorage.removeItem(k); }); return; } try { await this.db.images.clear(); await this.db.apiCache.clear(); } catch(e) {} }
    saveCart(cartMap) { try { localStorage.setItem(CONFIG.STORAGE_KEYS.CART, JSON.stringify(cartMap)); } catch(e) {} }
    loadCart() { try { const s = localStorage.getItem(CONFIG.STORAGE_KEYS.CART); return s ? JSON.parse(s) : {}; } catch(e) { return {}; } }
    getLastUpdateTimestamp() { if (this.useFallback) { const c = localStorage.getItem("apiCache"); if (c) return JSON.parse(c).timestamp; } return null; }
}
