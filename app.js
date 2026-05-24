// ==================== ثوابت عامة ====================
const TARGET_NUMBER = "963945083365";
const API_URL = "https://script.google.com/macros/s/AKfycbz8CnO-_aiuboqy7R4kXFA-FQ4uNaLAVc5-_aC-z6txmg2W33wG7c4Igj_NJeKGF-fk/exec";

// ==================== إدارة الصوت والموسيقى (مع رسالة توضيحية) ====================
class SoundManager {
    constructor() {
        this.soundEnabled = false;
        this.musicEnabled = false;
        this.musicAudio = null;
        this.userInteracted = false;
        this.init();
    }
    init() {
        this.clickSound = () => this.playBeep(440, 0.1);
        this.levelUpSound = () => this.playBeep(880, 0.3, 600);
        this.orderSound = () => this.playBeep(660, 0.4, 800);
        const savedSound = localStorage.getItem('soundEnabled');
        if (savedSound === 'true') this.soundEnabled = true;
        const savedMusic = localStorage.getItem('musicEnabled');
        if (savedMusic === 'true') this.musicEnabled = true;
        this.initMusic();
        this.updateIcons();
        this.setupUserInteraction();
    }
    setupUserInteraction() {
        const showNotice = () => {
            const notice = document.getElementById('soundNotice');
            if (notice && !this.userInteracted && (this.soundEnabled || this.musicEnabled)) {
                notice.style.display = 'block';
                setTimeout(() => { if(notice) notice.style.display = 'none'; }, 5000);
            }
        };
        const handleInteraction = () => {
            if (!this.userInteracted) {
                this.userInteracted = true;
                const notice = document.getElementById('soundNotice');
                if (notice) notice.style.display = 'none';
                if (this.musicEnabled && this.musicAudio) {
                    this.musicAudio.play().catch(e => console.log("Music autoplay blocked"));
                }
            }
        };
        document.body.addEventListener('click', handleInteraction);
        document.body.addEventListener('touchstart', handleInteraction);
        setTimeout(showNotice, 1000);
    }
    initMusic() {
        try {
            this.musicAudio = new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
            this.musicAudio.loop = true;
            this.musicAudio.volume = 0.3;
        } catch(e) { console.warn("Music not available"); }
    }
    playBeep(frequency, duration, delay = 0) {
        if (!this.soundEnabled) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = frequency;
            gain.gain.value = 0.1;
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + duration);
            osc.stop(ctx.currentTime + duration);
            setTimeout(() => ctx.close(), duration * 1000 + 500);
        } catch(e) {}
    }
    playClick() { if(this.clickSound) this.clickSound(); }
    playLevelUp() { if(this.levelUpSound) this.levelUpSound(); }
    playOrder() { if(this.orderSound) this.orderSound(); }
    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        localStorage.setItem('soundEnabled', this.soundEnabled);
        this.updateIcons();
        return this.soundEnabled;
    }
    toggleMusic() {
        this.musicEnabled = !this.musicEnabled;
        localStorage.setItem('musicEnabled', this.musicEnabled);
        if (this.musicEnabled && this.musicAudio && this.userInteracted) {
            this.musicAudio.play().catch(e => console.log("Music autoplay blocked"));
        } else if (this.musicAudio) {
            this.musicAudio.pause();
        }
        this.updateIcons();
        return this.musicEnabled;
    }
    updateIcons() {
        const soundIcon = document.getElementById('soundIcon');
        if (soundIcon) {
            soundIcon.className = this.soundEnabled ? 'fas fa-volume-up active-sound' : 'fas fa-volume-mute';
            soundIcon.style.color = this.soundEnabled ? '#2ecc71' : 'var(--text-muted)';
        }
        const musicIcon = document.getElementById('musicIcon');
        if (musicIcon) {
            musicIcon.className = this.musicEnabled ? 'fas fa-music active-music' : 'fas fa-music-slash';
            musicIcon.style.color = this.musicEnabled ? '#2ecc71' : 'var(--text-muted)';
        }
    }
}

// ==================== خدمة التخزين باستخدام Dexie.js ====================
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

// ==================== تحميل الصور مع شريط تقدم ====================
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

// ==================== بطاقة المنتج (مع دعم الحفظ) ====================
class ProductCard {
    constructor(product, storage, onUpdateTotal, soundManager, initialQty = 0, onImageLoad) {
        this.product = product;
        this.storage = storage;
        this.onUpdateTotal = onUpdateTotal;
        this.sound = soundManager;
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
        incBtn.addEventListener('click', () => { this.sound.playClick(); this.updateQuantity(1); });
        decBtn.addEventListener('click', () => { this.sound.playClick(); this.updateQuantity(-1); });
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

// ==================== شبكة المنتجات (مع شريط تقدم الصور) ====================
class ProductsGrid {
    constructor(containerId, storage, onTotalUpdate, soundManager, savedCart) {
        this.container = document.getElementById(containerId);
        this.storage = storage;
        this.onTotalUpdate = onTotalUpdate;
        this.sound = soundManager;
        this.cards = [];
        this.currentView = 'hero';
        this.savedCart = savedCart;
        this.imagesLoaded = 0;
        this.totalImages = 0;
        this.onImageProgress = null;
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
    renderCategory(category, products) {
        const sectionId = `section-${category}`;
        const sectionHtml = `<div class="category-section" id="${sectionId}"><div class="category-header">${category}</div></div>`;
        this.container.insertAdjacentHTML('beforeend', sectionHtml);
        const sectionEl = document.getElementById(sectionId);
        products.forEach(product => {
            const savedQty = this.savedCart[product.name] || 0;
            const card = new ProductCard(product, this.storage, (name, first) => this.onTotalUpdate(name, first), this.sound, savedQty, () => this.imageLoaded());
            const cardElement = card.render();
            sectionEl.appendChild(cardElement);
            this.cards.push({ category, card, sectionElement: sectionEl });
            this.totalImages++;
        });
    }
    clear() {
        if (this.container) this.container.innerHTML = '';
        this.cards = [];
        this.imagesLoaded = 0;
        this.totalImages = 0;
    }
    setView(view) {
        this.currentView = view;
        if (!this.container) return;
        this.container.classList.remove('hero-view', 'list-view');
        this.container.classList.add(view === 'hero' ? 'hero-view' : 'list-view');
    }
    filterBySearch(query) {
        const lowerQuery = query.toLowerCase();
        let visibleCount = 0;
        this.cards.forEach(({ card }) => {
            const name = card.getName().toLowerCase();
            const matches = name.includes(lowerQuery);
            card.element.style.display = matches ? (this.currentView === 'hero' ? 'block' : 'flex') : 'none';
            if (matches) visibleCount++;
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

// ==================== رأس التطبيق (مع دعم زر مسح البحث) ====================
class AppHeader {
    constructor(themeBtnId, searchInputId, soundBtnId, musicBtnId, profileBtnId, settingsBtnId, cartBtnId, clearSearchBtnId, onThemeToggle, onSearch, onSoundToggle, onMusicToggle, onProfileOpen, onSettingsOpen, onCartClick) {
        this.themeBtn = document.getElementById(themeBtnId);
        this.searchInput = document.getElementById(searchInputId);
        this.clearSearchBtn = document.getElementById(clearSearchBtnId);
        this.soundBtn = document.getElementById(soundBtnId);
        this.musicBtn = document.getElementById(musicBtnId);
        this.profileBtn = document.getElementById(profileBtnId);
        this.settingsBtn = document.getElementById(settingsBtnId);
        this.cartBtn = document.getElementById(cartBtnId);
        this.onThemeToggle = onThemeToggle;
        this.onSearch = onSearch;
        this.onSoundToggle = onSoundToggle;
        this.onMusicToggle = onMusicToggle;
        this.onProfileOpen = onProfileOpen;
        this.onSettingsOpen = onSettingsOpen;
        this.onCartClick = onCartClick;
        this.init();
    }
    init() {
        if (this.themeBtn) this.themeBtn.addEventListener('click', () => this.onThemeToggle());
        if (this.searchInput) this.searchInput.addEventListener('input', (e) => this.onSearch(e.target.value));
        if (this.clearSearchBtn) this.clearSearchBtn.addEventListener('click', () => { this.searchInput.value = ''; this.onSearch(''); this.clearSearchBtn.style.display = 'none'; });
        if (this.searchInput) this.searchInput.addEventListener('input', () => { if(this.clearSearchBtn) this.clearSearchBtn.style.display = this.searchInput.value ? 'flex' : 'none'; });
        if (this.soundBtn) this.soundBtn.addEventListener('click', () => this.onSoundToggle());
        if (this.musicBtn) this.musicBtn.addEventListener('click', () => this.onMusicToggle());
        if (this.profileBtn) this.profileBtn.addEventListener('click', () => this.onProfileOpen());
        if (this.settingsBtn) this.settingsBtn.addEventListener('click', () => this.onSettingsOpen());
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

// ==================== نظام اللعب ====================
class Gamification {
    constructor(soundManager) {
        this.sound = soundManager;
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
    addXP(amount, productName = '', isFirstAdd = false) {
        this.xp += amount;
        this.showToast(`+${amount} XP`, productName);
        if (isFirstAdd) this.showFirstAddEffect();
        this.checkLevelUp();
        this.checkBadges();
        this.updateUI();
        this.saveToStorage();
    }
    showFirstAddEffect() {
        const toast = document.createElement('div');
        toast.className = 'toast-points';
        toast.innerHTML = '🎉 أول إضافة! 🎉';
        toast.style.background = '#f39c12';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1000);
        const bar = document.querySelector('.gamification-bar');
        if (bar) {
            bar.classList.add('first-add-effect');
            setTimeout(() => bar.classList.remove('first-add-effect'), 500);
        }
    }
    checkLevelUp() {
        let newLevel = 1;
        while (this.xp >= newLevel * 100) newLevel++;
        if (newLevel > this.level) {
            this.level = newLevel;
            this.sound.playLevelUp();
            this.showToast(`🎉 رفعت لمستوى ${this.level} ! 🎉`, '', 2000);
            this.showLevelUpEffect();
        }
    }
    showLevelUpEffect() {
        const levelSpan = document.getElementById('levelNum');
        if (levelSpan) {
            levelSpan.classList.add('level-up-animation');
            setTimeout(() => levelSpan.classList.remove('level-up-animation'), 600);
        }
        const trophy = document.querySelector('.level-info i');
        if (trophy) {
            trophy.style.animation = 'none';
            setTimeout(() => trophy.style.animation = 'levelUpEffect 0.6s', 10);
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
            progressFill.style.width = `${(xpInCurrentLevel / 100) * 100}%`;
        }
        this.updateProfileModal();
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
    updateProfileModal() {
        const profileLevel = document.getElementById('profileLevel');
        const profileXP = document.getElementById('profileXP');
        const profileBar = document.getElementById('profileProgressBar');
        const badgesList = document.getElementById('profileBadgesList');
        if (profileLevel) profileLevel.innerText = this.level;
        if (profileXP) profileXP.innerText = this.xp;
        if (profileBar) profileBar.style.width = `${(this.xp % 100) / 100 * 100}%`;
        if (badgesList) {
            badgesList.innerHTML = '';
            if (this.badges.length === 0) {
                badgesList.innerHTML = 'لا توجد شارات بعد';
            } else {
                this.badges.forEach(b => {
                    const badgeDiv = document.createElement('div');
                    badgeDiv.className = 'badge-item';
                    if (b === 'starter') badgeDiv.innerHTML = '<i class="fas fa-seedling"></i> مبتدئ';
                    else if (b === 'warrior') badgeDiv.innerHTML = '<i class="fas fa-shield-alt"></i> محارب';
                    else if (b === 'legend') badgeDiv.innerHTML = '<i class="fas fa-crown"></i> أسطوري';
                    badgesList.appendChild(badgeDiv);
                });
            }
        }
    }
}

// ==================== التطبيق الرئيسي ====================
class App {
    constructor() {
        this.soundManager = new SoundManager();
        this.storage = new StorageService();
        this.game = null;
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
        this.game = new Gamification(this.soundManager);
        this.productsGrid = new ProductsGrid('main-container', this.storage, (name, first) => this.updateTotal(name, first), this.soundManager, this.savedCart);
        this.cartFooter = new CartFooter('footer-cart', 'grand-total', () => this.sendWhatsApp());
        this.header = new AppHeader(
            'themeToggleBtn', 'search-input', 'soundToggleBtn', 'musicToggleBtn', 'profileBtn', 'settingsBtn', 'cartIconBtn', 'clearSearchBtn',
            () => this.toggleTheme(),
            (query) => this.productsGrid.filterBySearch(query),
            () => this.toggleSound(),
            () => this.toggleMusic(),
            () => this.openProfileModal(),
            () => this.openSettingsModal(),
            () => this.scrollToCart()
        );
        this.categoryChips = new CategoryChips('category-chips', (cat) => this.onCategorySelected(cat));
        this.setupModals();
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
    setupModals() {
        const profileModal = document.getElementById('profileModal');
        const settingsModal = document.getElementById('settingsModal');
        const closeProfile = profileModal?.querySelector('.modal-close');
        const closeSettings = settingsModal?.querySelector('.settings-close');
        if (closeProfile) closeProfile.onclick = () => profileModal.style.display = 'none';
        if (closeSettings) closeSettings.onclick = () => settingsModal.style.display = 'none';
        window.onclick = (event) => {
            if (event.target === profileModal) profileModal.style.display = 'none';
            if (event.target === settingsModal) settingsModal.style.display = 'none';
        };
        const settingsSoundBtn = document.getElementById('settingsSoundBtn');
        const settingsMusicBtn = document.getElementById('settingsMusicBtn');
        const settingsViewBtn = document.getElementById('settingsViewBtn');
        const clearCacheBtn = document.getElementById('clearCacheBtn');
        if (settingsSoundBtn) {
            settingsSoundBtn.innerText = this.soundManager.soundEnabled ? 'إيقاف' : 'تفعيل';
            settingsSoundBtn.onclick = () => {
                this.toggleSound();
                settingsSoundBtn.innerText = this.soundManager.soundEnabled ? 'إيقاف' : 'تفعيل';
            };
        }
        if (settingsMusicBtn) {
            settingsMusicBtn.innerText = this.soundManager.musicEnabled ? 'إيقاف' : 'تفعيل';
            settingsMusicBtn.onclick = () => {
                this.toggleMusic();
                settingsMusicBtn.innerText = this.soundManager.musicEnabled ? 'إيقاف' : 'تفعيل';
            };
        }
        if (settingsViewBtn) {
            settingsViewBtn.innerText = this.productsGrid?.currentView === 'hero' ? 'وضع القائمة' : 'وضع البطاقات';
            settingsViewBtn.onclick = () => {
                this.toggleView();
                settingsViewBtn.innerText = this.productsGrid?.currentView === 'hero' ? 'وضع القائمة' : 'وضع البطاقات';
            };
        }
        if (clearCacheBtn) {
            clearCacheBtn.onclick = async () => {
                if (confirm('هل أنت متأكد من مسح جميع الصور المخزنة مؤقتاً؟ سيتم إعادة تحميلها عند الحاجة.')) {
                    await this.storage.clearAllCache();
                    alert('تم مسح ذاكرة التخزين المؤقت بنجاح');
                    location.reload();
                }
            };
        }
    }
    openProfileModal() {
        this.game.updateProfileModal();
        const modal = document.getElementById('profileModal');
        if (modal) modal.style.display = 'block';
    }
    openSettingsModal() {
        const modal = document.getElementById('settingsModal');
        if (modal) modal.style.display = 'block';
        const settingsSoundBtn = document.getElementById('settingsSoundBtn');
        const settingsMusicBtn = document.getElementById('settingsMusicBtn');
        const settingsViewBtn = document.getElementById('settingsViewBtn');
        if (settingsSoundBtn) settingsSoundBtn.innerText = this.soundManager.soundEnabled ? 'إيقاف' : 'تفعيل';
        if (settingsMusicBtn) settingsMusicBtn.innerText = this.soundManager.musicEnabled ? 'إيقاف' : 'تفعيل';
        if (settingsViewBtn) settingsViewBtn.innerText = this.productsGrid?.currentView === 'hero' ? 'وضع القائمة' : 'وضع البطاقات';
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
        // نقل حاوية المنتجات الفعلية إلى داخل productsContent
        const mainContainer = document.getElementById('main-container');
        if (mainContainer && productsContent && !productsContent.contains(mainContainer)) {
            // بالفعل main-container هو نفسه الحاوية، لكننا أضفنا productsContent كغلاف، نحتاج لتجنب الازدواجية
            // الحل: نجعل main-container هو نفسه productsContent أو نستخدم productsContent كحاوية فعلية
            // لكن ProductsGrid يستخدم main-container. الأسهل: تعديل ProductsGrid لاستخدام productsContent
            // بدلاً من ذلك، سنقوم بنقل المحتوى من main-container إلى productsContent
            if (mainContainer.id === 'main-container') {
                const temp = document.createElement('div');
                while(mainContainer.firstChild) temp.appendChild(mainContainer.firstChild);
                productsContent.appendChild(temp);
                mainContainer.style.display = 'none';
            }
        }
        for (const category in data) {
            // التحقق من صحة كل منتج (صورة افتراضية، stock افتراضي)
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
        if (this.lastTotalQty !== totalQty && totalQty > this.lastTotalQty) {
            const gained = (totalQty - this.lastTotalQty) * 5;
            this.game.addXP(gained, productName || 'منتج', isFirst);
        }
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
        this.soundManager.playOrder();
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
        const dayElements = document.querySelector('.day-elements');
        const nightElements = document.querySelector('.night-elements');
        if (dayElements && nightElements) {
            if (isDark) { dayElements.style.display = 'none'; nightElements.style.display = 'block'; }
            else { dayElements.style.display = 'block'; nightElements.style.display = 'none'; }
        }
    }
    toggleView() {
        const newView = this.productsGrid.currentView === 'hero' ? 'list' : 'hero';
        this.productsGrid.setView(newView);
        const settingsViewBtn = document.getElementById('settingsViewBtn');
        if (settingsViewBtn) settingsViewBtn.innerText = newView === 'hero' ? 'وضع القائمة' : 'وضع البطاقات';
        const searchVal = document.getElementById('search-input');
        if (searchVal) this.productsGrid.filterBySearch(searchVal.value);
    }
    toggleSound() {
        this.soundManager.toggleSound();
        const settingsSoundBtn = document.getElementById('settingsSoundBtn');
        if (settingsSoundBtn) settingsSoundBtn.innerText = this.soundManager.soundEnabled ? 'إيقاف' : 'تفعيل';
    }
    toggleMusic() {
        this.soundManager.toggleMusic();
        const settingsMusicBtn = document.getElementById('settingsMusicBtn');
        if (settingsMusicBtn) settingsMusicBtn.innerText = this.soundManager.musicEnabled ? 'إيقاف' : 'تفعيل';
    }
}

// بدء التطبيق
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => new App());
else new App();
