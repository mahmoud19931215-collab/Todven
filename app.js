// ==================== ثوابت عامة ====================
const TARGET_NUMBER = "963945083365";
const API_URL = "https://script.google.com/macros/s/AKfycbz8CnO-_aiuboqy7R4kXFA-FQ4uNaLAVc5-_aC-z6txmg2W33wG7c4Igj_NJeKGF-fk/exec";

// ==================== خدمة التخزين المحلي (IndexedDB) ====================
const DB_NAME = "RogvenImageCache";
const IMAGE_STORE = "images";
const API_CACHE_STORE = "apiCache";

class StorageService {
    constructor() {
        this.db = null;
        this.init();
    }
    init() {
        return new Promise((resolve) => {
            const request = indexedDB.open(DB_NAME, 2);
            request.onupgradeneeded = (e) => {
                const dbRef = e.target.result;
                if (!dbRef.objectStoreNames.contains(IMAGE_STORE))
                    dbRef.createObjectStore(IMAGE_STORE);
                if (!dbRef.objectStoreNames.contains(API_CACHE_STORE))
                    dbRef.createObjectStore(API_CACHE_STORE);
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            request.onerror = () => resolve();
        });
    }

    async getImage(url) {
        if (!this.db) return null;
        return new Promise((resolve) => {
            const tx = this.db.transaction([IMAGE_STORE], "readonly");
            const get = tx.objectStore(IMAGE_STORE).get(url);
            get.onsuccess = () => resolve(get.result || null);
            get.onerror = () => resolve(null);
        });
    }

    async saveImage(url, base64) {
        if (!this.db) return;
        const tx = this.db.transaction([IMAGE_STORE], "readwrite");
        tx.objectStore(IMAGE_STORE).put(base64, url);
    }

    async getApiCache() {
        if (!this.db) return null;
        return new Promise((resolve) => {
            const tx = this.db.transaction([API_CACHE_STORE], "readonly");
            const get = tx.objectStore(API_CACHE_STORE).get("mainData");
            get.onsuccess = () => {
                const cached = get.result;
                if (cached && (Date.now() - cached.timestamp) < 3600000) // ساعة واحدة
                    resolve(cached.data);
                else resolve(null);
            };
            get.onerror = () => resolve(null);
        });
    }

    async saveApiCache(data) {
        if (!this.db) return;
        const tx = this.db.transaction([API_CACHE_STORE], "readwrite");
        tx.objectStore(API_CACHE_STORE).put({ timestamp: Date.now(), data }, "mainData");
    }
}

// ==================== مكون الصورة مع التخزين ====================
class LazyImage {
    static async render(imgElement, url, storage) {
        if (!url) return;
        const cached = await storage.getImage(url);
        if (cached) {
            imgElement.src = cached;
            return;
        }
        // تحميل الصورة وحفظها
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result;
                await storage.saveImage(url, base64);
                imgElement.src = base64;
            };
            reader.readAsDataURL(blob);
        } catch (err) {
            imgElement.src = url;
        }
    }
}

// ==================== مكون المنتج (Product Card) ====================
class ProductCard {
    constructor(product, storage, container, onUpdateTotal) {
        this.product = product;
        this.storage = storage;
        this.container = container;
        this.onUpdateTotal = onUpdateTotal;
        this.quantity = 0;
        this.element = null;
        this.qtyInput = null;
        this.subtotalSpan = null;
        this.subtotalRow = null;
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
                    <input type="number" class="qty-input" value="0" readonly>
                    <button class="btn-qty dec-qty">-</button>
                </div>
            </div>
        `;
        this.element = cardDiv;
        this.qtyInput = cardDiv.querySelector('.qty-input');
        this.subtotalSpan = cardDiv.querySelector('.subtotal-val');
        this.subtotalRow = cardDiv.querySelector('.item-subtotal');

        // ربط الأحداث
        cardDiv.querySelector('.inc-qty').addEventListener('click', () => this.updateQuantity(1));
        cardDiv.querySelector('.dec-qty').addEventListener('click', () => this.updateQuantity(-1));

        // تحميل الصورة
        const imgEl = cardDiv.querySelector(`#${uniqueId}`);
        LazyImage.render(imgEl, this.product.imageUrl, this.storage);

        return cardDiv;
    }

    updateQuantity(delta) {
        const newVal = this.quantity + delta;
        const stock = parseInt(this.element.getAttribute('data-stock')) || 999;
        if (newVal >= 0 && newVal <= stock) {
            this.quantity = newVal;
            this.qtyInput.value = this.quantity;
            if (this.quantity > 0) {
                const subtotal = this.quantity * this.product.price;
                this.subtotalSpan.innerText = subtotal.toLocaleString();
                this.subtotalRow.style.display = 'block';
            } else {
                this.subtotalRow.style.display = 'none';
            }
            if (this.onUpdateTotal) this.onUpdateTotal();
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

// ==================== مكون قائمة المنتجات ====================
class ProductsGrid {
    constructor(containerId, storage, onTotalUpdate) {
        this.container = document.getElementById(containerId);
        this.storage = storage;
        this.onTotalUpdate = onTotalUpdate;
        this.cards = []; // { category, productCard, sectionElement }
        this.currentView = 'hero'; // hero / list
    }

    renderCategory(category, products) {
        const sectionId = `section-${category}`;
        const sectionHtml = `<div class="category-section" id="${sectionId}"><div class="category-header">${category}</div></div>`;
        this.container.insertAdjacentHTML('beforeend', sectionHtml);
        const sectionEl = document.getElementById(sectionId);

        products.forEach(product => {
            const card = new ProductCard(product, this.storage, sectionEl, () => this.onTotalUpdate());
            const cardElement = card.render();
            sectionEl.appendChild(cardElement);
            this.cards.push({ category, card, sectionElement: sectionEl });
        });
    }

    clear() {
        this.container.innerHTML = '';
        this.cards = [];
    }

    setView(view) {
        this.currentView = view;
        this.container.classList.remove('hero-view', 'list-view');
        this.container.classList.add(view === 'hero' ? 'hero-view' : 'list-view');
    }

    filterBySearch(query) {
        const lowerQuery = query.toLowerCase();
        this.cards.forEach(({ card }) => {
            const name = card.getName().toLowerCase();
            const matches = name.includes(lowerQuery);
            card.element.style.display = matches ? (this.currentView === 'hero' ? 'block' : 'flex') : 'none';
        });
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

    scrollToCategory(category) {
        const section = document.getElementById(`section-${category}`);
        if (section) {
            window.scrollTo({ top: section.offsetTop - 120, behavior: 'smooth' });
        }
    }
}

// ==================== مكون الفوتر والسلة ====================
class CartFooter {
    constructor(footerId, totalSpanId, onSendWhatsApp) {
        this.footer = document.getElementById(footerId);
        this.totalSpan = document.getElementById(totalSpanId);
        this.onSendWhatsApp = onSendWhatsApp;
        this.init();
    }
    init() {
        const btn = this.footer.querySelector('#whatsappBtn');
        if (btn) btn.addEventListener('click', () => this.onSendWhatsApp());
    }
    updateTotal(total) {
        this.totalSpan.innerText = total.toLocaleString();
        const hasItems = total > 0;
        if (hasItems) this.footer.classList.add('show');
        else this.footer.classList.remove('show');
    }
}

// ==================== مكون الرأس (Theme, View, Search) ====================
class AppHeader {
    constructor(themeBtnId, viewBtnId, searchInputId, onThemeToggle, onViewToggle, onSearch) {
        this.themeBtn = document.getElementById(themeBtnId);
        this.viewBtn = document.getElementById(viewBtnId);
        this.searchInput = document.getElementById(searchInputId);
        this.onThemeToggle = onThemeToggle;
        this.onViewToggle = onViewToggle;
        this.onSearch = onSearch;
        this.init();
    }
    init() {
        this.themeBtn.addEventListener('click', () => this.onThemeToggle());
        this.viewBtn.addEventListener('click', () => this.onViewToggle());
        this.searchInput.addEventListener('input', (e) => this.onSearch(e.target.value));
    }
    setViewIcon(isList) {
        const icon = this.viewBtn.querySelector('i');
        if (isList) icon.className = 'fas fa-square';
        else icon.className = 'fas fa-list';
    }
}

// ==================== مكون تصنيفات (Chips) ====================
class CategoryChips {
    constructor(containerId, onSelectCategory) {
        this.container = document.getElementById(containerId);
        this.onSelectCategory = onSelectCategory;
        this.categories = ['all'];
        this.activeCategory = 'all';
    }
    addCategory(catName) {
        if (catName === 'all') return;
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
    resetToAll() {
        const allChip = this.container.querySelector('.chip[data-category="all"]');
        if (allChip) this.selectCategory('all', allChip);
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
        this.init();
    }

    async init() {
        await this.storage.init();
        // تهيئة المكونات
        this.productsGrid = new ProductsGrid('main-container', this.storage, () => this.updateTotal());
        this.cartFooter = new CartFooter('footer-cart', 'grand-total', () => this.sendWhatsApp());
        this.header = new AppHeader(
            'themeToggleBtn', 'viewToggleBtn', 'search-input',
            () => this.toggleTheme(),
            () => this.toggleView(),
            (query) => this.productsGrid.filterBySearch(query)
        );
        this.categoryChips = new CategoryChips('category-chips', (cat) => this.onCategorySelected(cat));

        // تحميل البيانات (من الكاش أولاً ثم من الشبكة)
        const cachedData = await this.storage.getApiCache();
        if (cachedData) {
            this.renderFullData(cachedData);
        }
        // جلب بيانات جديدة
        this.fetchFreshData();
    }

    async fetchFreshData() {
        try {
            const response = await fetch(API_URL);
            const data = await response.json();
            if (!this.fullData) {
                this.renderFullData(data);
            } else {
                // تحديث ذكي (اختياري) يمكنك تجاهله حالياً
            }
            await this.storage.saveApiCache(data);
        } catch (err) {
            console.error('خطأ في تحميل البيانات', err);
            if (!this.fullData) {
                document.getElementById('loader').innerHTML = "❌ فشل التحميل، تأكد من الاتصال بالإنترنت";
            }
        }
    }

    renderFullData(data) {
        this.fullData = data;
        this.productsGrid.clear();
        document.getElementById('loader').style.display = 'none';

        for (const category in data) {
            this.categoryChips.addCategory(category);
            this.productsGrid.renderCategory(category, data[category]);
        }
        this.updateTotal();
    }

    onCategorySelected(category) {
        if (category === 'all') {
            // إظهار جميع الأقسام بالتمرير للأعلى
            window.scrollTo({ top: 0, behavior: 'smooth' });
            // إظهار كل المنتجات (بدون فلتر إضافي)
            document.querySelectorAll('.category-section').forEach(section => section.style.display = 'block');
        } else {
            document.querySelectorAll('.category-section').forEach(section => section.style.display = 'none');
            const targetSection = document.getElementById(`section-${category}`);
            if (targetSection) targetSection.style.display = 'block';
            this.productsGrid.scrollToCategory(category);
        }
    }

    updateTotal() {
        const items = this.productsGrid.getAllCartItems();
        let total = 0;
        for (const item of items) {
            total += item.quantity * item.price;
        }
        this.cartFooter.updateTotal(total);
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
        message += `💰 *الإجمالي النهائي: ${totalSpan.innerText} ل.س*`;
        window.open(`https://wa.me/${TARGET_NUMBER}?text=${encodeURIComponent(message)}`);
    }

    toggleTheme() {
        const body = document.body;
        const isDark = body.getAttribute('data-theme') === 'dark';
        body.setAttribute('data-theme', isDark ? 'light' : 'dark');
        const icon = document.getElementById('theme-icon');
        icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
    }

    toggleView() {
        const isListView = this.productsGrid.currentView === 'list';
        this.productsGrid.setView(isListView ? 'hero' : 'list');
        this.header.setViewIcon(!isListView);
        // إعادة تطبيق الفلتر الحالي
        const searchVal = document.getElementById('search-input').value;
        this.productsGrid.filterBySearch(searchVal);
    }
}

// بدء التطبيق
new App();
