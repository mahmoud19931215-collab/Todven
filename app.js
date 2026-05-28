// ==================== ثوابت عامة ====================
const TARGET_NUMBER = "963945083365";
const API_URL = "https://script.google.com/macros/s/AKfycbz8CnO-_aiuboqy7R4kXFA-FQ4uNaLAVc5-_aC-z6txmg2W33wG7c4Igj_NJeKGF-fk/exec";
const ITEMS_PER_PAGE = 12;

// ==================== خدمة التخزين (Dexie) مع دعم Blob ====================
class StorageService {
    constructor() {
        this.db = null;
        this.useLocalStorageFallback = false;
        this.init();
    }
    async init() {
        try {
            this.db = new Dexie("RogvenImageCache");
            this.db.version(3).stores({
                images: "url",
                apiCache: "key"
            });
            await this.db.open();
        } catch (err) {
            console.warn("IndexedDB failed, falling back to localStorage", err);
            this.useLocalStorageFallback = true;
        }
    }
    async getImageBlob(url) {
        if (this.useLocalStorageFallback) {
            const data = localStorage.getItem(`img_${url}`);
            if (data) {
                const binary = atob(data.split(',')[1]);
                const array = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
                return new Blob([array], { type: 'image/jpeg' });
            }
            return null;
        }
        try {
            const record = await this.db.images.get(url);
            return record ? record.blob : null;
        } catch(e) { return null; }
    }
    async saveImageBlob(url, blob) {
        if (this.useLocalStorageFallback) {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
                try {
                    localStorage.setItem(`img_${url}`, reader.result);
                } catch(e) { console.warn("localStorage full", e); }
            };
            return;
        }
        try {
            await this.db.images.put({ url, blob });
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

// ==================== تحميل الصور (باستخدام Blob) ====================
class LazyImage {
    static async render(imgElement, url, storage, onProgress) {
        if (!url) return;
        const blob = await storage.getImageBlob(url);
        if (blob) {
            const objectUrl = URL.createObjectURL(blob);
            imgElement.src = objectUrl;
            if (onProgress) onProgress();
            return;
        }
        try {
            const response = await fetch(url);
            const blobData = await response.blob();
            await storage.saveImageBlob(url, blobData);
            const objectUrl = URL.createObjectURL(blobData);
            imgElement.src = objectUrl;
            if (onProgress) onProgress();
        } catch (err) {
            imgElement.src = url;
            if(onProgress) onProgress();
        }
    }
}

// ==================== بطاقة المنتج (نفس الكود القديم) ====================
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
        this.debounceTimer = null;
    }
    render() {
        const uniqueId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
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
                    <input type="number" class="qty-input" value="${this.quantity}" step="1" min="0">
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
        incBtn.addEventListener('click', (e) => { e.stopPropagation(); this.updateQuantity(1); });
        decBtn.addEventListener('click', (e) => { e.stopPropagation(); this.updateQuantity(-1); });
        this.qtyInput.addEventListener('change', (e) => {
            let newVal = parseInt(e.target.value);
            if (isNaN(newVal)) newVal = 0;
            const stock = parseInt(this.element.getAttribute('data-stock')) || 999;
            newVal = Math.min(stock, Math.max(0, newVal));
            const delta = newVal - this.quantity;
            if (delta !== 0) {
                this.quantity = newVal;
                this.updateUI();
                this.onUpdateTotal(delta > 0 ? this.product.name : null, false);
            }
            this.qtyInput.value = this.quantity;
        });
        
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
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            const newVal = this.quantity + delta;
            const stock = parseInt(this.element.getAttribute('data-stock')) || 999;
            if (newVal >= 0 && newVal <= stock) {
                const wasZero = this.quantity === 0;
                this.quantity = newVal;
                this.updateUI();
                this.element.classList.add('added');
                setTimeout(() => this.element.classList.remove('added'), 300);
                this.onUpdateTotal(delta > 0 ? this.product.name : null, wasZero && delta > 0);
            }
            this.debounceTimer = null;
        }, 150);
    }
    getQuantity() { return this.quantity; }
    getPrice() { return this.product.price; }
    getName() { return this.product.name; }
    getStock() { return parseInt(this.element.getAttribute('data-stock')) || 999; }
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

// ==================== شبكة المنتجات (مع دعم التصنيفات الرئيسية والفرعية) ====================
class ProductsGrid {
    constructor(containerId, storage, onTotalUpdate, savedCart) {
        this.storage = storage;
        this.onTotalUpdate = onTotalUpdate;
        this.savedCart = savedCart;
        this.container = document.getElementById('productsContent');
        if (!this.container) {
            console.error("productsContent not found, fallback to main-container");
            this.container = document.getElementById(containerId);
        }
        this.cards = [];              // { mainCat, subCat, card }
        this.mainCategories = new Set();
        this.subCategoriesMap = new Map();   // mainCat -> Set of subCats
        this.productsMap = new Map();        // key "mainCat|subCat" -> array of products
        this.currentPageMap = new Map();     // key "mainCat|subCat" -> page
        this.loadMoreButtons = new Map();    // key "mainCat|subCat" -> button element
        this.activeMainCategory = 'all';
        this.activeSubCategory = null;      // null = all subcats under main, otherwise specific sub
        this.searchQuery = '';
        this.imagesLoaded = 0;
        this.totalImages = 0;
        this.onImageProgress = null;
        this.setupEventDelegation();
    }

    setupEventDelegation() {
        this.container.addEventListener('click', (e) => {
            const target = e.target;
            if (target.classList?.contains('inc-qty') || target.classList?.contains('dec-qty')) {
                const cardDiv = target.closest('.product-card');
                if (cardDiv) {
                    const cardObj = this.cards.find(c => c.card.element === cardDiv);
                    if (cardObj) {
                        const delta = target.classList.contains('inc-qty') ? 1 : -1;
                        cardObj.card.updateQuantity(delta);
                    }
                }
            }
        });
    }

    setImageProgressCallback(callback) { this.onImageProgress = callback; }

    imageLoaded() {
        this.imagesLoaded++;
        if (this.onImageProgress) {
            const percent = (this.imagesLoaded / this.totalImages) * 100;
            this.onImageProgress(percent);
        }
    }

    // تحميل البيانات من API (هيكل: { mainCat: { subCat: [products] } })
    loadData(data) {
        this.clear();
        for (const [mainCat, subCatsObj] of Object.entries(data)) {
            this.mainCategories.add(mainCat);
            const subSet = new Set();
            for (const [subCat, products] of Object.entries(subCatsObj)) {
                subSet.add(subCat);
                const validProducts = products.map(p => ({
                    ...p,
                    imageUrl: p.imageUrl && p.imageUrl.startsWith('http') ? p.imageUrl : 'https://via.placeholder.com/300?text=No+Image',
                    stock: p.stock !== undefined ? p.stock : 999
                }));
                const key = `${mainCat}|${subCat}`;
                this.productsMap.set(key, validProducts);
                this.currentPageMap.set(key, 0);
            }
            this.subCategoriesMap.set(mainCat, subSet);
        }
        this.renderVisibleSections();
    }

    // رسم الأقسام بناءً على التصنيف النشط والبحث
    renderVisibleSections() {
        this.container.innerHTML = '';
        this.cards = [];
        this.totalImages = 0;
        this.imagesLoaded = 0;
        const lowerQuery = this.searchQuery.toLowerCase();

        // تحديد الأقسام التي سيتم عرضها
        const sections = [];
        if (this.activeMainCategory === 'all') {
            for (let mainCat of this.mainCategories) {
                const subCats = this.subCategoriesMap.get(mainCat) || new Set();
                for (let subCat of subCats) {
                    sections.push({ mainCat, subCat });
                }
            }
        } else {
            if (this.activeSubCategory && this.activeSubCategory !== 'all') {
                sections.push({ mainCat: this.activeMainCategory, subCat: this.activeSubCategory });
            } else {
                const subCats = this.subCategoriesMap.get(this.activeMainCategory) || new Set();
                for (let subCat of subCats) {
                    sections.push({ mainCat: this.activeMainCategory, subCat });
                }
            }
        }

        for (let { mainCat, subCat } of sections) {
            const key = `${mainCat}|${subCat}`;
            let products = this.productsMap.get(key) || [];
            if (lowerQuery) {
                products = products.filter(p => p.name.toLowerCase().includes(lowerQuery));
                if (products.length === 0) continue;
                // عرض بدون تجزئة (كل المنتجات مرة واحدة لأن البحث قلل العدد عادة)
                this.renderSubCategorySection(mainCat, subCat, products, false);
            } else {
                this.renderSubCategorySection(mainCat, subCat, products, true);
            }
        }

        // إخفاء أزرار التحميل إذا كان هناك بحث
        if (lowerQuery) {
            this.loadMoreButtons.forEach(btn => btn.style.display = 'none');
        }
    }

    renderSubCategorySection(mainCat, subCat, products, paginated = true) {
        const sectionId = `section-${mainCat}-${subCat}`;
        let sectionEl = document.getElementById(sectionId);
        if (!sectionEl) {
            const html = `<div class="category-section" id="${sectionId}">
                            <div class="category-header" data-main="${mainCat}" data-sub="${subCat}">
                                ${mainCat} <span style="font-size:14px; color:var(--primary);"> / ${subCat}</span>
                            </div>
                            <div class="products-grid-inner" id="grid-${mainCat}-${subCat}"></div>
                          </div>`;
            this.container.insertAdjacentHTML('beforeend', html);
            sectionEl = document.getElementById(sectionId);
        }
        const gridInner = document.getElementById(`grid-${mainCat}-${subCat}`);
        if (!gridInner) return;

        if (paginated) {
            this.loadMoreForSubCategory(mainCat, subCat, true);
        } else {
            // وضع البحث: عرض كل المنتجات بدون أزرار "عرض المزيد"
            gridInner.innerHTML = '';
            products.forEach(product => {
                const savedQty = this.savedCart[product.name] || 0;
                const card = new ProductCard(product, this.storage, (name, first) => this.onTotalUpdate(name, first), savedQty, () => this.imageLoaded());
                const cardEl = card.render();
                gridInner.appendChild(cardEl);
                this.cards.push({ mainCat, subCat, card });
                this.totalImages++;
            });
            // إخفاء زر "المزيد" لهذا القسم إن وجد
            const key = `${mainCat}|${subCat}`;
            const btn = this.loadMoreButtons.get(key);
            if (btn) btn.style.display = 'none';
        }
    }

    loadMoreForSubCategory(mainCat, subCat, reset = false) {
        const key = `${mainCat}|${subCat}`;
        const products = this.productsMap.get(key);
        if (!products) return;
        const currentPage = this.currentPageMap.get(key) || 0;
        const start = reset ? 0 : currentPage * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const newProducts = products.slice(start, end);
        if (newProducts.length === 0) {
            const btn = this.loadMoreButtons.get(key);
            if (btn) btn.style.display = 'none';
            return;
        }
        const gridInner = document.getElementById(`grid-${mainCat}-${subCat}`);
        if (!gridInner) return;
        if (reset) {
            gridInner.innerHTML = '';
            this.cards = this.cards.filter(c => !(c.mainCat === mainCat && c.subCat === subCat));
            this.currentPageMap.set(key, 0);
        }
        newProducts.forEach(product => {
            const savedQty = this.savedCart[product.name] || 0;
            const card = new ProductCard(product, this.storage, (name, first) => this.onTotalUpdate(name, first), savedQty, () => this.imageLoaded());
            const cardEl = card.render();
            gridInner.appendChild(cardEl);
            this.cards.push({ mainCat, subCat, card });
            this.totalImages++;
        });
        const newPage = reset ? 1 : currentPage + 1;
        this.currentPageMap.set(key, newPage);
        let loadBtn = this.loadMoreButtons.get(key);
        const hasMore = end < products.length;
        if (!loadBtn && hasMore) {
            loadBtn = document.createElement('button');
            loadBtn.className = 'load-more-btn';
            loadBtn.innerText = '➕ عرض المزيد';
            loadBtn.addEventListener('click', () => this.loadMoreForSubCategory(mainCat, subCat, false));
            gridInner.insertAdjacentElement('afterend', loadBtn);
            this.loadMoreButtons.set(key, loadBtn);
        } else if (loadBtn) {
            loadBtn.style.display = hasMore ? 'block' : 'none';
        }
    }

    filterBySearch(query) {
        this.searchQuery = query.toLowerCase();
        this.renderVisibleSections();
        const visibleCount = this.cards.filter(c => c.card.element.style.display !== 'none').length;
        const resultSpan = document.getElementById('searchResultCount');
        if (resultSpan) {
            if (query.trim() !== '') resultSpan.innerText = `${visibleCount} نتيجة`;
            else resultSpan.innerText = '';
        }
        return visibleCount;
    }

    setActiveMainCategory(mainCat) {
        this.activeMainCategory = mainCat;
        this.activeSubCategory = null;
        this.renderVisibleSections();
    }

    setActiveSubCategory(subCat) {
        this.activeSubCategory = subCat === 'all' ? null : subCat;
        this.renderVisibleSections();
    }

    getAllCartItems() {
        return this.cards.filter(({ card }) => card.getQuantity() > 0).map(({ card }) => ({
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

    removeItemFromCart(productName) {
        const cardObj = this.cards.find(c => c.card.getName() === productName);
        if (cardObj && cardObj.card.getQuantity() > 0) {
            cardObj.card.updateQuantity(-cardObj.card.getQuantity());
            return true;
        }
        return false;
    }

    clear() {
        if (this.container) this.container.innerHTML = '';
        this.cards = [];
        this.mainCategories.clear();
        this.subCategoriesMap.clear();
        this.productsMap.clear();
        this.currentPageMap.clear();
        this.loadMoreButtons.clear();
        this.totalImages = 0;
        this.imagesLoaded = 0;
    }
}

// ==================== فوتر السلة (بدون تغيير) ====================
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
        const cartBadge = document.getElementById('cartCountBadge');
        if (cartBadge) {
            const totalQty = this.getTotalQtyFromStorage();
            cartBadge.innerText = totalQty;
            cartBadge.style.display = totalQty > 0 ? 'flex' : 'none';
        }
    }
    getTotalQtyFromStorage() {
        const saved = localStorage.getItem('savedCart');
        if (saved) {
            const cart = JSON.parse(saved);
            let total = 0;
            for (let qty of Object.values(cart)) total += qty;
            return total;
        }
        return 0;
    }
}

// ==================== رأس التطبيق (بدون تغيير) ====================
class AppHeader {
    constructor(themeBtnId, searchInputId, clearSearchBtnId, onThemeToggle, onSearch) {
        this.themeBtn = document.getElementById(themeBtnId);
        this.searchInput = document.getElementById(searchInputId);
        this.clearSearchBtn = document.getElementById(clearSearchBtnId);
        this.onThemeToggle = onThemeToggle;
        this.onSearch = onSearch;
        this.init();
    }
    init() {
        if (this.themeBtn) this.themeBtn.addEventListener('click', () => this.onThemeToggle());
        if (this.searchInput) this.searchInput.addEventListener('input', (e) => this.onSearch(e.target.value));
        if (this.clearSearchBtn) this.clearSearchBtn.addEventListener('click', () => { this.searchInput.value = ''; this.onSearch(''); this.clearSearchBtn.style.display = 'none'; });
        if (this.searchInput) this.searchInput.addEventListener('input', () => { if(this.clearSearchBtn) this.clearSearchBtn.style.display = this.searchInput.value ? 'flex' : 'none'; });
    }
}

// ==================== أزرار التصنيفات الرئيسية (معدل) ====================
class MainCategoryChips {
    constructor(containerId, onSelectMainCategory) {
        this.container = document.getElementById(containerId);
        this.onSelectMainCategory = onSelectMainCategory;
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
        document.querySelectorAll('#main-category-chips .chip').forEach(ch => ch.classList.remove('active'));
        chipElement.classList.add('active');
        this.onSelectMainCategory(catName);
    }
    clearAllExceptAll() {
        const chips = this.container.querySelectorAll('.chip');
        chips.forEach(chip => {
            const cat = chip.getAttribute('data-category');
            if (cat !== 'all') chip.remove();
        });
        this.categories = ['all'];
        this.activeCategory = 'all';
        const allChip = this.container.querySelector('.chip[data-category="all"]');
        if (allChip) allChip.classList.add('active');
    }
}

// ==================== أزرار التصنيفات الفرعية ====================
class SubCategoryChips {
    constructor(containerId, onSelectSubCategory) {
        this.container = document.getElementById(containerId);
        this.onSelectSubCategory = onSelectSubCategory;
    }
    updateSubCategories(subCategories, activeMainCat) {
        if (!this.container) return;
        if (!subCategories || subCategories.size === 0 || activeMainCat === 'all') {
            this.container.style.display = 'none';
            return;
        }
        this.container.style.display = 'flex';
        this.container.innerHTML = '<div class="chip sub-active" data-sub="all">الكل</div>';
        for (let sub of subCategories) {
            const chip = document.createElement('div');
            chip.className = 'chip';
            chip.setAttribute('data-sub', sub);
            chip.innerText = sub;
            chip.addEventListener('click', () => {
                document.querySelectorAll('#subcategory-chips .chip').forEach(ch => ch.classList.remove('sub-active'));
                chip.classList.add('sub-active');
                this.onSelectSubCategory(sub);
            });
            this.container.appendChild(chip);
        }
        // تفعيل "الكل" افتراضياً
        const allChip = this.container.querySelector('[data-sub="all"]');
        if (allChip) allChip.classList.add('sub-active');
        this.onSelectSubCategory('all');
    }
}

// ==================== التطبيق الرئيسي (مع دعم التصنيفين) ====================
class App {
    constructor() {
        this.storage = new StorageService();
        this.productsGrid = null;
        this.cartFooter = null;
        this.header = null;
        this.mainCategoryChips = null;
        this.subCategoryChips = null;
        this.fullData = null;
        this.savedCart = {};
        this.lastFetchTime = null;
        this.init();
    }

    async init() {
        await this.storage.init();
        this.loadSavedCart();
        this.productsGrid = new ProductsGrid('main-container', this.storage, () => this.updateTotal(), this.savedCart);
        this.cartFooter = new CartFooter('footer-cart', 'grand-total', () => this.sendWhatsApp());
        this.header = new AppHeader(
            'themeToggleBtn', 'search-input', 'clearSearchBtn',
            () => this.toggleTheme(),
            (query) => this.productsGrid.filterBySearch(query)
        );
        this.mainCategoryChips = new MainCategoryChips('main-category-chips', (cat) => this.onMainCategorySelected(cat));
        this.subCategoryChips = new SubCategoryChips('subcategory-chips', (sub) => this.onSubCategorySelected(sub));

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

        const skeleton = document.getElementById('skeletonContainer');
        const productsContent = document.getElementById('productsContent');
        if (skeleton) skeleton.style.display = 'grid';
        if (productsContent) productsContent.style.display = 'none';

        const cachedData = await this.storage.getApiCache();
        if (cachedData) {
            this.renderFullData(cachedData);
            this.showOfflineBanner(true, this.getLastUpdateTimeFromCache());
        }
        this.fetchFreshData();
        this.setupOfflineDetection();
        this.setupSettingsModal();
        this.setupCartModal();
        this.updateCartBadge();
    }

    getLastUpdateTimeFromCache() {
        if (this.storage.useLocalStorageFallback) {
            const cached = localStorage.getItem('apiCache');
            if (cached) {
                const data = JSON.parse(cached);
                return data.timestamp;
            }
        }
        return null;
    }

    showOfflineBanner(isCached, timestamp) {
        const banner = document.getElementById('offlineBanner');
        if (!banner) return;
        if (isCached) {
            banner.style.display = 'block';
            const msgSpan = document.querySelector('#offlineBanner .offline-banner-content span:first-of-type');
            if (msgSpan) msgSpan.innerText = 'أنت تشاهد نسخة مخزنة مؤقتاً';
            const timeSpan = document.getElementById('lastUpdateTime');
            if (timeSpan && timestamp) {
                const date = new Date(timestamp);
                timeSpan.innerText = `آخر تحديث: ${date.toLocaleTimeString()}`;
            }
        } else {
            banner.style.display = 'none';
        }
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
        const retryFetchBtn = document.getElementById('retryFetchBtn');
        if (retryFetchBtn) retryFetchBtn.addEventListener('click', () => this.fetchFreshData());
        const closeBannerBtn = document.getElementById('closeBannerBtn');
        if (closeBannerBtn) closeBannerBtn.addEventListener('click', () => {
            document.getElementById('offlineBanner').style.display = 'none';
        });
    }

    setupSettingsModal() {
        const settingsBtn = document.getElementById('settingsBtn');
        const modal = document.getElementById('settingsModal');
        const closeBtn = document.getElementById('closeSettingsBtn');
        const clearCacheBtn = document.getElementById('clearCacheBtn');
        if (settingsBtn && modal) {
            settingsBtn.addEventListener('click', () => modal.style.display = 'flex');
            if (closeBtn) closeBtn.addEventListener('click', () => modal.style.display = 'none');
            modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });
            if (clearCacheBtn) {
                clearCacheBtn.addEventListener('click', async () => {
                    if (confirm('هل أنت متأكد من مسح الكاش؟ سيتم حذف جميع الصور المخزنة والبيانات المؤقتة.')) {
                        await this.storage.clearAllCache();
                        alert('تم مسح الكاش بنجاح. سيتم إعادة تحميل البيانات عند تحديث الصفحة.');
                        location.reload();
                    }
                });
            }
        }
    }

    setupCartModal() {
        const cartIcon = document.getElementById('cartIconBtn');
        const modal = document.getElementById('cartModal');
        const closeBtn = document.getElementById('closeCartBtn');
        const whatsappBtn = document.getElementById('cartModalWhatsappBtn');
        if (cartIcon && modal) {
            cartIcon.addEventListener('click', () => {
                this.updateCartModal();
                modal.style.display = 'flex';
            });
            if (closeBtn) closeBtn.addEventListener('click', () => modal.style.display = 'none');
            modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });
            if (whatsappBtn) whatsappBtn.addEventListener('click', () => {
                modal.style.display = 'none';
                this.sendWhatsApp();
            });
        }
    }

    updateCartModal() {
        const items = this.productsGrid.getAllCartItems();
        const container = document.getElementById('cartItemsList');
        const totalSpan = document.getElementById('cartModalTotal');
        if (!container) return;
        if (items.length === 0) {
            container.innerHTML = '<div class="empty-cart-msg">السلة فارغة</div>';
            if (totalSpan) totalSpan.innerText = '0';
            return;
        }
        let total = 0;
        let html = '';
        items.forEach(item => {
            const subtotal = item.quantity * item.price;
            total += subtotal;
            html += `
                <div class="cart-item" data-name="${this.escapeHtml(item.name)}">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${this.escapeHtml(item.name)}</div>
                        <div class="cart-item-price">${item.price.toLocaleString()} ل.س</div>
                        <div class="cart-item-qty">الكمية: ${item.quantity}</div>
                    </div>
                    <button class="cart-item-remove" data-name="${this.escapeHtml(item.name)}"><i class="fas fa-trash"></i></button>
                </div>
            `;
        });
        container.innerHTML = html;
        if (totalSpan) totalSpan.innerText = total.toLocaleString();
        container.querySelectorAll('.cart-item-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const name = btn.getAttribute('data-name');
                if (name && this.productsGrid.removeItemFromCart(name)) {
                    this.updateTotal();
                    this.updateCartModal();
                    this.updateCartBadge();
                }
            });
        });
    }

    updateCartBadge() {
        const cartIcon = document.getElementById('cartIconBtn');
        const badge = document.getElementById('cartCountBadge');
        if (!cartIcon || !badge) return;
        const items = this.productsGrid.getAllCartItems();
        let totalQty = 0;
        items.forEach(i => totalQty += i.quantity);
        badge.innerText = totalQty;
        badge.style.display = totalQty > 0 ? 'flex' : 'none';
        cartIcon.style.display = 'inline-flex';
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
        const skeleton = document.getElementById('skeletonContainer');
        const productsContent = document.getElementById('productsContent');
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!data || typeof data !== 'object' || Object.keys(data).length === 0)
                throw new Error("البيانات فارغة أو غير صالحة");
            this.lastFetchTime = Date.now();
            await this.storage.saveApiCache(data);
            this.renderFullData(data);
            this.showOfflineBanner(false);
            if (skeleton) skeleton.style.display = 'none';
            if (productsContent) productsContent.style.display = 'block';
        } catch (err) {
            console.error(err);
            if (!this.fullData) {
                if (skeleton) skeleton.style.display = 'none';
                if (productsContent) {
                    productsContent.style.display = 'block';
                    productsContent.innerHTML = `<div class="loader">❌ فشل التحميل: ${err.message}<br><small>تأكد من اتصال الإنترنت وأن API يعمل</small><br><button id="retryFetchBtn" class="retry-fetch-btn">إعادة المحاولة</button></div>`;
                    const retry = document.getElementById('retryFetchBtn');
                    if (retry) retry.addEventListener('click', () => this.fetchFreshData());
                }
            } else {
                this.showOfflineBanner(true, this.lastFetchTime);
            }
        }
    }

    renderFullData(data) {
        this.fullData = data;
        this.productsGrid.loadData(data);
        // تحديث أزرار التصنيفات الرئيسية
        const mainCats = Array.from(this.productsGrid.mainCategories);
        this.mainCategoryChips.clearAllExceptAll();
        mainCats.forEach(cat => this.mainCategoryChips.addCategory(cat));
        // تحديث التصنيفات الفرعية بناءً على التصنيف الرئيسي النشط (الكل حالياً)
        this.onMainCategorySelected('all');
        const skeleton = document.getElementById('skeletonContainer');
        const productsContent = document.getElementById('productsContent');
        if (skeleton) skeleton.style.display = 'none';
        if (productsContent) productsContent.style.display = 'block';
        this.updateTotal();
        this.updateCartBadge();
    }

    onMainCategorySelected(category) {
        this.productsGrid.setActiveMainCategory(category);
        if (category === 'all') {
            this.subCategoryChips.container.style.display = 'none';
            this.productsGrid.activeSubCategory = null;
        } else {
            const subSet = this.productsGrid.subCategoriesMap.get(category) || new Set();
            this.subCategoryChips.updateSubCategories(subSet, category);
        }
        this.updateCartBadge(); // لتحديث العدد بعد التصفية (اختياري)
    }

    onSubCategorySelected(sub) {
        this.productsGrid.setActiveSubCategory(sub);
    }

    updateTotal() {
        const items = this.productsGrid.getAllCartItems();
        let total = 0, totalQty = 0;
        for (const item of items) {
            total += item.quantity * item.price;
            totalQty += item.quantity;
        }
        this.cartFooter.updateTotal(total);
        this.saveCart();
        this.updateCartBadge();
    }

    sendWhatsApp() {
        const items = this.productsGrid.getAllCartItems();
        if (items.length === 0) return;
        if (!confirm(`هل تريد إرسال الطلب إلى واتساب؟\nالإجمالي: ${document.getElementById('grand-total').innerText} ل.س`)) return;
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

// بدء التطبيق
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => new App());
else new App();

// تسجيل Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW registration failed:', err));
    });
}
