// داخل class App، استبدل دالة fetchFreshData وأضف دوال مساعدة

async fetchFreshData() {
    console.log('[App] Fetching fresh data from', CONFIG.API_URL);
    
    if (!navigator.onLine) {
        throw new Error('No internet connection');
    }
    
    // محاولة جلب البيانات من الرابط الرئيسي أولاً
    let data = null;
    let errorMsg = null;
    
    try {
        data = await this.fetchWithTimeout(CONFIG.API_URL);
        if (this.isValidDataStructure(data)) {
            console.log('[App] Data fetched successfully from primary URL');
            await this.storage.saveApiCache(data);
            this.renderFullData(data);
            this.showToast('تم تحديث البيانات من الخادم', 'success');
            this.showOfflineToast(false);
            this.hideOfflinePage();
            return true;
        } else {
            errorMsg = 'Invalid data structure from primary API';
            console.warn(errorMsg, data);
        }
    } catch (err) {
        errorMsg = err.message;
        console.error('[App] Primary fetch failed:', err);
    }
    
    // إذا فشل الرابط الرئيسي، جرب الرابط الاحتياطي (إذا كان موجوداً)
    if (CONFIG.FALLBACK_API_URL && CONFIG.FALLBACK_API_URL !== "https://api.npoint.io/your-fallback-data") {
        console.log('[App] Trying fallback API URL:', CONFIG.FALLBACK_API_URL);
        try {
            data = await this.fetchWithTimeout(CONFIG.FALLBACK_API_URL);
            if (this.isValidDataStructure(data)) {
                console.log('[App] Data fetched successfully from fallback URL');
                await this.storage.saveApiCache(data);
                this.renderFullData(data);
                this.showToast('تم تحديث البيانات من الخادم الاحتياطي', 'success');
                this.showOfflineToast(false);
                this.hideOfflinePage();
                return true;
            } else {
                console.warn('Invalid data structure from fallback API');
            }
        } catch (err) {
            console.error('[App] Fallback fetch failed:', err);
            errorMsg = err.message;
        }
    }
    
    // إذا فشلت جميع المحاولات
    if (!this.fullData) {
        this.showOfflinePage();
    } else {
        this.showOfflineToast(true, await this.storage.getLastUpdateTimestamp());
    }
    this.showToast(`فشل الاتصال بالخادم: ${errorMsg}`, 'error');
    throw new Error(errorMsg);
}

// دالة مساعدة للجلب مع مهلة زمنية
async fetchWithTimeout(url, timeout = CONFIG.FETCH_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, { 
            signal: controller.signal,
            headers: { 
                'Accept': 'application/json',
                'Cache-Control': 'no-cache, no-store'
            },
            mode: 'cors'
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error('Invalid JSON response: ' + e.message);
        }
        
        return data;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

// التحقق من صحة بنية البيانات (يجب أن تكون object وليست array فارغة)
isValidDataStructure(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return false;
    }
    // على الأقل تصنيف رئيسي واحد
    if (Object.keys(data).length === 0) {
        return false;
    }
    // التحقق من وجود تصنيفات فرعية ومنتجات
    for (const mainCat of Object.keys(data)) {
        const subCats = data[mainCat];
        if (typeof subCats !== 'object' || Array.isArray(subCats)) {
            return false;
        }
        let hasProducts = false;
        for (const subCat of Object.keys(subCats)) {
            const products = subCats[subCat];
            if (Array.isArray(products) && products.length > 0) {
                hasProducts = true;
                break;
            }
        }
        if (!hasProducts) return false;
    }
    return true;
}

// تعديل fetchFreshDataWithRetry لاستخدام الدوال الجديدة
async fetchFreshDataWithRetry(retries = CONFIG.FETCH_RETRY_COUNT) {
    for (let i = 0; i < retries; i++) {
        try {
            await this.fetchFreshData();
            return true;
        } catch (err) {
            console.warn(`[App] Fetch attempt ${i+1}/${retries} failed:`, err.message);
            if (i === retries - 1) {
                // بعد فشل كل المحاولات، لا نرمي خطأ مرة أخرى، فقط نعرض الحالة
                return false;
            }
            await sleep(1500 * (i + 1));
        }
    }
    return false;
}
