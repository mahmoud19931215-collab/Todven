import { CONFIG, escapeHtml } from './config.js';
import { ProductCard } from './ProductCard.js';

export class ProductsGrid {
    constructor(containerId, storage, onGlobalQuantityChange) {
        this.container = document.getElementById(containerId);
        this.storage = storage;
        this.onGlobalQuantityChange = onGlobalQuantityChange;
        this.rawData = null;
        this.mainCategories = new Set();
        this.subCategoriesMap = new Map();
        this.productsMap = new Map();
        this.activeMain = 'all';
        this.activeSub = null;
        this.searchQuery = '';
        this.currentPageMap = new Map();
        this.loadMoreButtons = new Map();
        this.allSectionsList = [];
        this.visibleSectionsCount = 6;
        this.sectionsPerLoad = 6;
        this.sectionsLoadMoreBtn = null;
        this.cards = [];
        this.imagesLoaded = 0;
        this.totalImages = 0;
        this.onImageProgress = null;
        this.skeleton = document.getElementById('skeletonLoader');
        this.productsGridDiv = document.getElementById('productsGrid');
        this.renderQueue = [];
        this.batchSize = 2;
        // تتبع مجموع السلة تزايدياً بدلاً من إعادة الحساب الكامل
        this._cartTotalQty = 0;
        this._cartTotalPrice = 0;
        // كاش السلة لتجنب قراءة localStorage مع كل كرت
        this._cartMapCache = null;
    }

    setImageProgressCallback(cb) {
        this.onImageProgress = cb;
    }

    imageLoaded() {
        this.imagesLoaded++;
        if (this.onImageProgress && this.totalImages > 0) {
            const percent = (this.imagesLoaded / this.totalImages) * 100;
            this.onImageProgress(percent);
        }
    }

    loadData(data) {
        this.rawData = data;
        this.clear();
        // بناء الخرائط بشكل أسرع باستخدام for...of
        for (const [mainCat, subCatsObj] of Object.entries(data)) {
            this.mainCategories.add(mainCat);
            const subSet = new Set();
            for (const [subCat, products] of Object.entries(subCatsObj)) {
                subSet.add(subCat);
                const validProducts = products.map(p => ({
                    ...p,
                    imageUrl: p.imageUrl?.startsWith('http') ? p.imageUrl : 'https://via.placeholder.com/300?text=No+Image',
                    stock: p.stock !== undefined ? p.stock : 999
                }));
                const key = `${mainCat}|${subCat}`;
                this.productsMap.set(key, validProducts);
                this.currentPageMap.set(key, 0);
            }
            this.subCategoriesMap.set(mainCat, subSet);
        }
        this.buildAllSectionsList();
        this.renderVisibleSections();
    }

    buildAllSectionsList() {
        this.allSectionsList = [];
        if (this.activeMain === 'all') {
            for (let mainCat of this.mainCategories) {
                const subCats = this.subCategoriesMap.get(mainCat) || new Set();
                for (let subCat of subCats) {
                    this.allSectionsList.push({ mainCat, subCat });
                }
            }
        } else {
            if (this.activeSub && this.activeSub !== 'all') {
                this.allSectionsList.push({ mainCat: this.activeMain, subCat: this.activeSub });
            } else {
                const subCats = this.subCategoriesMap.get(this.activeMain) || new Set();
                for (let subCat of subCats) {
                    this.allSectionsList.push({ mainCat: this.activeMain, subCat });
                }
            }
        }
    }

    renderVisibleSections() {
        if (!this.productsGridDiv) return;
        // إلغاء أي queue سابق بدلاً من حجب الاستدعاء — يمنع تراكم الرسم
        this.renderQueue = [];
        this.productsGridDiv.innerHTML = '';
        this.cards = [];
        this.totalImages = 0;
        this.imagesLoaded = 0;
        this._cartTotalQty = 0;
        this._cartTotalPrice = 0;
        // قراءة السلة مرة واحدة فقط لجميع الكروت
        this._cartMapCache = this.getCartMapFromStorage();

        const sectionsToShow = this.allSectionsList.slice(0, this.visibleSectionsCount);
        for (const { mainCat, subCat } of sectionsToShow) {
            this.renderQueue.push({ mainCat, subCat });
        }
        this.processRenderQueue();

        const hasMoreSections = this.allSectionsList.length > this.visibleSectionsCount;
        if (hasMoreSections && !this.searchQuery) {
            if (!this.sectionsLoadMoreBtn) {
                this.sectionsLoadMoreBtn = document.createElement('button');
                this.sectionsLoadMoreBtn.className = 'load-more-sections-btn';
                this.sectionsLoadMoreBtn.innerText = '📂 تحميل المزيد من التصنيفات';
                this.sectionsLoadMoreBtn.addEventListener('click', () => this.loadMoreSections());
                this.productsGridDiv.appendChild(this.sectionsLoadMoreBtn);
            } else {
                this.sectionsLoadMoreBtn.style.display = 'block';
            }
        } else if (this.sectionsLoadMoreBtn) {
            this.sectionsLoadMoreBtn.style.display = 'none';
        }

        if (this.searchQuery) {
            if (this.sectionsLoadMoreBtn) this.sectionsLoadMoreBtn.style.display = 'none';
            this.loadMoreButtons.forEach(btn => btn.style.display = 'none');
        }

        if (this.skeleton) this.skeleton.style.display = 'none';
        if (this.productsGridDiv) this.productsGridDiv.style.display = 'grid';
    }

    processRenderQueue() {
        if (this.renderQueue.length === 0) return;
        // رسم عدد محدود من الأقسام في كل دورة لتجنب تجميد الواجهة
        const batch = this.renderQueue.splice(0, this.batchSize);
        for (const { mainCat, subCat } of batch) {
            const key = `${mainCat}|${subCat}`;
            let products = this.productsMap.get(key) || [];
            if (this.searchQuery) {
                const lowerQuery = this.searchQuery.toLowerCase();
                products = products.filter(p => p.name.toLowerCase().includes(lowerQuery));
                if (products.length === 0) continue;
                this.renderSubCategoryFull(mainCat, subCat, products);
            } else {
                this.renderSubCategoryPaginated(mainCat, subCat, products);
            }
        }
        // استخدام requestIdleCallback أو setTimeout لتفادي حظر الواجهة
        if (this.renderQueue.length > 0) {
            requestIdleCallback ? requestIdleCallback(() => this.processRenderQueue()) : setTimeout(() => this.processRenderQueue(), 10);
        }
    }

    loadMoreSections() {
        this.visibleSectionsCount += this.sectionsPerLoad;
        this.renderVisibleSections();
    }

    // دالة مشتركة لإنشاء عنصر القسم — تُستخدم في Full و Paginated
    _createSectionElement(mainCat, subCat) {
        const sectionId = `sec-${mainCat}-${subCat}`;
        const existing = document.getElementById(sectionId);
        if (existing) return existing;
        const wrapper = document.createElement('div');
        wrapper.className = 'category-section';
        wrapper.id = sectionId;
        const header = document.createElement('div');
        header.className = 'category-header';
        header.setAttribute('data-main', mainCat);
        header.setAttribute('data-sub', subCat);
        header.textContent = mainCat;
        const subSpan = document.createElement('span');
        subSpan.style.cssText = 'font-size:14px; color:var(--primary);';
        subSpan.textContent = ` / ${subCat}`;
        header.appendChild(subSpan);
        const inner = document.createElement('div');
        inner.className = 'products-grid-inner';
        inner.id = `inner-${mainCat}-${subCat}`;
        wrapper.appendChild(header);
        wrapper.appendChild(inner);
        this.productsGridDiv.appendChild(wrapper);
        return wrapper;
    }

    renderSubCategoryFull(mainCat, subCat, products) {
        const sectionEl = this._createSectionElement(mainCat, subCat);
        const innerDiv = sectionEl.querySelector(`#inner-${mainCat}-${subCat}`);
        if (!innerDiv) return;

        innerDiv.innerHTML = '';
        const fragment = document.createDocumentFragment();
        products.forEach(product => {
            const card = this.createCardInstance(product);
            fragment.appendChild(card.element);
            this.cards.push({ mainCat, subCat, card, element: card.element });
            this.totalImages++;
        });
        innerDiv.appendChild(fragment);

        const key = `${mainCat}|${subCat}`;
        const btn = this.loadMoreButtons.get(key);
        if (btn) btn.style.display = 'none';
    }

    renderSubCategoryPaginated(mainCat, subCat, products) {
        const sectionEl = this._createSectionElement(mainCat, subCat);
        const key = `${mainCat}|${subCat}`;
        const currentPage = this.currentPageMap.get(key) || 0;
        const start = currentPage * CONFIG.ITEMS_PER_PAGE;
        const end = start + CONFIG.ITEMS_PER_PAGE;
        const pageProducts = products.slice(start, end);

        const innerDiv = sectionEl.querySelector(`#inner-${mainCat}-${subCat}`);
        if (!innerDiv) return;

        if (currentPage === 0) innerDiv.innerHTML = '';

        const fragment = document.createDocumentFragment();
        pageProducts.forEach(product => {
            const card = this.createCardInstance(product);
            fragment.appendChild(card.element);
            this.cards.push({ mainCat, subCat, card, element: card.element });
            this.totalImages++;
        });
        innerDiv.appendChild(fragment);

        this.currentPageMap.set(key, currentPage + 1);
        const hasMore = end < products.length;
        let loadBtn = this.loadMoreButtons.get(key);
        if (!loadBtn && hasMore) {
            loadBtn = document.createElement('button');
            loadBtn.className = 'load-more-btn';
            loadBtn.innerText = '➕ عرض المزيد';
            loadBtn.addEventListener('click', () => this.renderSubCategoryPaginated(mainCat, subCat, products));
            sectionEl.appendChild(loadBtn);
            this.loadMoreButtons.set(key, loadBtn);
        } else if (loadBtn) {
            loadBtn.style.display = hasMore ? 'block' : 'none';
        }
    }

    createCardInstance(product) {
        const initialQty = (this._cartMapCache || {})[product.name] || 0;
        const card = new ProductCard(product, this.storage, (name, newQty, delta) => this.onCardQuantityChange(name, newQty, delta), initialQty);
        const cardElement = card.render();
        // تتبع مجموع السلة مبدئياً
        if (initialQty > 0) {
            this._cartTotalQty += initialQty;
            this._cartTotalPrice += initialQty * product.price;
        }
        const img = cardElement.querySelector('.product-img');
        if (img) {
            img.loading = 'lazy';
            if (!img.complete) {
                img.addEventListener('load', () => this.imageLoaded());
                img.addEventListener('error', () => this.imageLoaded());
            } else {
                this.imageLoaded();
            }
        }
        return card;
    }

    onCardQuantityChange(productName, newQty, delta) {
        const cartMap = this.getCartMapFromStorage();
        if (newQty === 0) delete cartMap[productName];
        else cartMap[productName] = newQty;
        this.saveCartMap(cartMap);
        this._cartMapCache = cartMap;

        // تحديث المجموع تزايدياً بدلاً من إعادة حساب كل الكروت
        const product = this.cards.find(c => c.card.getProduct().name === productName)?.card.getProduct();
        if (product) {
            this._cartTotalQty += delta;
            this._cartTotalPrice += delta * product.price;
        }

        if (this.onGlobalQuantityChange) {
            this.onGlobalQuantityChange(this._cartTotalQty, this._cartTotalPrice);
        }
    }

    getCartMapFromStorage() {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.CART);
        return saved ? JSON.parse(saved) : {};
    }

    saveCartMap(map) {
        localStorage.setItem(CONFIG.STORAGE_KEYS.CART, JSON.stringify(map));
    }

    setActiveMainCategory(cat) {
        this.activeMain = cat;
        this.activeSub = null;
        this.visibleSectionsCount = 6;
        this.buildAllSectionsList();
        this.resetAllPages();
        this.renderVisibleSections();
    }

    setActiveSubCategory(sub) {
        this.activeSub = (sub === 'all') ? null : sub;
        this.visibleSectionsCount = 6;
        this.buildAllSectionsList();
        this.resetAllPages();
        this.renderVisibleSections();
    }

    filterBySearch(query) {
        this.searchQuery = query;
        if (query.trim() !== '') {
            this.buildAllSectionsList();
            this.visibleSectionsCount = this.allSectionsList.length;
        } else {
            this.visibleSectionsCount = 6;
            this.buildAllSectionsList();
        }
        this.resetAllPages();
        this.renderVisibleSections();
        // Count matching products synchronously before async render queue runs
        if (!query.trim()) return 0;
        const lowerQuery = query.toLowerCase();
        let count = 0;
        for (const { mainCat, subCat } of this.allSectionsList) {
            const key = `${mainCat}|${subCat}`;
            const products = this.productsMap.get(key) || [];
            count += products.filter(p => p.name.toLowerCase().includes(lowerQuery)).length;
        }
        return count;
    }

    resetAllPages() {
        for (let key of this.currentPageMap.keys()) {
            this.currentPageMap.set(key, 0);
        }
        this.loadMoreButtons.forEach(btn => btn.remove());
        this.loadMoreButtons.clear();
    }

    clear() {
        if (this.productsGridDiv) this.productsGridDiv.innerHTML = '';
        this.cards = [];
        this.mainCategories.clear();
        this.subCategoriesMap.clear();
        this.productsMap.clear();
        this.currentPageMap.clear();
        this.loadMoreButtons.clear();
        this.totalImages = 0;
        this.imagesLoaded = 0;
        this.allSectionsList = [];
        if (this.sectionsLoadMoreBtn) this.sectionsLoadMoreBtn.remove();
        this.sectionsLoadMoreBtn = null;
    }

    getMainCategories() {
        return Array.from(this.mainCategories);
    }

    getSubCategoriesFor(mainCat) {
        return Array.from(this.subCategoriesMap.get(mainCat) || []);
    }

    getAllCartItems() {
        const items = [];
        for (let cardObj of this.cards) {
            const qty = cardObj.card.getQuantity();
            if (qty > 0) {
                items.push({
                    name: cardObj.card.getProduct().name,
                    quantity: qty,
                    price: cardObj.card.getProduct().price
                });
            }
        }
        return items;
    }

    removeItemFromCart(productName) {
        const cardObj = this.cards.find(c => c.card.getProduct().name === productName);
        if (cardObj && cardObj.card.getQuantity() > 0) {
            cardObj.card.setQuantity(0);
            return true;
        }
        return false;
    }

    getTotalCartQuantity() {
        let total = 0;
        for (let cardObj of this.cards) total += cardObj.card.getQuantity();
        return total;
    }
}
