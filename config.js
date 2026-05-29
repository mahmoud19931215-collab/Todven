// ==================== إعدادات التطبيق الرئيسية ====================
export const CONFIG = {
    // رقم واتساب المستهدف (بدون +)
    TARGET_NUMBER: "963945083365",
    
    // رابط API الرئيسي (Google Sheets)
    // تأكد من أن هذا الرابط يعيد بيانات JSON بالصيغة الصحيحة:
    // { "تصنيف رئيسي": { "تصنيف فرعي": [ { "name": "...", "price": 0, "imageUrl": "...", "stock": 0 } ] } }
    API_URL: "https://script.google.com/macros/s/AKfycbwrXoE1tAYJb6D19UM9M-FSUDE9AMd73cj0u35bL7tyG902QN0B6nuDFisNQfgEwELq/exec",
    
    // رابط API احتياطي (اختياري) – يمكن تعيينه لاختبار البيانات
    // FALLBACK_API_URL: "https://api.jsonbin.io/v3/b/...",
    
    // إعدادات العرض
    ITEMS_PER_PAGE: 12,
    SECTIONS_PER_LOAD: 6,
    
    // إعدادات الكاش والتخزين
    CACHE_TTL: 3600000,        // 1 hour
    DB_NAME: "TogvenDB",
    DB_VERSION: 5,              // تمت الترقية لتجنب تعارض الكاش القديم
    STORES: {
        IMAGES: "images",
        API_CACHE: "apiCache"
    },
    
    // إعدادات الشبكة
    DEBOUNCE_DELAY: 150,
    FETCH_RETRY_COUNT: 3,       // عدد محاولات إعادة جلب البيانات
    FETCH_TIMEOUT: 15000,       // 15 ثانية (زيادة المهلة)
    
    // الثيم الافتراضي
    DEFAULT_THEME: "light",
    
    // مفاتيح التخزين المحلي
    STORAGE_KEYS: {
        CART: "togven_cart",
        THEME: "togven_theme",
        OFFLINE_BANNER_SHOWN: "offline_banner_dismissed"
    },
    
    // إعدادات الصور
    IMAGE_PLACEHOLDER: "https://via.placeholder.com/300?text=No+Image",
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
