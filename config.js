// ==================== إعدادات التطبيق الرئيسية ====================
export const CONFIG = {
    // رقم واتساب المستهدف (بدون +)
    TARGET_NUMBER: "963945083365",
    
    // رابط API (Google Sheets)
    API_URL: "https://script.google.com/macros/s/AKfycbwrXoE1tAYJb6D19UM9M-FSUDE9AMd73cj0u35bL7tyG902QN0B6nuDFisNQfgEwELq/exec",
    
    // إعدادات العرض
    ITEMS_PER_PAGE: 12,
    SECTIONS_PER_LOAD: 6,
    
    // إعدادات الكاش والتخزين
    CACHE_TTL: 3600000,        // 1 hour
    DB_NAME: "TogvenDB",
    DB_VERSION: 5,              // تمت الترقية للإصدار الجديد
    STORES: {
        IMAGES: "images",
        API_CACHE: "apiCache",
        OFFLINE_ACTIONS: "offlineActions"  // للميزات المستقبلية
    },
    
    // إعدادات الشبكة
    DEBOUNCE_DELAY: 150,
    FETCH_RETRY_COUNT: 3,
    FETCH_TIMEOUT: 15000,       // 15 ثانية
    
    // الثيم الافتراضي
    DEFAULT_THEME: "light",
    
    // مفاتيح التخزين المحلي
    STORAGE_KEYS: {
        CART: "togven_cart",
        THEME: "togven_theme",
        OFFLINE_BANNER_SHOWN: "offline_banner_dismissed",
        USER_PREFERENCES: "togven_preferences",
        LAST_VISIT: "togven_last_visit"
    },
    
    // إعدادات الصور
    IMAGE_PLACEHOLDER: "https://via.placeholder.com/300x300?text=No+Image",
    IMAGE_LOADING_TIMEOUT: 8000,
    MAX_IMAGE_RETRIES: 2,
    
    // إعدادات السلة
    MAX_CART_ITEMS: 999,
    CART_STORAGE_VERSION: 2,
    
    // إعدادات التحليلات (اختياري)
    ENABLE_ANALYTICS: false,
    ANALYTICS_ID: "",
    
    // إعدادات الإشعارات
    ENABLE_NOTIFICATIONS: false,
    
    // مدة عرض الإشعارات (مللي ثانية)
    TOAST_DURATION: 3000,
    
    // حد أدنى للبحث
    MIN_SEARCH_LENGTH: 2,
    
    // إعدادات الـ Service Worker
    SW_CACHE_VERSION: "v3.0.0"
};

// دالة لتوليد مفتاح فريد للمنتج
export function getProductKey(productName, category = "") {
    return `${category}-${productName}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "_")
        .substring(0, 100);
}

// التحقق من صحة رابط الصورة
export function isValidImageUrl(url) {
    return url && typeof url === 'string' && 
           (url.startsWith("http://") || url.startsWith("https://")) &&
           !url.includes("placeholder");
}

// دالة تأخير (Promise)
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// تنسيق العملة
export function formatCurrency(amount) {
    if (isNaN(amount)) amount = 0;
    return amount.toLocaleString("ar-EG") + " ل.س";
}

// ترميز النص لـ HTML
export function escapeHtml(str) {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// فك ترميز HTML
export function unescapeHtml(str) {
    if (!str) return "";
    return str
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

// توليد ID عشوائي
export function generateId(prefix = "") {
    return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// حفظ البيانات مع التحقق من السعة
export function safeLocalStorageSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            console.warn('localStorage quota exceeded, clearing old data...');
            // محاولة تنظيف بعض المفاتيح القديمة
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && (k.startsWith('img_') || k.includes('cache'))) {
                    keysToRemove.push(k);
                }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
            // إعادة المحاولة
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (e2) {
                console.error('Still cannot save to localStorage', e2);
                return false;
            }
        }
        console.error('Error saving to localStorage', e);
        return false;
    }
}

// تحميل البيانات من localStorage بأمان
export function safeLocalStorageGet(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        console.error('Error reading from localStorage', e);
        return defaultValue;
    }
}

// حذف البيانات القديمة من localStorage
export function clearOldLocalStorage(olderThanDays = 30) {
    const now = Date.now();
    const maxAge = olderThanDays * 24 * 60 * 60 * 1000;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('img_') || key.includes('cache') || key.includes('_temp'))) {
            try {
                const value = localStorage.getItem(key);
                if (value && value.includes('timestamp')) {
                    const parsed = JSON.parse(value);
                    if (parsed.timestamp && (now - parsed.timestamp > maxAge)) {
                        localStorage.removeItem(key);
                    }
                }
            } catch (e) {
                // تجاهل الأخطاء
            }
        }
    }
}

// دالة لتقليل سرعة الاستدعاء (debounce)
export function debounce(func, delay = CONFIG.DEBOUNCE_DELAY) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

// دالة لمنع الاستدعاء المتكرر (throttle)
export function throttle(func, limit = 200) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// التحقق من الاتصال بالإنترنت
export function isOnline() {
    return navigator.onLine;
}

// انتظار الاتصال بالإنترنت
export function waitForOnline(timeout = 30000) {
    return new Promise((resolve, reject) => {
        if (navigator.onLine) {
            resolve();
            return;
        }
        const timeoutId = setTimeout(() => reject(new Error('Timeout waiting for network')), timeout);
        const handleOnline = () => {
            clearTimeout(timeoutId);
            window.removeEventListener('online', handleOnline);
            resolve();
        };
        window.addEventListener('online', handleOnline);
    });
}
