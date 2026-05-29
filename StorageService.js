async getLastUpdateTimestamp() {
    await this.waitForReady();
    if (this.useFallback) {
        const cached = localStorage.getItem("apiCache");
        if (cached) {
            try {
                const { timestamp } = JSON.parse(cached);
                return timestamp || null;
            } catch(e) { return null; }
        }
        return null;
    }
    try {
        const record = await this.db.apiCache.get("mainData");
        return record ? record.timestamp : null;
    } catch(e) {
        return null;
    }
}
