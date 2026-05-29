import { CONFIG } from './config.js';
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
        // الترقيم الداخلي لكل قسم
        this.currentPageMap = new Map();
        this.loadMoreButtons = new Map();
        // هيكل جديد للتقسيم التدريجي للتصنيفات الفرعية
        this.allSectionsList = [];      // قائمة بكل {mainCat, subCat}
        this.visibleSectionsCount = 5;  // عدد الأقسام المعروضة في البداية
        this.sectionsPerLoad = 5;       // عدد الأقسام الإضافية عند الضغط على "المزيد"
        this.sectionsLoadMoreBtn = null; // زر واحد لتحميل أقسام إضافية
        this.cards = [];
        this.imagesLoaded = 0;
        this.totalImages = 0;
        this.onImageProgress = null;
        this.skeleton = document.getElementById('skeletonLoader');
        this.productsGridDiv = document.getElementById('productsGrid');
        this.isRendering = false;
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
        // بناء الخرائط كما هو
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
        // بناء قائمة جميع الأقسام (مرتبة حسب التصنيف الرئيسي ثم الفرعي)
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
        this.productsGridDiv.innerHTML = '';
        this.cards = [];
        this.totalImages = 0;
        this.imagesLoaded = 0;
        this.isRendering = true;

        // تحديد عدد الأقسام المراد عرضها في هذه الدفعة
        const sectionsToShow = this.allSectionsList.slice(0, this.visibleSectionsCount);

        // رسم الأقسام الظاهرة
        for (const { mainCat, subCat } of sectionsToShow) {
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

        // إدارة زر "المزيد من التصنيفات"
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
        this.isRendering = false;
    }

    loadMoreSections() {
        // زيادة عدد الأقسام المرئية
        this.visibleSectionsCount += this.sectionsPerLoad;
        this.renderVisibleSections();
    }

    // باقي الدوال (renderSubCategoryFull, renderSubCategoryPaginated, createCardInstance, إلخ) كما هي دون تغيير كبير
    // ولكن يجب تعديل createCardInstance لاستخدام lazy loading attribute

    createCardInstance(product, mainCat, subCat) {
        const savedCart = this.getCartMapFromStorage();
        const initialQty = savedCart[product.name] || 0;
        const card = new ProductCard(product, this.storage, (name, newQty, delta) => this.onCardQuantityChange(name, newQty, delta), initialQty);
        const cardElement = card.render();
        // إضافة خاصية loading="lazy" للصورة (مدعوم في المتصفحات الحديثة)
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

    // الدوال التالية بقيت كما هي ولكنها تستخدم الدوال أعلاه
    // ... (نفس الكود القديم لـ renderSubCategoryFull, renderSubCategoryPaginated, onCardQuantityChange, getCartMapFromStorage, saveCartMap, setActiveMainCategory, setActiveSubCategory, filterBySearch, resetAllPages, clear, getMainCategories, getSubCategoriesFor, getAllCartItems, removeItemFromCart, getTotalCartQuantity)

    // يجب إعادة تعريف بعض الدوال التي تعتمد على allSectionsList بعد تغيير الفلاتر
    setActiveMainCategory(cat) {
        this.activeMain = cat;
        this.activeSub = null;
        this.visibleSectionsCount = 5; // إعادة تعيين عدد الأقسام الظاهرة
        this.buildAllSectionsList();
        this.resetAllPages();
        this.renderVisibleSections();
    }

    setActiveSubCategory(sub) {
        this.activeSub = (sub === 'all') ? null : sub;
        this.visibleSectionsCount = 5;
        this.buildAllSectionsList();
        this.resetAllPages();
        this.renderVisibleSections();
    }

    filterBySearch(query) {
        this.searchQuery = query;
        this.visibleSectionsCount = 5; // عند البحث، نعرض أكبر عدد ممكن من الأقسام (لأن البحث يقلل العدد)
        if (query.trim() !== '') {
            // في حالة البحث، نريد عرض كل الأقسام التي تحتوي على نتائج على الفور، لكننا سنظهرها كلها مرة واحدة
            // لتجنب التعقيد، سنعيد بناء القائمة ثم نعرضها كاملة
            this.buildAllSectionsList();
            this.visibleSectionsCount = this.allSectionsList.length;
        } else {
            this.buildAllSectionsList();
        }
        this.resetAllPages();
        this.renderVisibleSections();
        return this.cards.length;
    }

    // الدوال المتبقية (getSectionsToRender لم تعد مستخدمة، استبدلنا بـ allSectionsList)
    // نحتفظ بها للتوافق لكننا نلغي استخدامها
    getSectionsToRender() {
        return this.allSectionsList.slice(0, this.visibleSectionsCount);
    }

    // ... يجب إضافة الدوال المفقودة من الكود القديم (الكثير منها موجود بالفعل)
    // لحفظ المساحة، سأذكر فقط الدوال التي تحتاج تعديل. الباقي (مثل resetAllPages, clear, getMainCategories, إلخ) يبقى كما هو.
}

// يجب إضافة الكود المتبقي من ProductsGrid.js الأصلي (الدوال غير المذكورة أعلاه) 
// نظراً لطول الرد، سأختصر، لكن في التطبيق الفعلي ستنسخ كامل الدوال من النسخة القديمة مع التعديلات أعلاه.
