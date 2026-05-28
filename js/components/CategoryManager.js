// ==================== مدير التصنيفات ====================
// يدير أزرار التصنيفات الرئيسية والفرعية والتفاعل بينها

export class CategoryManager {
    constructor(mainContainerId, subContainerId, onMainSelect, onSubSelect) {
        this.mainContainer = document.getElementById(mainContainerId);
        this.subContainer = document.getElementById(subContainerId);
        this.onMainSelect = onMainSelect;     // callback(mainCategory)
        this.onSubSelect = onSubSelect;       // callback(subCategory)
        
        this.currentMain = 'all';
        this.currentSub = null;
        this.mainCategories = ['all'];        // سيتم إضافة الباقي ديناميكياً
        this.subCategoriesMap = new Map();     // mainCat -> array of subCats
    }

    // بناء أزرار التصنيفات الرئيسية من البيانات
    buildMainChips(mainCatsArray) {
        if (!this.mainContainer) return;
        this.mainContainer.innerHTML = '';
        this.mainCategories = ['all', ...mainCatsArray];
        
        this.mainCategories.forEach(cat => {
            const chip = document.createElement('div');
            chip.className = 'chip';
            if (cat === 'all') chip.classList.add('active');
            chip.setAttribute('data-main-cat', cat);
            chip.innerText = cat === 'all' ? 'الكل' : cat;
            chip.addEventListener('click', () => this.selectMainCategory(cat));
            this.mainContainer.appendChild(chip);
        });
    }

    // تحديث الأزرار الفرعية بناءً على التصنيف الرئيسي المختار
    updateSubChips(mainCat, subCatsArray) {
        if (!this.subContainer) return;
        
        if (mainCat === 'all' || !subCatsArray || subCatsArray.length === 0) {
            this.subContainer.style.display = 'none';
            this.currentSub = null;
            this.onSubSelect('all');
            return;
        }
        
        this.subContainer.style.display = 'flex';
        this.subContainer.innerHTML = '';
        
        // إضافة زر "الكل"
        const allChip = document.createElement('div');
        allChip.className = 'chip sub-active';
        allChip.setAttribute('data-sub', 'all');
        allChip.innerText = 'الكل';
        allChip.addEventListener('click', () => this.selectSubCategory('all'));
        this.subContainer.appendChild(allChip);
        
        // إضافة الأزرار الفرعية
        subCatsArray.forEach(sub => {
            const chip = document.createElement('div');
            chip.className = 'chip';
            chip.setAttribute('data-sub', sub);
            chip.innerText = sub;
            chip.addEventListener('click', () => this.selectSubCategory(sub));
            this.subContainer.appendChild(chip);
        });
        
        // افتراضياً نختار "الكل"
        this.currentSub = 'all';
        this.onSubSelect('all');
    }

    selectMainCategory(cat) {
        if (this.currentMain === cat) return;
        this.currentMain = cat;
        
        // تحديث النشاط المرئي للأزرار الرئيسية
        const chips = this.mainContainer.querySelectorAll('.chip');
        chips.forEach(chip => {
            const chipCat = chip.getAttribute('data-main-cat');
            if (chipCat === cat) chip.classList.add('active');
            else chip.classList.remove('active');
        });
        
        // إعادة ضبط التصنيف الفرعي الحالي
        this.currentSub = null;
        
        // إبلاغ المستمع الرئيسي
        this.onMainSelect(cat);
        
        // إذا كان التصنيف الرئيسي هو "الكل"، نخفي الأزرار الفرعية
        if (cat === 'all') {
            this.subContainer.style.display = 'none';
            this.currentSub = null;
            this.onSubSelect('all');
        } else {
            // جلب التصنيفات الفرعية لهذا التصنيف الرئيسي من الخريطة المخزنة
            const subs = this.subCategoriesMap.get(cat) || [];
            this.updateSubChips(cat, subs);
        }
    }

    selectSubCategory(sub) {
        if (this.currentSub === sub) return;
        this.currentSub = sub;
        
        // تحديث النشاط المرئي للأزرار الفرعية
        const chips = this.subContainer.querySelectorAll('.chip');
        chips.forEach(chip => {
            const chipSub = chip.getAttribute('data-sub');
            if (chipSub === sub) chip.classList.add('sub-active');
            else chip.classList.remove('sub-active');
        });
        
        // إبلاغ المستمع (الـ ProductsGrid) بتغيير التصنيف الفرعي
        this.onSubSelect(sub);
    }

    // تعيين خريطة التصنيفات الفرعية بعد تحميل البيانات
    setSubCategoriesMap(map) {
        this.subCategoriesMap = map;
    }

    // الحصول على التصنيف الرئيسي الحالي
    getCurrentMain() {
        return this.currentMain;
    }

    // الحصول على التصنيف الفرعي الحالي
    getCurrentSub() {
        return this.currentSub;
    }
}