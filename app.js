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
        this.storage = new StorageService();
        await this.storage.init();
        
        this.themeManager = new ThemeManager();
        
        // CartManager أولاً
        this.cartManager = new CartManager(CONFIG.TARGET_NUMBER, (qty, total) => {
            this.updateCartUI(qty, total);
        });
        
        // ProductsGrid مع cartManager
        this.productsGrid = new ProductsGrid('productsGrid', this.storage, this.cartManager, (totalQty, totalPrice) => {
            this.updateCartUI(totalQty, totalPrice);
            this.refreshCartDrawer(); // تحديث الدراور عند تغير السلة
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
        
        // شريط التقدم
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
        
        // البحث
        this.setupSearch();
        
        // عرض بيانات مخزنة مؤقتاً
        const skeleton = document.getElementById('skeletonLoader');
        const productsGridDiv = document.getElementById('productsGrid');
        const cachedData = await this.storage.getApiCache();
        if (cachedData && Object.keys(cachedData).length > 0) {
            console.log('[App] Using cached data');
            this.renderFullData(cachedData);
            const timestamp = await this.storage.getLastUpdateTimestamp();
            this.showOfflineToast(true, timestamp);
            if (skeleton) skeleton.style.display = 'none';
            if (productsGridDiv) productsGridDiv.style.display = 'grid';
        } else {
            console.log('[App] No valid cache found');
        }
        
        await this.fetchFreshDataWithRetry();
        
        this.setupNetworkListeners();
        this.setupSettingsModal();
        this.setupCartDrawer();   // إضافة ربط الدراور
        
        // تحديث واجهة السلة
        setTimeout(() => {
            this.updateCartUI(this.cartManager.totalQuantity, this.cartManager.totalPrice);
            this.refreshCartDrawer();
        }, 500);
    }
    
    setupSearch() {
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
        if (whatsappBtn) {
            whatsappBtn.addEventListener('click', () => this.sendOrderToWhatsApp());
        }
        
        // زر الواتساب في الفوتر الثابت
        const footerWhatsapp = document.getElementById('whatsappFooterBtn');
        if (footerWhatsapp) {
            footerWhatsapp.addEventListener('click', () => this.sendOrderToWhatsApp());
        }
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
            const subtotal = item.quantity * item.price;
            total += subtotal;
            return `
                <div class="cart-item" data-name="${escapeHtml(item.name)}">
                    <div class="cart-item-img">
                        ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" loading="lazy">` : '<i class="fas fa-box"></i>'}
                    </div>
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
        
        // إضافة أحداث الأزرار
        drawerBody.querySelectorAll('.cart-qty-dec').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const name = btn.getAttribute('data-name');
                const current = this.cartManager.getItemQuantity(name);
                if (current > 0) this.cartManager.updateItem(name, current - 1, null, null);
                this.refreshCartDrawer();
                this.productsGrid.updateProductQuantity(name, current - 1);
                this.updateCartUI(this.cartManager.totalQuantity, this.cartManager.totalPrice);
            });
        });
        drawerBody.querySelectorAll('.cart-qty-inc').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const name = btn.getAttribute('data-name');
                const current = this.cartManager.getItemQuantity(name);
                this.cartManager.updateItem(name, current + 1, null, null);
                this.refreshCartDrawer();
                this.productsGrid.updateProductQuantity(name, current + 1);
                this.updateCartUI(this.cartManager.totalQuantity, this.cartManager.totalPrice);
            });
        });
        drawerBody.querySelectorAll('.remove-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
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
        const url = `https://wa.me/${CONFIG.TARGET_NUMBER}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    }
    
    async fetchFreshDataWithRetry(retries = CONFIG.FETCH_RETRY_COUNT) {
        for (let i = 0; i < retries; i++) {
            try {
                await this.fetchFreshData();
                return;
            } catch (err) {
                console.warn(`[App] Fetch attempt ${i+1} failed:`, err);
                if (i === retries - 1) {
                    if (!this.fullData) this.showOfflinePage();
                    else this.showOfflineToast(true, await this.storage.getLastUpdateTimestamp());
                    this.showToast('فشل تحميل البيانات من الخادم', 'error');
                } else {
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
                headers: { 'Accept': 'application/json', 'Cache-Control': 'no-cache' }
            });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
                throw new Error('Invalid data format');
            }
            await this.storage.saveApiCache(data);
            this.renderFullData(data);
            this.showOfflineToast(false);
            this.hideOfflinePage();
            this.showToast('تم تحديث البيانات بنجاح', 'success');
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
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
    
    async showOfflineToast(isCached, timestamp) {
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
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('open');
            });
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

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new App());
} else {
    new App();
}
