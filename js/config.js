// ==================== ملف الإعدادات العامة ====================
// يحتوي على الروابط الأساسية، أعدادات التطبيق، ومعاملات الأداء

export const CONFIG = {
    // رقم الوتساب المستهدف (بدون + أو مسافات)
    TARGET_NUMBER: "963945083365",
    
    // رابط Google Apps Script API
    API_URL: "https://script.google.com/macros/s/AKfycbwrXoE1tAYJb6D19UM9M-FSUDE9AMd73cj0u35bL7tyG902QN0B6nuDFisNQfgEwELq/exec",
    
    // عدد المنتجات لكل صفحة (للترقيم)
    ITEMS_PER_PAGE: 12,
    
    // مدة صلاحية الكاش للـ API (ساعة واحدة)
    CACHE_TTL: 3600000, // 1 hour in ms
    
    // إعدادات IndexedDB
    DB_NAME: "TogvenDB",
    DB_VERSION: 4,
    STORES: {
        IMAGES: "images",      // تخزين الصور (url -> blob)
        API_CACHE: "apiCache"  // تخزين بيانات API
    },
    
    // مهلة إلغاء التأخير لأزرار الكمية (ms)
    DEBOUNCE_DELAY: 150,
    
    // عدد محاولات إعادة الاتصال عند فشل الجلب
    FETCH_RETRY_COUNT: 3,
    
    // مهلة الطلب (ms)
    FETCH_TIMEOUT: 10000,
    
    // ثيم افتراضي (light/dark)
    DEFAULT_THEME: "light",
    
    // مفاتيح التخزين المحلي (LocalStorage)
    STORAGE_KEYS: {
        CART: "togven_cart",
        THEME: "togven_theme",
        OFFLINE_BANNER_SHOWN: "offline_banner_dismissed"
    }
};

// دالة مساعدة لإنشاء مفتاح فريد للمنتج (للحالات التي قد تحتاجها)
export function getProductKey(productName, category = "") {
    return `${category}-${productName}`.toLowerCase().replace(/[^a-z0-9-]/g, "_");
}

// دالة للتحقق من صحة رابط الصورة
export function isValidImageUrl(url) {
    if (!url) return false;
    return url.startsWith("http://") || url.startsWith("https://");
}

// دالة لعمل تأخير (Promise sleep)
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// دالة لتنسيق الأرقام بالعملة
export function formatCurrency(amount) {
    return amount.toLocaleString("ar-EG") + " ل.س";
}

// دالة لترميز النص لأمان HTML
export function escapeHtml(str) {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}