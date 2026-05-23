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
                if (cached && (Date.now() - cached.timestamp) < 3600000)
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

// ==================== مكون الصورة ====================
class LazyImage {
    static async render(imgElement, url, storage) {
        if (!url) return;
        const cached = await storage.getImage(url);
        if (cached) {
            imgElement.src = cached;
            return;
        }
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

// ==================== مكون المنتج ====================
class ProductCard {
    constructor(product, storage, onUpdateTotal) {
        this.product = product;
        this.storage = storage;
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
        cardDiv.querySelector('.inc-qty').addEventListener('click', () => this.updateQuantity(1));
        cardDiv.querySelector('.dec-qty').addEventListener('click', () => this.updateQuantity(-1));
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
            if (this.onUpdateTotal) {
                this.onUpdateTotal(delta > 0 ? this.product.name : null);
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

// ==================== مكون قائمة المنتجات ====================
class ProductsGrid {
    constructor(containerId, storage, onTotalUpdate) {
        this.container = document.getElementById(containerId);
        this.storage = storage;
        this.onTotalUpdate = onTotalUpdate;
        this.cards = [];
        this.currentView = 'hero';
    }
    renderCategory(category, products) {
        const sectionId = `section-${category}`;
        const sectionHtml = `<div class="category-section" id="${sectionId}"><div class="category-header">${category}</div></div>`;
        this.container.insertAdjacentHTML('beforeend', sectionHtml);
        const sectionEl = document.getElementById(sectionId);
        products.forEach(product => {
            const card = new ProductCard(product, this.storage, (productName) => this.onTotalUpdate(productName));
            const cardElement = card.render();
            sectionEl.appendChild(cardElement);
            this.cards.push({ category, card, sectionElement: sectionEl });
        });
    }
    clear() {
        if (this.container) this.container.innerHTML = '';
        this.cards = [];
    }
    setView(view) {
        this.currentView = view;
        if (!this.container) return;
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

// ==================== مكون الفوتر ====================
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

// ==================== مكون الرأس ====================
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
        if (this.themeBtn) this.themeBtn.addEventListener('click', () => this.onThemeToggle());
        if (this.viewBtn) this.viewBtn.addEventListener('click', () => this.onViewToggle());
        if (this.searchInput) this.searchInput.addEventListener('input', (e) => this.onSearch(e.target.value));
    }
    setViewIcon(isList) {
        if (!this.viewBtn) return;
        const icon = this.viewBtn.querySelector('i');
        if (icon) {
            if (isList) icon.className = 'fas fa-square';
            else icon.className = 'fas fa-list';
        }
    }
}

// ==================== مكون التصنيفات ====================
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
    resetToAll() {
        const allChip = this.container ? this.container.querySelector('.chip[data-category="all"]') : null;
        if (allChip) this.selectCategory('all', allChip);
    }
}

// ==================== نظام اللعب ====================
class Gamification {
    constructor() {
        this.xp = 0;
        this.level = 1;
        this.badges = [];
        this.loadFromStorage();
        this.updateUI();
    }
    loadFromStorage() {
        const saved = localStorage.getItem('gameStats');
        if (saved) {
            const data = JSON.parse(saved);
            this.xp = data.xp || 0;
            this.level = data.level || 1;
            this.badges = data.badges || [];
        }
    }
    saveToStorage() {
        localStorage.setItem('gameStats', JSON.stringify({
            xp: this.xp,
            level: this.level,
            badges: this.badges
        }));
    }
    addXP(amount, productName = '') {
        this.xp += amount;
        this.showToast(`+${amount} XP`, productName);
        this.checkLevelUp();
        this.checkBadges();
        this.updateUI();
        this.saveToStorage();
    }
    checkLevelUp() {
        let newLevel = 1;
        while (this.xp >= newLevel * 100) {
            newLevel++;
        }
        if (newLevel > this.level) {
            this.level = newLevel;
            this.showToast(`🎉 رفعت لمستوى ${this.level} ! 🎉`, '', 2000);
        }
    }
    checkBadges() {
        if (this.xp >= 5 && !this.badges.includes('starter')) {
            this.badges.push('starter');
            this.showToast('🏅 شارة: البداية القوية', '', 2000);
        }
        if (this.xp >= 50 && !this.badges.includes('warrior')) {
            this.badges.push('warrior');
            this.showToast('⚔️ شارة: المحارب', '', 2000);
        }
        if (this.xp >= 150 && !this.badges.includes('legend')) {
            this.badges.push('legend');
            this.showToast('👑 شارة: الأسطوري', '', 2000);
        }
        this.updateBadgesUI();
    }
    showToast(msg, productName = '', duration = 1200) {
        const toast = document.createElement('div');
        toast.className = 'toast-points';
        toast.innerHTML = productName ? `✨ ${productName}<br>${msg}` : msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    }
    updateUI() {
        const xpSpan = document.getElementById('xpPoints');
        const levelSpan = document.getElementById('levelNum');
        const progressFill = document.getElementById('xpProgress');
        if (xpSpan) xpSpan.innerText = this.xp;
        if (levelSpan) levelSpan.innerText = this.level;
        if (progressFill) {
            const xpInCurrentLevel = this.xp % 100;
            const percent = (xpInCurrentLevel / 100) * 100;
            progressFill.style.width = `${percent}%`;
        }
    }
    updateBadgesUI() {
        const badgeArea = document.getElementById('badgeArea');
        if (!badgeArea) return;
        badgeArea.innerHTML = '';
        if (this.badges.includes('starter')) {
            const badge = document.createElement('div');
            badge.className = 'badge';
            badge.innerHTML = '<i class="fas fa-seedling"></i> مبتدئ';
            badgeArea.appendChild(badge);
        }
        if (this.badges.includes('warrior')) {
            const badge = document.createElement('div');
            badge.className = 'badge';
            badge.innerHTML = '<i class="fas fa-shield-alt"></i> محارب';
            badgeArea.appendChild(badge);
        }
        if (this.badges.includes('legend')) {
            const badge = document.createElement('div');
            badge.className = 'badge';
            badge.innerHTML = '<i class="fas fa-crown"></i> أسطوري';
            badgeArea.appendChild(badge);
        }
    }
}

// ==================== التطبيق الرئيسي ====================
class App {
    constructor() {
        this.storage = new StorageService();
        this.game = new Gamification();
        this.productsGrid = null;
        this.cartFooter = null;
        this.header = null;
        this.categoryChips = null;
        this.fullData = null;
        this.lastTotalQty = 0;
        window.gameInstance = this.game;
        this.init();
    }
    async init() {
        await this.storage.init();
        this.productsGrid = new ProductsGrid('main-container', this.storage, (productName) => {
            this.updateTotal(productName);
        });
        this.cartFooter = new CartFooter('footer-cart', 'grand-total', () => this.sendWhatsApp());
        this.header = new AppHeader(
            'themeToggleBtn', 'viewToggleBtn', 'search-input',
            () => this.toggleTheme(),
            () => this.toggleView(),
            (query) => this.productsGrid.filterBySearch(query)
        );
        this.categoryChips = new CategoryChips('category-chips', (cat) => this.onCategorySelected(cat));

        const cachedData = await this.storage.getApiCache();
        if (cachedData) this.renderFullData(cachedData);
        this.fetchFreshData();
    }
    async fetchFreshData() {
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
                throw new Error("البيانات فارغة أو غير صالحة");
            }
            if (!this.fullData) this.renderFullData(data);
            await this.storage.saveApiCache(data);
        } catch (err) {
            console.error('❌ خطأ:', err);
            const loader = document.getElementById('loader');
            if (loader && !this.fullData) {
                loader.innerHTML = `❌ فشل التحميل: ${err.message}<br><small>تأكد من اتصال الإنترنت وأن API يعمل</small>`;
            } else if (!this.fullData) {
                const container = document.getElementById('main-container');
                if (container) container.innerHTML = `<div class="loader">❌ فشل التحميل: ${err.message}</div>`;
            }
        }
    }
    renderFullData(data) {
        this.fullData = data;
        this.productsGrid.clear();
        const loader = document.getElementById('loader');
        if (loader) loader.style.display = 'none';
        for (const category in data) {
            this.categoryChips.addCategory(category);
            this.productsGrid.renderCategory(category, data[category]);
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
    updateTotal(productName = null) {
        const items = this.productsGrid.getAllCartItems();
        let total = 0, totalQty = 0;
        for (const item of items) {
            total += item.quantity * item.price;
            totalQty += item.quantity;
        }
        this.cartFooter.updateTotal(total);
        if (this.lastTotalQty !== totalQty && totalQty > this.lastTotalQty) {
            const gained = (totalQty - this.lastTotalQty) * 5;
            this.game.addXP(gained, productName || 'منتج');
        }
        this.lastTotalQty = totalQty;
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
        this.game.addXP(20, 'إتمام الطلب');
    }
    toggleTheme() {
        const body = document.body;
        const isDark = body.getAttribute('data-theme') === 'dark';
        body.setAttribute('data-theme', isDark ? 'light' : 'dark');
        const icon = document.getElementById('theme-icon');
        if (icon) icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
        
        // تبديل الخلفية المتحركة
        const dayElements = document.querySelector('.day-elements');
        const nightElements = document.querySelector('.night-elements');
        if (dayElements && nightElements) {
            if (isDark) {
                dayElements.style.display = 'none';
                nightElements.style.display = 'block';
            } else {
                dayElements.style.display = 'block';
                nightElements.style.display = 'none';
            }
        }
    }
    toggleView() {
        const isListView = this.productsGrid.currentView === 'list';
        this.productsGrid.setView(isListView ? 'hero' : 'list');
        this.header.setViewIcon(!isListView);
        const searchVal = document.getElementById('search-input');
        if (searchVal) this.productsGrid.filterBySearch(searchVal.value);
    }
}

// بدء التطبيق
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new App());
} else {
    new App();
}
