// ==================== ثوابت عامة ====================
const TARGET_NUMBER = "963945083365";
const API_URL = "https://script.google.com/macros/s/AKfycbz8CnO-_aiuboqy7R4kXFA-FQ4uNaLAVc5-_aC-z6txmg2W33wG7c4Igj_NJeKGF-fk/exec";
const ITEMS_PER_PAGE = 20; // عدد المنتجات الأولية لكل تصنيف

// ==================== خدمة التخزين (Dexie) ====================
class StorageService {
    constructor() {
        this.db = null;
        this.useLocalStorageFallback = false;
        this.init();
    }
    async init() {
        try {
            this.db = new Dexie("RogvenImageCache");
            this.db.version(2).stores({
                images: "url",
                apiCache: "key"
            });
            await this.db.open();
        } catch (err) {
            console.warn("IndexedDB failed, falling back to localStorage", err);
            this.useLocalStorageFallback = true;
        }
    }
    async getImage(url) {
        if (this.useLocalStorageFallback) {
            const data = localStorage.getItem(`img_${url}`);
            return data || null;
        }
        try {
            const record = await this.db.images.get(url);
            return record ? record.base64 : null;
        } catch(e) { return null; }
    }
    async saveImage(url, base64) {
        if (this.useLocalStorageFallback) {
            try {
                localStorage.setItem(`img_${url}`, base64);
            } catch(e) { console.warn("localStorage full", e); }
            return;
        }
        try {
            await this.db.images.put({ url, base64 });
        } catch(e) { console.warn("IndexedDB save failed", e); }
    }
    async getApiCache() {
        if (this.useLocalStorageFallback) {
            const cached = localStorage.getItem('apiCache');
            if (cached) {
                const data = JSON.parse(cached);
                if (Date.now() - data.timestamp < 3600000) return data.data;
            }
            return null;
        }
        try {
            const record = await this.db.apiCache.get('mainData');
            if (record && (Date.now() - record.timestamp < 3600000)) return record.data;
            return null;
        } catch(e) { return null; }
    }
    async saveApiCache(data) {
        if (this.useLocalStorageFallback) {
            localStorage.setItem('apiCache', JSON.stringify({ timestamp: Date.now(), data }));
            return;
        }
        try {
            await this.db.apiCache.put({ key: 'mainData', timestamp: Date.now(), data });
        } catch(e) { console.warn("Failed to save API cache", e); }
    }
    async clearAllCache() {
        if (this.useLocalStorageFallback) {
            const keys = Object.keys(localStorage);
            keys.forEach(key => { if(key.startsWith('img_') || key === 'apiCache') localStorage.removeItem(key); });
        } else {
            try {
                await this.db.images.clear();
                await this.db.apiCache.clear();
            } catch(e) { console.warn("Clear cache failed", e); }
        }
    }
    saveCartState(cartItems) { localStorage.setItem('savedCart', JSON.stringify(cartItems)); }
    loadCartState() {
        const saved = localStorage.getItem('savedCart');
        return saved ? JSON.parse(saved) : [];
    }
}

// ==================== تحميل الصور ====================
class LazyImage {
    static async render(imgElement, url, storage, onProgress) {
        if (!url) return;
        const cached = await storage.getImage(url);
        if (cached) { imgElement.src = cached; return; }
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result;
                await storage.saveImage(url, base64);
                imgElement.src = base64;
                if (onProgress) onProgress();
            };
            reader.readAsDataURL(blob);
        } catch (err) { imgElement.src = url; if(onProgress) onProgress(); }
    }
}

// ==================== بطاقة المنتج ====================
class ProductCard {
    constructor(product, storage, onUpdateTotal, initialQty = 0, onImageLoad) {
        this.product = product;
        this.storage = storage;
        this.onUpdateTotal = onUpdateTotal;
        this.quantity = initialQty;
        this.element = null;
        this.qtyInput = null;
        this.subtotalSpan = null;
        this.subtotalRow = null;
        this.onImageLoad = onImageLoad;
    }
    render() {
        const uniqueId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const cardDiv = document.createElement('div');
        cardDiv.className = 'product-card';
        cardDiv.setAttribute('data-name', this.product.name);
        cardDiv.setAttribute('data-price', this.product.price);
        cardDiv.setAttribute('data-stock', this.product.stock || 999);
        cardDiv.innerHTML = `
            <img class="product-image" id="${uniqueId}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f0f0f0'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%23999' font-size='10'%3E...%3C/text%3E%3C/svg%3E">
            <div class="product-info">
                <div class="product-name">${this.escapeHtml(this.product.name)}</div>
                <div class="product-price">${this.product.price.toLocaleString()} ل.س</div>
                <div class="item-subtotal" style="display: none;">المجموع: <span class="subtotal-val">0</span> ل.س</div>
                <div class="quantity-controls">
                    <button class="btn-qty inc-qty" style="background: var(--primary)">+</button>
                    <input type="number" class="qty-input" value="${this.quantity}" readonly>
                    <button class="btn-qty dec-qty">-</button>
                </div>
            </div>
        `;
        this.element = cardDiv;
        this.qtyInput = cardDiv.querySelector('.qty-input');
        this.subtotalSpan = cardDiv.querySelector('.subtotal-val');
        this.subtotalRow = cardDiv.querySelector('.item-subtotal');
        const incBtn = cardDiv.querySelector('.inc-qty');
        const decBtn = cardDiv.querySelector('.dec-qty');
        incBtn.addEventListener('click', () => { this.updateQuantity(1); });
        decBtn.addEventListener('click', () => { this.updateQuantity(-1); });
        const imgEl = cardDiv.querySelector(`#${uniqueId}`);
        LazyImage.render(imgEl, this.product.imageUrl, this.storage, this.onImageLoad);
        this.updateUI();
        return cardDiv;
    }
    updateUI() {
        this.qtyInput.value = this.quantity;
        if (this.quantity > 0) {
            const subtotal = this.quantity * this.product.price;
            this.subtotalSpan.innerText = subtotal.toLocaleString();
            this.subtotalRow.style.display = 'block';
        } else {
            this.subtotalRow.style.display = 'none';
        }
    }
    updateQuantity(delta) {
        const newVal = this.quantity + delta;
        const stock = parseInt(this.element.getAttribute('data-stock')) || 999;
        if (newVal >= 0 && newVal <= stock) {
            const wasZero = this.quantity === 0;
            this.quantity = newVal;
            this.updateUI();
            this.element.classList.add('added');
            setTimeout(() => this.element.classList.remove('added'), 300);
            if (this.onUpdateTotal) {
                this.onUpdateTotal(delta > 0 ? this.product.name : null, wasZero && delta > 0);
            }
        }
    }
    getQuantity() { return this.quantity; }
    getPrice() { return this.product.price; }
    getName() { return this.product.name; }
    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, (m) => {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }
}

// ==================== شبكة المنتجات (مع تحميل تجزيئي) ====================
class ProductsGrid {
    constructor(containerId, storage, onTotalUpdate, savedCart) {
        this.originalContainer = document.getElementById(containerId);
        this.storage = storage;
        this.onTotalUpdate = onTotalUpdate;
        this.cards = []; // { category, card, sectionElement, productData }
        this.savedCart = savedCart;
        this.imagesLoaded = 0;
        this.totalImages = 0;
        this.onImageProgress = null;
        // حاوية المحتوى الفعلية
        this.container = document.getElementById('productsContent');
        if (!this.container) {
            console.error("productsContent not found");
            this.container = this.originalContainer;
        }
        // تخزين قوائم المنتجات الكاملة لكل تصنيف
        this.fullProductsMap = new Map(); // category -> array of product objects
        this.currentPageMap = new Map(); // category -> current page index (0-based)
        this.loadMoreButtons = new Map(); // category -> button element
    }
    setImageProgressCallback(callback) {
        this.onImageProgress = callback;
    }
    imageLoaded() {
        this.imagesLoaded++;
        if (this.onImageProgress) {
            const percent = (this.imagesLoaded / this.totalImages) * 100;
            this.onImageProgress(percent);
        }
    }
    // إضافة تصنيف وعرض أول دفعة من المنتجات
    renderCategory(category, products) {
        // تخزين جميع المنتجات لهذا التصنيف
        this.fullProductsMap.set(category, products);
        this.currentPageMap.set(category, 0);
        // إنشاء قسم التصنيف إذا لم يكن موجوداً
        const sectionId = `section-${category}`;
        let sectionEl = document.getElementById(sectionId);
        if (!sectionEl) {
            const sectionHtml = `<div class="category-section" id="${sectionId}"><div class="category-header">${category}</div><div class="products-grid-inner" id="grid-${category}"></div></div>`;
            this.container.insertAdjacentHTML('beforeend', sectionHtml);
            sectionEl = document.getElementById(sectionId);
        }
        const gridInner = document.getElementById(`grid-${category}`);
        if (!gridInner) return;
        // عرض أول دفعة
        this.loadMoreForCategory(category, true); // true = reset existing
    }
    // تحميل دفعة إضافية لتصنيف معين
    loadMoreForCategory(category, reset = false) {
        const products = this.fullProductsMap.get(category);
        if (!products) return;
        const currentPage = this.currentPageMap.get(category) || 0;
        const start = reset ? 0 : currentPage * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const newProducts = products.slice(start, end);
        if (newProducts.length === 0) {
            // إخفاء زر "عرض المزيد" إذا لم يعد هناك منتجات
            const btn = this.loadMoreButtons.get(category);
            if (btn) btn.style.display = 'none';
            return;
        }
        const gridInner = document.getElementById(`grid-${category}`);
        if (!gridInner) return;
        if (reset) {
            // مسح المحتوى القديم وإعادة تعيين العداد
            gridInner.innerHTML = '';
            this.cards = this.cards.filter(c => c.category !== category);
            this.currentPageMap.set(category, 0);
        }
        // إنشاء البطاقات الجديدة
        newProducts.forEach(product => {
            const savedQty = this.savedCart[product.name] || 0;
            const card = new ProductCard(product, this.storage, (name, first) => this.onTotalUpdate(name, first), savedQty, () => this.imageLoaded());
            const cardElement = card.render();
            gridInner.appendChild(cardElement);
            this.cards.push({ category, card, sectionElement: gridInner, productData: product });
            this.totalImages++;
        });
        // تحديث رقم الصفحة
        const newPage = reset ? 1 : currentPage + 1;
        this.currentPageMap.set(category, newPage);
        // إدارة زر "عرض المزيد"
        let loadBtn = this.loadMoreButtons.get(category);
        const hasMore = end < products.length;
        if (!loadBtn && hasMore) {
            loadBtn = document.createElement('button');
            loadBtn.className = 'load-more-btn';
            loadBtn.innerText = '➕ عرض المزيد';
            loadBtn.addEventListener('click', () => this.loadMoreForCategory(category, false));
            gridInner.insertAdjacentElement('afterend', loadBtn);
            this.loadMoreButtons.set(category, loadBtn);
        } else if (loadBtn) {
            if (hasMore) {
                loadBtn.style.display = 'block';
            } else {
                loadBtn.style.display = 'none';
            }
        }
    }
    clear() {
        if (this.container) this.container.innerHTML = '';
        this.cards = [];
        this.imagesLoaded = 0;
        this.totalImages = 0;
        this.fullProductsMap.clear();
        this.currentPageMap.clear();
        this.loadMoreButtons.clear();
    }
    filterBySearch(query) {
        const lowerQuery = query.toLowerCase();
        let visibleCount = 0;
        // إظهار/إخفاء البطاقات بناءً على الاسم
        this.cards.forEach(({ card }) => {
            const name = card.getName().toLowerCase();
            const matches = name.includes(lowerQuery);
            card.element.style.display = matches ? 'block' : 'none';
            if (matches) visibleCount++;
        });
        // إخفاء أزرار "عرض المزيد" أثناء البحث (حتى لا تسبب ارتباكاً)
        this.loadMoreButtons.forEach((btn, category) => {
            if (lowerQuery !== '') {
                btn.style.display = 'none';
            } else {
                const products = this.fullProductsMap.get(category);
                if (products && (this.currentPageMap.get(category) * ITEMS_PER_PAGE) < products.length) {
                    btn.style.display = 'block';
                } else {
                    btn.style.display = 'none';
                }
            }
        });
        const resultSpan = document.getElementById('searchResultCount');
        if (resultSpan) {
            if (query.trim() !== '') resultSpan.innerText = `${visibleCount} نتيجة`;
            else resultSpan.innerText = '';
        }
        return visibleCount;
    }
    getAllCartItems() {
        return this.cards
            .filter(({ card }) => card.getQuantity() > 0)
            .map(({ card }) => ({
                name: card.getName(),
                quantity: card.getQuantity(),
                price: card.getPrice()
            }));
    }
    getCartMap() {
        const map = {};
        this.cards.forEach(({ card }) => {
            if (card.getQuantity() > 0) map[card.getName()] = card.getQuantity();
        });
        return map;
    }
    getTotalQuantity() {
        let total = 0;
        this.cards.forEach(({ card }) => total += card.getQuantity());
        return total;
    }
    scrollToCategory(category) {
        const section = document.getElementById(`section-${category}`);
        if (section) {
            window.scrollTo({ top: section.offsetTop - 120, behavior: 'smooth' });
        }
    }
}

// ==================== فوتر السلة ====================
class CartFooter {
    constructor(footerId, totalSpanId, onSendWhatsApp) {
        this.footer = document.getElementById(footerId);
        this.totalSpan = document.getElementById(totalSpanId);
        this.onSendWhatsApp = onSendWhatsApp;
        this.init();
    }
    init() {
        const btn = this.footer ? this.footer.querySelector('#whatsappBtn') : null;
        if (btn) btn.addEventListener('click', () => this.onSendWhatsApp());
    }
    updateTotal(total) {
        if (!this.totalSpan) return;
        this.totalSpan.innerText = total.toLocaleString();
        const hasItems = total > 0;
        if (this.footer) {
            if (hasItems) this.footer.classList.add('show');
            else this.footer.classList.remove('show');
        }
    }
}

// ==================== رأس التطبيق (بدون أزرار إضافية) ====================
class AppHeader {
    constructor(themeBtnId, searchInputId, clearSearchBtnId, onThemeToggle, onSearch, onCartClick) {
        this.themeBtn = document.getElementById(themeBtnId);
        this.searchInput = document.getElementById(searchInputId);
        this.clearSearchBtn = document.getElementById(clearSearchBtnId);
        this.cartBtn = document.getElementById('cartIconBtn');
        this.onThemeToggle = onThemeToggle;
        this.onSearch = onSearch;
        this.onCartClick = onCartClick;
        this.init();
    }
    init() {
        if (this.themeBtn) this.themeBtn.addEventListener('click', () => this.onThemeToggle());
        if (this.searchInput) this.searchInput.addEventListener('input', (e) => this.onSearch(e.target.value));
        if (this.clearSearchBtn) this.clearSearchBtn.addEventListener('click', () => { this.searchInput.value = ''; this.onSearch(''); this.clearSearchBtn.style.display = 'none'; });
        if (this.searchInput) this.searchInput.addEventListener('input', () => { if(this.clearSearchBtn) this.clearSearchBtn.style.display = this.searchInput.value ? 'flex' : 'none'; });
        if (this.cartBtn) this.cartBtn.addEventListener('click', () => this.onCartClick());
    }
    updateCartCount(count) {
        const counter = document.getElementById('cartCount');
        if (counter) {
            counter.innerText = count;
            counter.style.display = count > 0 ? 'flex' : 'none';
        }
    }
}

// ==================== أزرار التصنيفات ====================
class CategoryChips {
    constructor(containerId, onSelectCategory) {
        this.container = document.getElementById(containerId);
        this.onSelectCategory = onSelectCategory;
        this.categories = ['all'];
        this.activeCategory = 'all';
    }
    addCategory(catName) {
        if (catName === 'all' || !this.container) return;
        if (!this.categories.includes(catName)) {
            this.categories.push(catName);
            const chip = document.createElement('div');
            chip.className = 'chip';
            chip.setAttribute('data-category', catName);
            chip.innerText = catName;
            chip.addEventListener('click', () => this.selectCategory(catName, chip));
            this.container.appendChild(chip);
        }
    }
    selectCategory(catName, chipElement) {
        this.activeCategory = catName;
        document.querySelectorAll('.chip').forEach(ch => ch.classList.remove('active'));
        chipElement.classList.add('active');
        this.onSelectCategory(catName);
    }
}

// ==================== التطبيق الرئيسي ====================
class App {
    constructor() {
        this.storage = new StorageService();
        this.productsGrid = null;
        this.cartFooter = null;
        this.header = null;
        this.categoryChips = null;
        this.fullData = null;
        this.lastTotalQty = 0;
        this.savedCart = {};
        this.init();
    }
    async init() {
        await this.storage.init();
        this.loadSavedCart();
        this.productsGrid = new ProductsGrid('main-container', this.storage, (name, first) => this.updateTotal(name, first), this.savedCart);
        this.cartFooter = new CartFooter('footer-cart', 'grand-total', () => this.sendWhatsApp());
        this.header = new AppHeader(
            'themeToggleBtn', 'search-input', 'clearSearchBtn',
            () => this.toggleTheme(),
            (query) => this.productsGrid.filterBySearch(query),
            () => this.scrollToCart()
        );
        this.categoryChips = new CategoryChips('category-chips', (cat) => this.onCategorySelected(cat));

        // شريط تقدم الصور
        const progressBar = document.getElementById('imageProgressBar');
        const progressFill = document.querySelector('.image-progress-fill');
        if (progressBar && progressFill) {
            this.productsGrid.setImageProgressCallback((percent) => {
                if (percent < 100) {
                    progressBar.style.display = 'block';
                    progressFill.style.width = `${percent}%`;
                } else {
                    setTimeout(() => { progressBar.style.display = 'none'; }, 500);
                }
            });
        }

        // إظهار skeleton أولاً
        const skeleton = document.getElementById('skeletonContainer');
        const productsContent = document.getElementById('productsContent');
        if (skeleton) skeleton.style.display = 'grid';
        if (productsContent) productsContent.style.display = 'none';

        const cachedData = await this.storage.getApiCache();
        if (cachedData) this.renderFullData(cachedData);
        this.fetchFreshData();
        this.setupOfflineDetection();
    }
    setupOfflineDetection() {
        window.addEventListener('online', () => {
            const offlinePage = document.getElementById('offlinePage');
            if (offlinePage) offlinePage.style.display = 'none';
            this.fetchFreshData();
        });
        window.addEventListener('offline', () => {
            const offlinePage = document.getElementById('offlinePage');
            if (offlinePage && !this.fullData) offlinePage.style.display = 'flex';
        });
        const retryBtn = document.getElementById('retryConnectionBtn');
        if (retryBtn) retryBtn.addEventListener('click', () => { if(navigator.onLine) this.fetchFreshData(); else alert('لا يوجد اتصال إنترنت'); });
    }
    loadSavedCart() {
        const saved = localStorage.getItem('savedCart');
        if (saved) this.savedCart = JSON.parse(saved);
        else this.savedCart = {};
    }
    saveCart() {
        if (this.productsGrid) {
            localStorage.setItem('savedCart', JSON.stringify(this.productsGrid.getCartMap()));
        }
    }
    async fetchFreshData() {
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!data || typeof data !== 'object' || Object.keys(data).length === 0)
                throw new Error("البيانات فارغة أو غير صالحة");
            if (!this.fullData) this.renderFullData(data);
            await this.storage.saveApiCache(data);
        } catch (err) {
            console.error(err);
            const skeleton = document.getElementById('skeletonContainer');
            if (skeleton) skeleton.style.display = 'none';
            const productsContent = document.getElementById('productsContent');
            if (productsContent && !this.fullData) {
                productsContent.style.display = 'block';
                productsContent.innerHTML = `<div class="loader">❌ فشل التحميل: ${err.message}<br><small>تأكد من اتصال الإنترنت وأن API يعمل</small></div>`;
            }
        }
    }
    renderFullData(data) {
        this.fullData = data;
        this.productsGrid.clear();
        // إخفاء skeleton وإظهار المحتوى
        const skeleton = document.getElementById('skeletonContainer');
        const productsContent = document.getElementById('productsContent');
        if (skeleton) skeleton.style.display = 'none';
        if (productsContent) productsContent.style.display = 'block';
        const mainContainer = document.getElementById('main-container');
        if (mainContainer) mainContainer.style.display = 'block';
        for (const category in data) {
            const validProducts = data[category].map(p => ({
                ...p,
                imageUrl: p.imageUrl && p.imageUrl.startsWith('http') ? p.imageUrl : 'https://via.placeholder.com/300?text=No+Image',
                stock: p.stock !== undefined ? p.stock : 999
            }));
            this.categoryChips.addCategory(category);
            this.productsGrid.renderCategory(category, validProducts);
        }
        this.updateTotal();
    }
    onCategorySelected(category) {
        if (category === 'all') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            document.querySelectorAll('.category-section').forEach(section => section.style.display = 'block');
        } else {
            document.querySelectorAll('.category-section').forEach(section => section.style.display = 'none');
            const targetSection = document.getElementById(`section-${category}`);
            if (targetSection) targetSection.style.display = 'block';
            this.productsGrid.scrollToCategory(category);
        }
    }
    updateTotal(productName = null, isFirst = false) {
        const items = this.productsGrid.getAllCartItems();
        let total = 0, totalQty = 0;
        for (const item of items) {
            total += item.quantity * item.price;
            totalQty += item.quantity;
        }
        this.cartFooter.updateTotal(total);
        if (this.header) this.header.updateCartCount(totalQty);
        this.lastTotalQty = totalQty;
        this.saveCart();
    }
    scrollToCart() {
        const footer = document.getElementById('footer-cart');
        if (footer) {
            footer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            footer.style.boxShadow = '0 0 0 2px var(--primary)';
            setTimeout(() => footer.style.boxShadow = '', 500);
        }
    }
    sendWhatsApp() {
        const items = this.productsGrid.getAllCartItems();
        if (items.length === 0) return;
        let message = "";
        for (const item of items) {
            const sub = item.quantity * item.price;
            message += `🛒 *${item.name}*\n   ${item.quantity} قطعة × ${item.price.toLocaleString()} = ${sub.toLocaleString()} ل.س\n`;
        }
        message += "--------------------------\n";
        const totalSpan = document.getElementById('grand-total');
        message += `💰 *الإجمالي النهائي: ${totalSpan ? totalSpan.innerText : '0'} ل.س*`;
        window.open(`https://wa.me/${TARGET_NUMBER}?text=${encodeURIComponent(message)}`);
    }
    toggleTheme() {
        const body = document.body;
        const isDark = body.getAttribute('data-theme') === 'dark';
        body.setAttribute('data-theme', isDark ? 'light' : 'dark');
        const icon = document.getElementById('theme-icon');
        if (icon) icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
        const dayElements = document.querySelector('.day-elements');
        const nightElements = document.querySelector('.night-elements');
        if (dayElements && nightElements) {
            if (isDark) { dayElements.style.display = 'none'; nightElements.style.display = 'block'; }
            else { dayElements.style.display = 'block'; nightElements.style.display = 'none'; }
        }
    }
}

// بدء التطبيق
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => new App());
else new App();

// تسجيل Service Worker (مع تجاهل أخطاء الأيقونات)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW registration failed:', err));
    });
}
