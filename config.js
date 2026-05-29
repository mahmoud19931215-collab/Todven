// ==================== إعدادات التطبيق الرئيسية ====================
export const CONFIG = {
    // رقم واتساب المستهدف (بدون +)
    TARGET_NUMBER: "963945083365",
    
    // رابط API الرئيسي (Google Sheets)
    API_URL: "https://script.google.com/macros/s/AKfycbwrXoE1tAYJb6D19UM9M-FSUDE9AMd73cj0u35bL7tyG902QN0B6nuDFisNQfgEwELq/exec",
    
    // رابط API احتياطي (يمكنك تغييره إلى رابط آخر يعمل)
    FALLBACK_API_URL: "https://api.npoint.io/your-fallback-data", // ضع رابط JSON بديل هنا
    
    // إعدادات العرض
    ITEMS_PER_PAGE: 12,
    SECTIONS_PER_LOAD: 6,
    
    // إعدادات الكاش والتخزين
    CACHE_TTL: 3600000,
    DB_NAME: "TogvenDB",
    DB_VERSION: 6,
    STORES: {
        IMAGES: "images",
        API_CACHE: "apiCache"
    },
    
    // إعدادات الشبكة
    DEBOUNCE_DELAY: 150,
    FETCH_RETRY_COUNT: 2,           // عدد المحاولات لكل رابط
    FETCH_TIMEOUT: 20000,           // 20 ثانية (زيادة المهلة)
    
    // الثيم الافتراضي
    DEFAULT_THEME: "light",
    
    // مفاتيح التخزين المحلي
    STORAGE_KEYS: {
        CART: "togven_cart",
        THEME: "togven_theme",
        OFFLINE_BANNER_SHOWN: "offline_banner_dismissed"
    },
    
    // إعدادات الصور
    IMAGE_PLACEHOLDER: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Crect width='300' height='300' fill='%23e2e8f0'/%3E%3Ctext x='150' y='160' text-anchor='middle' fill='%2394a3b8' font-size='14'%3Eلا توجد صورة%3C/text%3E%3C/svg%3E",
    IMAGE_LOADING_TIMEOUT: 8000,
    MAX_IMAGE_RETRIES: 2
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
           (url.startsWith("http://") || url.startsWith("https://"));
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
