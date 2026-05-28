// ==================== مكون شبكة المنتجات ====================
// يدعم: التصنيفات الرئيسية/الفرعية، البحث، الترقيم (Pagination)، تحميل الصور، وحفظ حالة السلة
import { CONFIG, escapeHtml } from "../config.js";
import { ProductCard } from "./ProductCard.js";

export class ProductsGrid {
    constructor(containerId, storage, onGlobalQuantityChange) {
        this.container = document.getElementById(containerId);
        this.storage = storage;
        this.onGlobalQuantityChange = onGlobalQuantityChange; // (totalItems, totalPrice)
        
        // هيكل البيانات
        this.rawData = null;               // { mainCat: { subCat: [products] } }
        this.mainCategories = new Set();    // جميع التصنيفات الرئيسية
        this.subCategoriesMap = new Map();   // mainCat -> Set of subCats
        this.productsMap = new Map();        // "mainCat|subCat" -> array of products
        
        // حالة الواجهة
        this.activeMain = 'all';
        this.activeSub = null;
        this.searchQuery = '';
        
        // الترقيم
        this.currentPageMap = new Map();     // "mainCat|subCat" -> current page index (0-based)
        this.loadMoreButtons = new Map();     // key -> button element
        
        // قائمة البطاقات النشطة
        this.cards = [];      // { mainCat, subCat, cardInstance, element }
        
        // تقدم تحميل الصور
        this.imagesLoaded = 0;
        this.totalImages = 0;
        this.onImageProgress = null;
        
        this.skeleton = document.getElementById('skeletonLoader');
        this.productsGridDiv = document.getElementById('productsGrid');
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

    // تحميل البيانات الخام
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

    // إعادة رسم كل الأقسام بناءً على الفلاتر النشطة
    renderVisibleSections() {
        if (!this.productsGridDiv) return;
        this.productsGridDiv.innerHTML = '';
        this.cards = [];
        this.totalImages = 0;
        this.imagesLoaded = 0;
        
        const sections = this.getSectionsToRender();
        
        for (const { mainCat, subCat } of sections) {
            const key = `${mainCat}|${subCat}`;
            let products = this.productsMap.get(key) || [];
            
            // تطبيق البحث
            if (this.searchQuery) {
                const lowerQuery = this.searchQuery.toLowerCase();
                products = products.filter(p => p.name.toLowerCase().includes(lowerQuery));
                if (products.length === 0) continue;
                // عرض بدون تجزئة (كل المنتجات دفعة واحدة)
                this.renderSubCategoryFull(mainCat, subCat, products);
            } else {
                this.renderSubCategoryPaginated(mainCat, subCat, products);
            }
        }
        
        // إخفاء أزرار "المزيد" في حالة البحث
        if (this.searchQuery) {
            this.loadMoreButtons.forEach(btn => btn.style.display = 'none');
        }
        
        // إظهار الشبكة وإخفاء السكلتون
        if (this.skeleton) this.skeleton.style.display = 'none';
        if (this.productsGridDiv) this.productsGridDiv.style.display = 'grid';
    }

    // تحديد الأقسام المطلوب عرضها (حسب التصنيف الرئيسي والفرعي)
    getSectionsToRender() {
        const sections = [];
        if (this.activeMain === 'all') {
            for (let mainCat of this.mainCategories) {
                const subCats = this.subCategoriesMap.get(mainCat) || new Set();
                for (let subCat of subCats) {
                    sections.push({ mainCat, subCat });
                }
            }
        } else {
            if (this.activeSub && this.activeSub !== 'all') {
                sections.push({ mainCat: this.activeMain, subCat: this.activeSub });
            } else {
                const subCats = this.subCategoriesMap.get(this.activeMain) || new Set();
                for (let subCat of subCats) {
                    sections.push({ mainCat: this.activeMain, subCat });
                }
            }
        }
        return sections;
    }

    // عرض قسم كامل (بدون ترقيم) - يُستخدم عند البحث
    renderSubCategoryFull(mainCat, subCat, products) {
        const sectionId = `sec-${mainCat}-${subCat}`;
        let sectionEl = document.getElementById(sectionId);
        if (!sectionEl) {
            const headerHtml = `<div class="category-header" data-main="${mainCat}" data-sub="${subCat}">
                                    ${mainCat} <span style="font-size:14px; color:var(--primary);"> / ${subCat}</span>
                                </div>
                                <div class="products-grid-inner" id="inner-${mainCat}-${subCat}"></div>`;
            const wrapper = document.createElement('div');
            wrapper.className = 'category-section';
            wrapper.id = sectionId;
            wrapper.innerHTML = headerHtml;
            this.productsGridDiv.appendChild(wrapper);
            sectionEl = wrapper;
        }
        const innerDiv = sectionEl.querySelector(`#inner-${mainCat}-${subCat}`);
        if (!innerDiv) return;
        
        innerDiv.innerHTML = '';
        products.forEach(product => {
            const card = this.createCardInstance(product, mainCat, subCat);
            innerDiv.appendChild(card.element);
            this.cards.push({ mainCat, subCat, card, element: card.element });
            this.totalImages++;
        });
        
        // إخفاء زر "المزيد" لهذا القسم
        const key = `${mainCat}|${subCat}`;
        const btn = this.loadMoreButtons.get(key);
        if (btn) btn.style.display = 'none';
    }

    // عرض قسم مع ترقيم وأزرار "عرض المزيد"
    renderSubCategoryPaginated(mainCat, subCat, products) {
        const sectionId = `sec-${mainCat}-${subCat}`;
        let sectionEl = document.getElementById(sectionId);
        if (!sectionEl) {
            const headerHtml = `<div class="category-header" data-main="${mainCat}" data-sub="${subCat}">
                                    ${mainCat} <span style="font-size:14px; color:var(--primary);"> / ${subCat}</span>
                                </div>
                                <div class="products-grid-inner" id="inner-${mainCat}-${subCat}"></div>`;
            const wrapper = document.createElement('div');
            wrapper.className = 'category-section';
            wrapper.id = sectionId;
            wrapper.innerHTML = headerHtml;
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
        
        if (currentPage === 0) innerDiv.innerHTML = ''; // أول مرة
        
        pageProducts.forEach(product => {
            const card = this.createCardInstance(product, mainCat, subCat);
            innerDiv.appendChild(card.element);
            this.cards.push({ mainCat, subCat, card, element: card.element });
            this.totalImages++;
        });
        
        // تحديث الصفحة الحالية
        this.currentPageMap.set(key, currentPage + 1);
        
        // إدارة زر "المزيد"
        const hasMore = end < products.length;
        let loadBtn = this.loadMoreButtons.get(key);
        if (!loadBtn && hasMore) {
            loadBtn = document.createElement('button');
            loadBtn.className = 'load-more-btn';
            loadBtn.innerText = '➕ عرض المزيد';
            loadBtn.addEventListener('click', () => {
                this.renderSubCategoryPaginated(mainCat, subCat, products);
            });
            sectionEl.appendChild(loadBtn);
            this.loadMoreButtons.set(key, loadBtn);
        } else if (loadBtn) {
            loadBtn.style.display = hasMore ? 'block' : 'none';
        }
    }

    createCardInstance(product, mainCat, subCat) {
        const savedCart = this.getCartMapFromStorage(); // للحفاظ على الكميات
        const initialQty = savedCart[product.name] || 0;
        const card = new ProductCard(product, this.storage, (name, newQty, delta) => {
            this.onCardQuantityChange(name, newQty, delta);
        }, initialQty);
        const cardElement = card.render();
        // مراقبة تحميل الصورة (يتم داخلياً، لكننا سنضيف إشارة)
        // نستخدم مؤقت بسيط لأن الـ loadAsync ليس له حدث مباشر
        // سنضيف حدث load للصورة
        const img = cardElement.querySelector('.product-img');
        if (img && !img.complete) {
            img.addEventListener('load', () => this.imageLoaded());
            img.addEventListener('error', () => this.imageLoaded());
        } else if (img) {
            this.imageLoaded();
        }
        return card;
    }

    onCardQuantityChange(productName, newQty, delta) {
        // تخزين السلة في localStorage
        const cartMap = this.getCartMapFromStorage();
        if (newQty === 0) delete cartMap[productName];
        else cartMap[productName] = newQty;
        this.saveCartMap(cartMap);
        
        // حساب الإجمالي الجديد وإعلام المدير العام
        let total = 0, totalQty = 0;
        for (let cardObj of this.cards) {
            const qty = cardObj.card.getQuantity();
            if (qty > 0) {
                totalQty += qty;
                total += qty * cardObj.card.getProduct().price;
            }
        }
        if (this.onGlobalQuantityChange) {
            this.onGlobalQuantityChange(totalQty, total);
        }
    }

    getCartMapFromStorage() {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.CART);
        return saved ? JSON.parse(saved) : {};
    }

    saveCartMap(map) {
        localStorage.setItem(CONFIG.STORAGE_KEYS.CART, JSON.stringify(map));
    }

    // ========== واجهات لتغيير الفلاتر ==========
    setActiveMainCategory(cat) {
        this.activeMain = cat;
        this.activeSub = null;
        // إعادة تعيين الصفحات الحالية لكل الأقسام (لأننا سنعيد رسم كل شيء)
        this.resetAllPages();
        this.renderVisibleSections();
    }

    setActiveSubCategory(sub) {
        this.activeSub = (sub === 'all') ? null : sub;
        this.resetAllPages();
        this.renderVisibleSections();
    }

    filterBySearch(query) {
        this.searchQuery = query;
        this.resetAllPages();
        this.renderVisibleSections();
        const visibleCount = this.cards.length;
        return visibleCount;
    }

    resetAllPages() {
        for (let key of this.currentPageMap.keys()) {
            this.currentPageMap.set(key, 0);
        }
        // إعادة تعيين الأزرار أيضاً
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
    }

    getMainCategories() {
        return Array.from(this.mainCategories);
    }

    getSubCategoriesFor(mainCat) {
        return Array.from(this.subCategoriesMap.get(mainCat) || []);
    }

    // استعلامات للسلة
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
            cardObj.card.changeQuantity(-cardObj.card.getQuantity());
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