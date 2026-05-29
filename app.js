import { CONFIG, sleep, escapeHtml } from './config.js';
import { StorageService } from './StorageService.js';
import { ProductsGrid } from './ProductsGrid.js';
import { CategoryManager } from './CategoryManager.js';
import { CartManager } from './CartManager.js';
import { ThemeManager } from './ThemeManager.js';

// بيانات تجريبية (Mock) - ستظهر فقط في حالة عدم وجود أي كاش ولا اتصال
const MOCK_DATA = {
    "ملابس": {
        "رجالي": [
            { name: "قميص قطني", price: 25000, imageUrl: "https://picsum.photos/id/20/300/300", stock: 10 },
            { name: "بنطلون جينز", price: 45000, imageUrl: "https://picsum.photos/id/26/300/300", stock: 5 }
        ],
        "نسائي": [
            { name: "فستان سهرة", price: 85000, imageUrl: "https://picsum.photos/id/30/300/300", stock: 3 }
        ]
    },
    "إلكترونيات": {
        "هواتف": [
            { name: "هاتف ذكي", price: 250000, imageUrl: "https://picsum.photos/id/0/300/300", stock: 7 }
        ]
    }
};

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
        console.log('[App] Starting initialization...');
        
        this.registerServiceWorker();
        
        this.storage = new StorageService();
        await this.storage.init();
        console.log('[App] Storage initialized');
        
        this.themeManager = new ThemeManager();
        
        this.cartManager = new CartManager(CONFIG.TARGET_NUMBER, (qty, total) => {
            this.updateCartUI(qty, total);
        });
        
        this.productsGrid = new ProductsGrid('productsGrid', this.storage, this.cartManager, (totalQty, totalPrice) => {
            this.updateCartUI(totalQty, totalPrice);
            this.refreshCartDrawer();
        });
        
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
        
        this.cartManager.setRemoveItemCallback((productName) => {
            this.productsGrid.removeItemFromCart(productName);
            this.refreshCartDrawer();
        });
        
        this.setupProgressBar();
        this.setupSearch();
        
        // عرض البيانات المخزنة أولاً
        let hasDisplayedData = false;
        try {
            const cachedData = await this.storage.getApiCache();
            if (cachedData && Object.keys(cachedData).length > 0 && this.isValidDataStructure(cachedData)) {
                console.log('[App] Displaying cached data');
                this.renderFullData(cachedData);
                hasDisplayedData = true;
                const timestamp = await this.storage.getLastUpdateTimestamp();
                this.showOfflineToast(true, timestamp);
            } else {
                console.log('[App] No valid cache, showing mock data temporarily');
                this.renderFullData(MOCK_DATA);
                hasDisplayedData = true;
                this.showOfflineToast(true, null, true);
            }
        } catch (err) {
            console.error('[App] Error loading cache:', err);
            this.renderFullData(MOCK_DATA);
            hasDisplayedData = true;
        }
        
        const skeleton = document.getElementById('skeletonLoader');
        const productsGridDiv = document.getElementById('productsGrid');
        if (skeleton) skeleton.style.display = 'none';
        if (productsGridDiv) productsGridDiv.style.display = 'grid';
        
        // محاولة جلب بيانات جديدة من الشبكة في الخلفية
        this.fetchFreshDataInBackground();
        
        this.setupNetworkListeners();
        this.setupSettingsModal();
        this.setupCartDrawer();
        
        setTimeout(() => {
            this.updateCartUI(this.cartManager.totalQuantity, this.cartManager.totalPrice);
            this.refreshCartDrawer();
        }, 500);
    }
    
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('[SW] Registered:', reg))
                .catch(err => console.error('[SW] Registration failed:', err));
        }
    }
    
    async fetchFreshDataInBackground() {
        try {
            await this.fetchFreshDataWithRetry();
        } catch (err) {
            console.warn('[App] Background fetch failed, keeping existing data');
        }
    }
    
    async fetchFreshDataWithRetry(retries = CONFIG.FETCH_RETRY_COUNT) {
        for (let i = 0; i < retries; i++) {
            try {
                await this.fetchFreshData();
                return true;
            } catch (err) {
                console.warn(`[App] Fetch attempt ${i+1}/${retries} failed:`, err.message);
                if (i === retries - 1) {
                    return false;
                }
                await sleep(1500 * (i + 1));
            }
        }
        return false;
    }
    
    async fetchFreshData() {
        console.log('[App] Fetching fresh data from', CONFIG.API_URL);
        
        if (!navigator.onLine) {
            throw new Error('لا يوجد اتصال بالإنترنت');
        }
        
        let data = null;
        let errorMsg = null;
        
        // المحاولة الأولى: الرابط الرئيسي
        try {
            data = await this.fetchWithTimeout(CONFIG.API_URL);
            if (this.isValidDataStructure(data)) {
                console.log('[App] Success from primary API');
                await this.storage.saveApiCache(data);
                this.renderFullData(data);
                this.showToast('تم تحديث البيانات من الخادم', 'success');
                this.showOfflineToast(false);
                this.hideOfflinePage();
                return;
            } else {
                errorMsg = 'بنية بيانات غير صحيحة من API الرئيسي';
                console.warn(errorMsg, data);
            }
        } catch (err) {
            errorMsg = err.message;
            console.error('[App] Primary API error:', err);
        }
        
        // المحاولة الثانية: الرابط الاحتياطي (إذا كان مفعلاً)
        if (CONFIG.FALLBACK_API_URL && CONFIG.FALLBACK_API_URL !== "https://api.npoint.io/your-fallback-data") {
            console.log('[App] Trying fallback API:', CONFIG.FALLBACK_API_URL);
            try {
                data = await this.fetchWithTimeout(CONFIG.FALLBACK_API_URL);
                if (this.isValidDataStructure(data)) {
                    console.log('[App] Success from fallback API');
                    await this.storage.saveApiCache(data);
                    this.renderFullData(data);
                    this.showToast('تم تحديث البيانات من الخادم الاحتياطي', 'success');
                    this.showOfflineToast(false);
                    this.hideOfflinePage();
                    return;
                } else {
                    console.warn('Invalid data from fallback');
                }
            } catch (err) {
                console.error('[App] Fallback API error:', err);
                errorMsg = err.message;
            }
        }
        
        // إذا وصلنا إلى هنا، فشلت جميع المحاولات
        if (!this.fullData) {
            this.showOfflinePage();
        } else {
            this.showOfflineToast(true, await this.storage.getLastUpdateTimestamp());
        }
        this.showToast(`فشل الاتصال بالخادم: ${errorMsg}`, 'error');
        throw new Error(errorMsg);
    }
    
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
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();
            let data;
            try { data = JSON.parse(text); } catch(e) { throw new Error('JSON غير صالح'); }
            return data;
        } catch(err) {
            clearTimeout(timeoutId);
            throw err;
        }
    }
    
    isValidDataStructure(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
        if (Object.keys(data).length === 0) return false;
        for (const mainCat of Object.keys(data)) {
            const subCats = data[mainCat];
            if (typeof subCats !== 'object' || Array.isArray(subCats)) return false;
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
    
    setupProgressBar() {
        const progressBar = document.getElementById('globalProgress');
        const progressFill = progressBar?.querySelector('.progress-fill');
        if (progressBar && progressFill && this.productsGrid) {
            this.productsGrid.setImageProgressCallback((percent) => {
                if (percent < 100 && percent > 0) {
                    progressBar.style.display = 'block';
                    progressFill.style.width = `${percent}%`;
                } else {
                    setTimeout(() => { if (progressBar) progressBar.style.display = 'none'; }, 500);
                }
            });
        }
    }
    
    renderFullData(data) {
        if (!data || Object.keys(data).length === 0) {
            console.warn('[App] renderFullData called with empty data');
            return;
        }
        this.fullData = data;
        this.productsGrid.loadData(data);
        const mainCats = this.productsGrid.getMainCategories();
        if (mainCats.length === 0) return;
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
    
    setupSearch() {
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        const searchStats = document.getElementById('searchStats');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value;
                const count = this.productsGrid.filterBySearch(query);
                if (searchStats) searchStats.innerText = query.trim() ? `${count} نتيجة` : '';
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
    }
    
    setupCartDrawer() {
        const drawer = document.getElementById('cartDrawer');
        const overlay = document.getElementById('cartOverlay');
        const openBtn = document.getElementById('cartDrawerBtn');
        const closeBtn = document.querySelector('.drawer-close');
        const whatsappBtn = document.getElementById('drawerWhatsappBtn');
        if (openBtn) {
            openBtn.addEventListener('click', () => {
                this.refreshCartDrawer();
                drawer?.classList.add('open');
                overlay?.classList.add('open');
            });
        }
        const closeDrawer = () => {
            drawer?.classList.remove('open');
            overlay?.classList.remove('open');
        };
        if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
        if (overlay) overlay.addEventListener('click', closeDrawer);
        if (whatsappBtn) whatsappBtn.addEventListener('click', () => this.sendOrderToWhatsApp());
        const footerWhatsapp = document.getElementById('whatsappFooterBtn');
        if (footerWhatsapp) footerWhatsapp.addEventListener('click', () => this.sendOrderToWhatsApp());
    }
    
    refreshCartDrawer() {
        const drawerBody = document.getElementById('cartItemsList');
        const drawerTotalSpan = document.getElementById('drawerTotal');
        if (!drawerBody) return;
        const items = this.cartManager.getCartItems();
        if (items.length === 0) {
            drawerBody.innerHTML = '<div class="empty-cart-animation"><i class="fas fa-shopping-basket"></i><p>سلة فارغة</p><span>أضف منتجات من المتجر</span></div>';
            if (drawerTotalSpan) drawerTotalSpan.innerText = '0';
            return;
        }
        let total = 0;
        const html = items.map(item => {
            total += item.quantity * item.price;
            return `
                <div class="cart-item" data-name="${escapeHtml(item.name)}">
                    <div class="cart-item-img">${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" loading="lazy">` : '<i class="fas fa-box"></i>'}</div>
                    <div class="cart-item-info">
                        <div class="cart-item-name">${escapeHtml(item.name)}</div>
                        <div class="cart-item-price">${item.price.toLocaleString()} ل.س</div>
                        <div class="cart-item-qty-control">
                            <button class="cart-qty-dec" data-name="${escapeHtml(item.name)}">-</button>
                            <span class="cart-item-qty">${item.quantity}</span>
                            <button class="cart-qty-inc" data-name="${escapeHtml(item.name)}">+</button>
                        </div>
                    </div>
                    <button class="remove-item" data-name="${escapeHtml(item.name)}"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
        }).join('');
        drawerBody.innerHTML = html;
        if (drawerTotalSpan) drawerTotalSpan.innerText = total.toLocaleString();
        
        drawerBody.querySelectorAll('.cart-qty-dec').forEach(btn => {
            btn.addEventListener('click', () => {
                const name = btn.getAttribute('data-name');
                const current = this.cartManager.getItemQuantity(name);
                if (current > 0) {
                    this.cartManager.updateItem(name, current - 1, null, null);
                    this.refreshCartDrawer();
                    this.productsGrid.updateProductQuantity(name, current - 1);
                    this.updateCartUI(this.cartManager.totalQuantity, this.cartManager.totalPrice);
                }
            });
        });
        drawerBody.querySelectorAll('.cart-qty-inc').forEach(btn => {
            btn.addEventListener('click', () => {
                const name = btn.getAttribute('data-name');
                const current = this.cartManager.getItemQuantity(name);
                this.cartManager.updateItem(name, current + 1, null, null);
                this.refreshCartDrawer();
                this.productsGrid.updateProductQuantity(name, current + 1);
                this.updateCartUI(this.cartManager.totalQuantity, this.cartManager.totalPrice);
            });
        });
        drawerBody.querySelectorAll('.remove-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const name = btn.getAttribute('data-name');
                this.cartManager.removeItem(name);
                this.productsGrid.updateProductQuantity(name, 0);
                this.refreshCartDrawer();
                this.updateCartUI(this.cartManager.totalQuantity, this.cartManager.totalPrice);
            });
        });
    }
    
    updateCartUI(totalQty, totalPrice) {
        const badge = document.getElementById('cartBadge');
        if (badge) badge.innerText = totalQty.toString();
        const grandTotalSpan = document.getElementById('grandTotal');
        if (grandTotalSpan) grandTotalSpan.innerText = totalPrice.toLocaleString();
        const footer = document.querySelector('.cart-floating-footer');
        if (footer) {
            if (totalQty > 0) footer.classList.add('show');
            else footer.classList.remove('show');
        }
    }
    
    sendOrderToWhatsApp() {
        const items = this.cartManager.getCartItems();
        if (items.length === 0) {
            this.showToast('السلة فارغة', 'warning');
            return;
        }
        let message = "🛍️ طلب جديد:\n";
        let total = 0;
        items.forEach(item => {
            message += `- ${item.name} × ${item.quantity} = ${(item.quantity * item.price).toLocaleString()} ل.س\n`;
            total += item.quantity * item.price;
        });
        message += `\n💰 الإجمالي: ${total.toLocaleString()} ل.س`;
        window.open(`https://wa.me/${CONFIG.TARGET_NUMBER}?text=${encodeURIComponent(message)}`, '_blank');
    }
    
    showOfflineToast(isCached, timestamp, isMock = false) {
        const toast = document.getElementById('offlineToast');
        if (!toast) return;
        if (isCached || isMock) {
            toast.style.display = 'flex';
            const timeSpan = document.getElementById('cacheTime');
            if (timeSpan) {
                if (isMock) timeSpan.innerText = 'بيانات تجريبية (غير متصل)';
                else if (timestamp) timeSpan.innerText = `آخر تحديث: ${new Date(timestamp).toLocaleTimeString()}`;
                else timeSpan.innerText = 'بيانات مخزنة محلياً';
            }
            const refreshBtn = document.getElementById('refreshDataBtn');
            if (refreshBtn) {
                refreshBtn.onclick = () => {
                    if (navigator.onLine) this.fetchFreshDataWithRetry();
                    else this.showToast('لا يوجد اتصال بالإنترنت', 'warning');
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
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
            if (clearCacheBtn) {
                clearCacheBtn.addEventListener('click', async () => {
                    if (confirm('سيتم مسح جميع الصور والبيانات المخزنة. هل أنت متأكد؟')) {
                        await this.storage.clearAllCache();
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
        setTimeout(() => toast.classList.remove('show', type), 3000);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new App());
} else {
    new App();
}
