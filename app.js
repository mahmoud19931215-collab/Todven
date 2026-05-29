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
        
        // 2. مدير الثيم
        this.themeManager = new ThemeManager();
        
        // 3. مدير السلة (النسخة القديمة – سيتم استبدالها لاحقاً لكن نتركها كما هي حالياً)
        this.cartManager = new CartManager(CONFIG.TARGET_NUMBER, (qty, total) => {});
        
        // 4. شبكة المنتجات (بدون cartManager مؤقتاً)
        this.productsGrid = new ProductsGrid('productsGrid', this.storage, (totalQty, totalPrice) => {
            this.cartManager.updateFromCartItems(this.productsGrid.getAllCartItems());
        });
        
        // 5. مدير التصنيفات
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
        
        // 6. إزالة منتج من السلة
        this.cartManager.setRemoveItemCallback((productName) => {
            this.productsGrid.removeItemFromCart(productName);
            this.cartManager.updateFromCartItems(this.productsGrid.getAllCartItems());
        });
        
        // 7. شريط التقدم
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
        
        // 8. البحث
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        const searchStats = document.getElementById('searchStats');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value;
                const count = this.productsGrid.filterBySearch(query);
                if (searchStats) {
                    searchStats.innerText = query.trim() ? `${count} نتيجة` : '';
                }
                if (clearSearch) clearSearch.style.display = query ? 'flex' : 'none';
            });
        }
        if (clearSearch) {
            clearSearch.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                this.productsGrid.filterBySearch('');
                if (searchStats) searchStats.innerText = '';
                clearSearch.style.display = 'none';
            });
        }
        
        // 9. عرض البيانات المخزنة مؤقتاً أولاً (إن وجدت)
        const skeleton = document.getElementById('skeletonLoader');
        const productsGridDiv = document.getElementById('productsGrid');
        const cachedData = await this.storage.getApiCache();
        if (cachedData && Object.keys(cachedData).length > 0) {
            console.log('[App] Using cached data');
            this.renderFullData(cachedData);
            this.showOfflineToast(true, this.storage.getLastUpdateTimestamp());
            if (skeleton) skeleton.style.display = 'none';
            if (productsGridDiv) productsGridDiv.style.display = 'grid';
        } else {
            console.log('[App] No valid cache found');
        }
        
        // 10. جلب بيانات جديدة (مع محاولة إعادة المحاولة)
        await this.fetchFreshDataWithRetry();
        
        // 11. مستمعي الشبكة
        this.setupNetworkListeners();
        
        // 12. إعدادات المودال
        this.setupSettingsModal();
        
        // 13. تحديث السلة بعد فترة قصيرة
        setTimeout(() => {
            this.cartManager.updateFromCartItems(this.productsGrid.getAllCartItems());
        }, 500);
    }
    
    async fetchFreshDataWithRetry(retries = CONFIG.FETCH_RETRY_COUNT) {
        for (let i = 0; i < retries; i++) {
            try {
                await this.fetchFreshData();
                return; // نجاح
            } catch (err) {
                console.warn(`[App] Fetch attempt ${i+1} failed:`, err);
                if (i === retries - 1) {
                    // الفشل النهائي
                    if (!this.fullData) {
                        this.showOfflinePage();
                    } else {
                        this.showOfflineToast(true, this.storage.getLastUpdateTimestamp());
                    }
                    this.showToast('فشل تحميل البيانات من الخادم', 'error');
                } else {
                    // انتظار قبل إعادة المحاولة
                    await new Promise(r => setTimeout(r, 1000 * (i + 1)));
                }
            }
        }
    }
    
    async fetchFreshData() {
        console.log('[App] Fetching fresh data from', CONFIG.API_URL);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT);
        
        try {
            const response = await fetch(CONFIG.API_URL, { 
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('[App] Received data:', data);
            
            // التحقق من صحة البيانات
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid data format: not an object');
            }
            
            // التأكد من وجود تصنيفات على الأقل
            if (Object.keys(data).length === 0) {
                throw new Error('Empty data object');
            }
            
            // حفظ في الكاش
            await this.storage.saveApiCache(data);
            
            // عرض البيانات
            this.renderFullData(data);
            this.showOfflineToast(false);
            this.hideOfflinePage();
            this.showToast('تم تحديث البيانات بنجاح', 'success');
            
        } catch (err) {
            clearTimeout(timeoutId);
            console.error('[App] Fetch failed:', err);
            throw err; // لإعادة المحاولة من الأعلى
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
    
    showOfflineToast(isCached, timestamp) {
        const toast = document.getElementById('offlineToast');
        if (!toast) return;
        if (isCached) {
            toast.style.display = 'flex';
            const timeSpan = document.getElementById('cacheTime');
            if (timeSpan && timestamp) {
                timeSpan.innerText = `آخر تحديث: ${new Date(timestamp).toLocaleTimeString()}`;
            }
            const refreshBtn = document.getElementById('refreshDataBtn');
            if (refreshBtn) {
                refreshBtn.onclick = () => {
                    if (navigator.onLine) {
                        this.fetchFreshDataWithRetry();
                    } else {
                        this.showToast('لا يوجد اتصال بالإنترنت', 'warning');
                    }
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
                    this.fetchFreshDataWithRetry();
                } else {
                    this.showToast('لا توجد شبكة', 'error');
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
            this.fetchFreshDataWithRetry();
            this.showToast('تم استعادة الاتصال بالإنترنت', 'success');
        });
        window.addEventListener('offline', () => {
            this.isOnline = false;
            if (!this.fullData) this.showOfflinePage();
            this.showToast('انقطع الاتصال بالإنترنت', 'warning');
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
                    if (confirm('سيتم مسح جميع الصور والبيانات المخزنة. هل أنت متأكد؟')) {
                        await this.storage.clearAllCache();
                        // مسح سلة التسوق أيضاً
                        localStorage.removeItem(CONFIG.STORAGE_KEYS.CART);
                        this.showToast('تم مسح الكاش، سيتم إعادة تحميل البيانات', 'info');
                        setTimeout(() => location.reload(), 1000);
                    }
                });
            }
        }
    }
    
    showToast(message, type = 'info') {
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

// تشغيل التطبيق
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new App());
} else {
    new App();
}
