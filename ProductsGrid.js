import { CONFIG, escapeHtml } from './config.js';
import { ProductCard } from './ProductCard.js';

export class ProductsGrid {
    constructor(containerId, storage, cartManager, onGlobalQuantityChange) {
        this.container = document.getElementById(containerId);
        this.storage = storage;
        this.cartManager = cartManager;
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
        this.visibleSectionsCount = CONFIG.SECTIONS_PER_LOAD || 6;
        this.sectionsPerLoad = CONFIG.SECTIONS_PER_LOAD || 6;
        this.sectionsLoadMoreBtn = null;
        this.cards = [];
        this.imagesLoaded = 0;
        this.totalImages = 0;
        this.onImageProgress = null;
        this.skeleton = document.getElementById('skeletonLoader');
        this.productsGridDiv = document.getElementById('productsGrid');
        this.isRendering = false;
        this.renderQueue = [];
        this.batchSize = 3;
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
        for (const [mainCat, subCatsObj] of Object.entries(data)) {
            this.mainCategories.add(mainCat);
            const subSet = new Set();
            for (const [subCat, products] of Object.entries(subCatsObj)) {
                subSet.add(subCat);
                const validProducts = products.map(p => ({
                    ...p,
                    name: p.name || p.title || 'منتج بدون اسم',
                    price: parseFloat(p.price) || 0,
                    stock: p.stock !== undefined ? p.stock : 999,
                    imageUrl: (p.imageUrl && p.imageUrl.startsWith('http')) ? p.imageUrl : null
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
        
        if (this.searchQuery.trim()) {
            const lowerQuery = this.searchQuery.toLowerCase();
            this.allSectionsList = this.allSectionsList.filter(({ mainCat, subCat }) => {
                const key = `${mainCat}|${subCat}`;
                const products = this.productsMap.get(key) || [];
                return products.some(p => p.name.toLowerCase().includes(lowerQuery));
            });
        }
    }

    renderVisibleSections() {
        if (!this.productsGridDiv) return;
        if (this.isRendering) return;
        this.isRendering = true;
        this.productsGridDiv.innerHTML = '';
        this.cards = [];
        this.totalImages = 0;
        this.imagesLoaded = 0;
        this.renderQueue = [];

        // عند البحث، نعرض جميع الأقسام ولكن مع pagination داخلي
        let sectionsToShow = this.allSectionsList;
        if (!this.searchQuery.trim()) {
            sectionsToShow = this.allSectionsList.slice(0, this.visibleSectionsCount);
        }
        
        for (const { mainCat, subCat } of sectionsToShow) {
            this.renderQueue.push({ mainCat, subCat });
        }
        this.processRenderQueue();

        const hasMoreSections = !this.searchQuery.trim() && 
                                this.allSectionsList.length > this.visibleSectionsCount;
        if (hasMoreSections) {
            if (!this.sectionsLoadMoreBtn) {
                this.sectionsLoadMoreBtn = document.createElement('button');
                this.sectionsLoadMoreBtn.className = 'load-more-sections-btn';
                this.sectionsLoadMoreBtn.innerHTML = '<i class="fas fa-layer-group"></i> تحميل المزيد من التصنيفات';
                this.sectionsLoadMoreBtn.addEventListener('click', () => this.loadMoreSections());
                this.productsGridDiv.appendChild(this.sectionsLoadMoreBtn);
            } else {
                this.sectionsLoadMoreBtn.style.display = 'flex';
            }
        } else if (this.sectionsLoadMoreBtn) {
            this.sectionsLoadMoreBtn.style.display = 'none';
        }

        if (this.skeleton) this.skeleton.style.display = 'none';
        if (this.productsGridDiv) this.productsGridDiv.style.display = 'grid';
        this.isRendering = false;
    }

    processRenderQueue() {
        if (this.renderQueue.length === 0) return;
        const batch = this.renderQueue.splice(0, this.batchSize);
        for (const { mainCat, subCat } of batch) {
            const key = `${mainCat}|${subCat}`;
            let products = this.productsMap.get(key) || [];
            if (this.searchQuery.trim()) {
                const lowerQuery = this.searchQuery.toLowerCase();
                products = products.filter(p => p.name.toLowerCase().includes(lowerQuery));
                if (products.length === 0) continue;
                this.renderSubCategoryFull(mainCat, subCat, products);
            } else {
                this.renderSubCategoryPaginated(mainCat, subCat, products);
            }
        }
        if (this.renderQueue.length > 0) {
            requestIdleCallback(() => this.processRenderQueue(), { timeout: 100 });
        }
    }

    renderSubCategoryFull(mainCat, subCat, products) {
        const sectionId = `sec-${mainCat}-${subCat}`.replace(/\s/g, '_');
        let sectionEl = document.getElementById(sectionId);
        if (!sectionEl) {
            const wrapper = document.createElement('div');
            wrapper.className = 'category-section';
            wrapper.id = sectionId;
            wrapper.innerHTML = `
                <div class="category-header">
                    <i class="fas fa-tag"></i>
                    <span>${escapeHtml(mainCat)}</span>
                    ${subCat ? `<span class="sub-cat-name"> / ${escapeHtml(subCat)}</span>` : ''}
                </div>
                <div class="products-grid-inner" id="inner-${mainCat}-${subCat}"></div>
            `;
            this.productsGridDiv.appendChild(wrapper);
            sectionEl = wrapper;
        }
        const innerDiv = sectionEl.querySelector(`#inner-${mainCat}-${subCat}`);
        if (!innerDiv) return;

        innerDiv.innerHTML = '';
        const fragment = document.createDocumentFragment();
        products.forEach(product => {
            const card = this.createCardInstance(product, mainCat, subCat);
            fragment.appendChild(card.element);
            this.cards.push({ mainCat, subCat, card, element: card.element });
            this.totalImages++;
        });
        innerDiv.appendChild(fragment);
    }

    renderSubCategoryPaginated(mainCat, subCat, products) {
        const sectionId = `sec-${mainCat}-${subCat}`.replace(/\s/g, '_');
        let sectionEl = document.getElementById(sectionId);
        if (!sectionEl) {
            const wrapper = document.createElement('div');
            wrapper.className = 'category-section';
            wrapper.id = sectionId;
            wrapper.innerHTML = `
                <div class="category-header">
                    <i class="fas fa-folder-open"></i>
                    <span>${escapeHtml(mainCat)}</span>
                    ${subCat ? `<span class="sub-cat-name"> / ${escapeHtml(subCat)}</span>` : ''}
                </div>
                <div class="products-grid-inner" id="inner-${mainCat}-${subCat}"></div>
            `;
            this.productsGridDiv.appendChild(wrapper);
            sectionEl = wrapper;
        }
        
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
            const card = this.createCardInstance(product, mainCat, subCat);
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
            loadBtn.innerHTML = '<i class="fas fa-chevron-down"></i> عرض المزيد';
            loadBtn.addEventListener('click', () => this.renderSubCategoryPaginated(mainCat, subCat, products));
            sectionEl.appendChild(loadBtn);
            this.loadMoreButtons.set(key, loadBtn);
        } else if (loadBtn) {
            loadBtn.style.display = hasMore ? 'flex' : 'none';
        }
    }

    createCardInstance(product, mainCat, subCat) {
        const initialQty = this.cartManager.getItemQuantity(product.name);
        const card = new ProductCard(
            product,
            this.storage,
            (name, newQty) => {
                this.cartManager.updateItem(name, newQty, product.price, product.imageUrl);
                if (this.onGlobalQuantityChange) {
                    this.onGlobalQuantityChange(this.cartManager.totalQuantity, this.cartManager.totalPrice);
                }
            },
            initialQty,
            this.cartManager
        );
        const cardElement = card.render();
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

    updateProductQuantity(productName, newQuantity) {
        const cardObj = this.cards.find(c => c.card.getProduct().name === productName);
        if (cardObj && cardObj.card.getQuantity() !== newQuantity) {
            cardObj.card.setQuantity(newQuantity);
            if (this.onGlobalQuantityChange) {
                this.onGlobalQuantityChange(this.cartManager.totalQuantity, this.cartManager.totalPrice);
            }
        }
    }

    // ⭐ إصلاح المشكلة الحرجة: إزالة التكرار في استدعاء cartManager.removeItem
    removeItemFromCart(productName) {
        // فقط نقوم بتحديث واجهة المنتج، الحذف الفعلي تم عبر الـ callback
        const cardObj = this.cards.find(c => c.card.getProduct().name === productName);
        if (cardObj && cardObj.card.getQuantity() > 0) {
            cardObj.card.setQuantity(0);
        }
        if (this.onGlobalQuantityChange) {
            this.onGlobalQuantityChange(this.cartManager.totalQuantity, this.cartManager.totalPrice);
        }
        return true;
    }

    loadMoreSections() {
        this.visibleSectionsCount += this.sectionsPerLoad;
        this.renderVisibleSections();
    }

    setActiveMainCategory(cat) {
        this.activeMain = cat;
        this.activeSub = null;
        this.visibleSectionsCount = this.sectionsPerLoad;
        this.buildAllSectionsList();
        this.resetAllPages();
        this.renderVisibleSections();
    }

    setActiveSubCategory(sub) {
        this.activeSub = (sub === 'all') ? null : sub;
        this.visibleSectionsCount = this.sectionsPerLoad;
        this.buildAllSectionsList();
        this.resetAllPages();
        this.renderVisibleSections();
    }

    filterBySearch(query) {
        this.searchQuery = query;
        this.visibleSectionsCount = this.sectionsPerLoad;
        this.buildAllSectionsList();
        this.resetAllPages();
        this.renderVisibleSections();
        return this.cards.length;
    }

    resetAllPages() {
        for (let key of this.currentPageMap.keys()) {
            this.currentPageMap.set(key, 0);
        }
        this.loadMoreButtons.forEach(btn => btn && btn.remove());
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
        return this.cartManager.getCartItems();
    }

    getTotalCartQuantity() {
        return this.cartManager.totalQuantity;
    }
}
