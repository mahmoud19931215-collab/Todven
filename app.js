import { CONFIG } from './config.js';
import { StorageService } from './StorageService.js';
import { ProductsGrid } from './ProductsGrid.js';
import { CategoryManager } from './CategoryManager.js';
import { CartManager } from './CartManager.js';
import { ThemeManager } from './ThemeManager.js';

class App {
    constructor() {
        this.storage = null;
        this.productsGrid = null;
        this.categoryManager = null;
        this.cartManager = null;
        this.themeManager = null;
        this.fullData = null;
        this.isOnline = navigator.onLine;
        this.init();
    }

    async init() {
        // 1. تهيئة التخزين
        this.storage = new StorageService();
        await this.storage.init();
        
        // 2. تهيئة مدير الثيم
        this.themeManager = new ThemeManager();
        
        // 3. تهيئة مدير السلة (بدون callback مؤقت)
        this.cartManager = new CartManager(CONFIG.TARGET_NUMBER, (qty, total) => {
            // هذا الكallback يُستدعى بعد كل تحديث للعربة
            this.updateCartUI(qty, total);
        });
        
        // 4. تهيئة شبكة المنتجات (نمرر cartManager)
        this.productsGrid = new ProductsGrid(
            'productsGrid', 
            this.storage, 
            this.cartManager,
            (totalQty, totalPrice) => {
                // تحديث إضافي إذا لزم الأمر
                this.updateCartUI(totalQty, totalPrice);
            }
        );
        
        // 5. تهيئة مدير التصنيفات
        this.categoryManager = new CategoryManager(
            'mainChipsContainer',
            'subChipsContainer',
            (mainCat) => {
                this.productsGrid.setActiveMainCategory(mainCat);
                if (mainCat !== 'all') {
                    const subs = this.productsGrid.getSubCategoriesFor(mainCat);
                    this.categoryManager.updateSubChips(mainCat, subs);
                } else {
                    this.categoryManager.updateSubChips('all', []);
                }
            },
            (subCat) => {
                this.productsGrid.setActiveSubCategory(subCat);
            }
        );
        
        // 6. إعداد callback لإزالة المنتج من السلة (يُستخدم في CartManager لإعلام ProductsGrid)
        this.cartManager.setRemoveItemCallback ? this.cartManager.setRemoveItemCallback((productName) => {
            this.productsGrid.removeItemFromCart(productName);
        }) : null;
        
        // 7. إعداد شريط تقدم تحميل الصور
        const progressBar = document.getElementById('globalProgress');
        const progressFill = progressBar?.querySelector('.progress-fill');
        if (progressBar && progressFill) {
            this.productsGrid.setImageProgressCallback((percent) => {
                if (percent < 100 && percent > 0) {
                    progressBar.style.display = 'block';
                    progressFill.style.width = `${percent}%`;
                } else {
                    setTimeout(() => progressBar.style.display = 'none', 500);
                }
            });
        }
        
        // 8. إعداد البحث
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        const searchStats = document.getElementById('searchStats');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value;
                const count = this.productsGrid.filterBySearch(query);
                if (searchStats) {
                    if (query.trim()) {
                        searchStats.innerHTML = `<i class="fas fa-search"></i> ${count} نتيجة`;
                    } else {
                        searchStats.innerHTML = '';
                    }
                }
                if (clearSearch) clearSearch.style.display = query ? 'flex' : 'none';
            });
        }
        if (clearSearch) {
            clearSearch.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                this.productsGrid.filterBySearch('');
                if (searchStats) searchStats.innerHTML = '';
                clearSearch.style.display = 'none';
            });
        }
        
        // 9. عرض البيانات المخزنة مؤقتاً أولاً
        const skeleton = document.getElementById('skeletonLoader');
        const productsGridDiv = document.getElementById('productsGrid');
        const cachedData = await this.storage.getApiCache();
        if (cachedData && Object.keys(cachedData).length) {
            this.renderFullData(cachedData);
            this.showOfflineToast(true, this.storage.getLastUpdateTimestamp());
            if (skeleton) skeleton.style.display = 'none';
            if (productsGridDiv) productsGridDiv.style.display = 'grid';
        }
        
        // 10. جلب بيانات جديدة من الشبكة
        this.fetchFreshData();
        
        // 11. إعداد مستمعي الشبكة
        this.setupNetworkListeners();
        
        // 12. إعداد مودال الإعدادات
        this.setupSettingsModal();
        
        // 13. عرض إشعار ترحيبي للمستخدم الجديد
        this.showWelcomeMessage();
        
        // 14. تحديث واجهة السلة الأولية
        this.updateCartUI(this.cartManager.totalQuantity, this.cartManager.totalPrice);
    }
    
    async fetchFreshData() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT);
            const response = await fetch(CONFIG.API_URL, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!data || typeof data !== 'object') throw new Error("Invalid data");
            await this.storage.saveApiCache(data);
            this.renderFullData(data);
            this.showOfflineToast(false);
            this.hideOfflinePage();
            this.showToast("تم تحديث البيانات بنجاح", "success");
        } catch (err) {
            console.error("Fetch failed:", err);
            if (!this.fullData) {
                this.showOfflinePage();
            } else {
                this.showOfflineToast(true, this.storage.getLastUpdateTimestamp());
                this.showToast("لا يوجد اتصال بالإنترنت، يتم عرض نسخة مخبأة", "warning");
            }
        }
    }
    
    renderFullData(data) {
        this.fullData = data;
        this.productsGrid.loadData(data);
        const mainCats = this.productsGrid.getMainCategories();
        this.categoryManager.buildMainChips(mainCats);
        const subMap = new Map();
        for (const main of mainCats) {
            subMap.set(main, this.productsGrid.getSubCategoriesFor(main));
        }
        this.categoryManager.setSubCategoriesMap(subMap);
        const currentMain = this.categoryManager.getCurrentMain();
        if (currentMain && currentMain !== 'all') {
            this.categoryManager.selectMainCategory(currentMain);
        }
        const skeleton = document.getElementById('skeletonLoader');
        const gridDiv = document.getElementById('productsGrid');
        if (skeleton) skeleton.style.display = 'none';
        if (gridDiv) gridDiv.style.display = 'grid';
    }
    
    updateCartUI(qty, total) {
        // تحديث أي عناصر إضافية في الواجهة إن وجدت
        const cartFooter = document.getElementById('cartFooter');
        if (cartFooter) {
            if (qty > 0) cartFooter.classList.add('show');
            else cartFooter.classList.remove('show');
        }
        // تحديث النص في الفوتر إذا كان موجوداً
        const grandTotalSpan = document.getElementById('grandTotal');
        if (grandTotalSpan) grandTotalSpan.innerText = total.toLocaleString();
    }
    
    showOfflineToast(isCached, timestamp) {
        const toast = document.getElementById('offlineToast');
        if (!toast) return;
        if (isCached) {
            toast.style.display = 'flex';
            const timeSpan = document.getElementById('cacheTime');
            if (timeSpan && timestamp) {
                timeSpan.innerText = `آخر تحديث: ${new Date(timestamp).toLocaleTimeString('ar-EG')}`;
            }
            const refreshBtn = document.getElementById('refreshDataBtn');
            if (refreshBtn) {
                refreshBtn.onclick = () => {
                    if (navigator.onLine) this.fetchFreshData();
                    else this.showToast("لا يوجد اتصال بالإنترنت", "error");
                };
            }
            const closeToast = document.getElementById('closeToastBtn');
            if (closeToast) closeToast.onclick = () => toast.style.display = 'none';
        } else {
            toast.style.display = 'none';
        }
    }
    
    showOfflinePage() {
        const offlinePage = document.getElementById('offlinePage');
        if (offlinePage) offlinePage.style.display = 'flex';
        const retryBtn = document.getElementById('retryConnection');
        if (retryBtn) {
            retryBtn.onclick = () => {
                if (navigator.onLine) {
                    offlinePage.style.display = 'none';
                    this.fetchFreshData();
                } else {
                    this.showToast("لا توجد شبكة، يرجى التحقق من الاتصال", "error");
                }
            };
        }
    }
    
    hideOfflinePage() {
        const offlinePage = document.getElementById('offlinePage');
        if (offlinePage) offlinePage.style.display = 'none';
    }
    
    setupNetworkListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.hideOfflinePage();
            this.fetchFreshData();
            this.showToast("تم استعادة الاتصال بالإنترنت", "success");
        });
        window.addEventListener('offline', () => {
            this.isOnline = false;
            if (!this.fullData) this.showOfflinePage();
            this.showToast("انقطع الاتصال بالإنترنت", "warning");
        });
    }
    
    setupSettingsModal() {
        const settingsBtn = document.getElementById('settingsBtn');
        const modal = document.getElementById('settingsModal');
        const closeBtn = modal?.querySelector('.modal-close');
        const clearCacheBtn = document.getElementById('clearCacheAction');
        if (settingsBtn && modal) {
            settingsBtn.addEventListener('click', () => modal.classList.add('open'));
            if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('open'));
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('open');
            });
            if (clearCacheBtn) {
                clearCacheBtn.addEventListener('click', async () => {
                    if (confirm('⚠️ سيتم مسح جميع الصور والبيانات المخزنة. هل أنت متأكد؟')) {
                        await this.storage.clearAllCache();
                        // مسح سلة المشتريات أيضاً
                        localStorage.removeItem(CONFIG.STORAGE_KEYS.CART);
                        this.showToast("تم مسح الكاش، سيتم إعادة تحميل البيانات", "info");
                        setTimeout(() => location.reload(), 1000);
                    }
                });
            }
        }
    }
    
    showWelcomeMessage() {
        const isFirstVisit = !localStorage.getItem('togven_visited');
        if (isFirstVisit) {
            setTimeout(() => {
                this.showToast("مرحباً بك في توجفن! 🛍️ أضف منتجاتك إلى السلة', 'info");
                localStorage.setItem('togven_visited', 'true');
            }, 1000);
        }
    }
    
    showToast(message, type = "info") {
        let toast = document.getElementById('dynamicToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'dynamicToast';
            toast.className = 'dynamic-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show', type);
        setTimeout(() => {
            toast.classList.remove('show', type);
        }, 3000);
    }
}

// تشغيل التطبيق عند تحميل الصفحة
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new App());
} else {
    new App();
}
