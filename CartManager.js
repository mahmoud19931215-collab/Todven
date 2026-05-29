import { escapeHtml, CONFIG } from './config.js';

export class CartManager {
    constructor(targetNumber, onCartUpdate) {
        this.targetNumber = targetNumber;
        this.onCartUpdate = onCartUpdate;
        this.cartDrawer = document.getElementById('cartDrawer');
        this.drawerOverlay = document.getElementById('cartOverlay');
        this.cartBadge = document.getElementById('cartBadge');
        this.cartFooter = document.getElementById('cartFooter');
        this.grandTotalSpan = document.getElementById('grandTotal');
        this.cartItemsList = document.getElementById('cartItemsList');
        this.drawerTotalSpan = document.getElementById('drawerTotal');
        this.openDrawerBtn = document.getElementById('cartDrawerBtn');
        this.closeDrawerBtns = document.querySelectorAll('.drawer-close');
        this.whatsappFooterBtn = document.getElementById('whatsappFooterBtn');
        this.drawerWhatsappBtn = document.getElementById('drawerWhatsappBtn');
        
        // المخزن الرئيسي للعربة (Single Source of Truth)
        this.items = []; // { name, quantity, price, imageUrl? }
        this.totalQuantity = 0;
        this.totalPrice = 0;
        
        // تحميل البيانات من localStorage عند البدء
        this.loadFromStorage();
        this.init();
    }

    // تحميل العربة من localStorage
    loadFromStorage() {
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.CART);
            if (saved) {
                const parsed = JSON.parse(saved);
                // التحقق من صيغة البيانات (قديمة أو جديدة)
                if (Array.isArray(parsed)) {
                    this.items = parsed;
                } else if (typeof parsed === 'object') {
                    // صيغة قديمة: { productName: quantity }
                    this.items = Object.entries(parsed).map(([name, qty]) => ({
                        name,
                        quantity: qty,
                        price: 0 // سيتم تحديث السعر لاحقاً عند توفر المنتج
                    }));
                } else {
                    this.items = [];
                }
            } else {
                this.items = [];
            }
        } catch (e) {
            console.warn("Failed to load cart from localStorage", e);
            this.items = [];
        }
        this.recalculateTotals();
    }

    // حفظ العربة إلى localStorage
    saveToStorage() {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEYS.CART, JSON.stringify(this.items));
        } catch (e) {
            console.warn("Failed to save cart to localStorage", e);
        }
    }

    // إعادة حساب الإجماليات
    recalculateTotals() {
        this.totalQuantity = this.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
        this.totalPrice = this.items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.price || 0)), 0);
        this.updateUI();
        if (this.onCartUpdate) {
            this.onCartUpdate(this.totalQuantity, this.totalPrice);
        }
    }

    // تحديث واجهة المستخدم (البادج، الفوتر، الدراور)
    updateUI() {
        // تحديث البادج
        if (this.cartBadge) {
            this.cartBadge.innerText = this.totalQuantity;
            this.cartBadge.style.display = this.totalQuantity > 0 ? 'flex' : 'none';
        }
        // تحديث الفوتر العائم
        if (this.cartFooter) {
            if (this.totalQuantity > 0) this.cartFooter.classList.add('show');
            else this.cartFooter.classList.remove('show');
        }
        if (this.grandTotalSpan) {
            this.grandTotalSpan.innerText = this.totalPrice.toLocaleString();
        }
        // تحديث محتوى الدراور إذا كان مفتوحاً
        if (this.cartDrawer && this.cartDrawer.classList.contains('open')) {
            this.updateDrawerContent();
        }
    }

    // إضافة أو تحديث منتج في العربة
    updateItem(productName, newQuantity, productPrice, productImage = null) {
        if (newQuantity < 0) newQuantity = 0;
        
        const existingIndex = this.items.findIndex(item => item.name === productName);
        
        if (newQuantity === 0) {
            // حذف المنتج
            if (existingIndex !== -1) {
                this.items.splice(existingIndex, 1);
            }
        } else {
            if (existingIndex !== -1) {
                // تحديث موجود
                this.items[existingIndex].quantity = newQuantity;
                this.items[existingIndex].price = productPrice;
                if (productImage) this.items[existingIndex].imageUrl = productImage;
            } else {
                // إضافة جديد
                this.items.push({
                    name: productName,
                    quantity: newQuantity,
                    price: productPrice,
                    imageUrl: productImage || null
                });
            }
        }
        
        this.recalculateTotals();
        this.saveToStorage();
        
        // إرجاع العنصر المحدث (للإشعارات)
        return { name: productName, quantity: newQuantity, price: productPrice };
    }

    // الحصول على كمية منتج معين
    getItemQuantity(productName) {
        const item = this.items.find(item => item.name === productName);
        return item ? item.quantity : 0;
    }

    // الحصول على سعر منتج معين (من العربة)
    getItemPrice(productName) {
        const item = this.items.find(item => item.name === productName);
        return item ? item.price : 0;
    }

    // حذف منتج بالكامل من العربة
    removeItem(productName) {
        const index = this.items.findIndex(item => item.name === productName);
        if (index !== -1) {
            this.items.splice(index, 1);
            this.recalculateTotals();
            this.saveToStorage();
            return true;
        }
        return false;
    }

    // تفريغ العربة بالكامل
    clearCart() {
        this.items = [];
        this.recalculateTotals();
        this.saveToStorage();
    }

    // تحديث محتوى الدراور (القائمة الجانبية)
    updateDrawerContent() {
        if (!this.cartItemsList) return;

        if (this.items.length === 0) {
            this.cartItemsList.innerHTML = `
                <div class="empty-cart-animation">
                    <i class="fas fa-shopping-bag"></i>
                    <p>سلة المشتريات فارغة</p>
                    <span>أضف منتجاتك المفضلة</span>
                </div>
            `;
            if (this.drawerTotalSpan) this.drawerTotalSpan.innerText = '0';
            return;
        }

        let html = '';
        for (const item of this.items) {
            html += `
                <div class="cart-item" data-name="${escapeHtml(item.name)}">
                    <div class="cart-item-img">
                        ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy">` : '<i class="fas fa-box"></i>'}
                    </div>
                    <div class="cart-item-info">
                        <div class="cart-item-name">${escapeHtml(item.name)}</div>
                        <div class="cart-item-price">${(item.price || 0).toLocaleString()} ل.س</div>
                        <div class="cart-item-qty-control">
                            <button class="cart-qty-dec" data-name="${escapeHtml(item.name)}">-</button>
                            <span class="cart-item-qty">${item.quantity}</span>
                            <button class="cart-qty-inc" data-name="${escapeHtml(item.name)}">+</button>
                        </div>
                    </div>
                    <button class="remove-item" data-name="${escapeHtml(item.name)}"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
        }
        this.cartItemsList.innerHTML = html;
        if (this.drawerTotalSpan) {
            this.drawerTotalSpan.innerText = this.totalPrice.toLocaleString();
        }

        // إضافة مستمعي الأحداث للتحكم في الكمية داخل الدراور
        this.cartItemsList.querySelectorAll('.cart-qty-inc').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const name = btn.getAttribute('data-name');
                const currentQty = this.getItemQuantity(name);
                const price = this.getItemPrice(name);
                if (price > 0) {
                    this.updateItem(name, currentQty + 1, price);
                    // نرسل إشارة إلى ProductsGrid لتحديث واجهة المنتج
                    this.notifyProductQuantityChange(name, currentQty + 1);
                }
                this.updateDrawerContent(); // إعادة رسم للتحديث الفوري
            });
        });
        
        this.cartItemsList.querySelectorAll('.cart-qty-dec').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const name = btn.getAttribute('data-name');
                const currentQty = this.getItemQuantity(name);
                if (currentQty > 1) {
                    const price = this.getItemPrice(name);
                    this.updateItem(name, currentQty - 1, price);
                    this.notifyProductQuantityChange(name, currentQty - 1);
                } else if (currentQty === 1) {
                    this.removeItem(name);
                    this.notifyProductQuantityChange(name, 0);
                }
                this.updateDrawerContent();
            });
        });

        this.cartItemsList.querySelectorAll('.remove-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const name = btn.getAttribute('data-name');
                this.removeItem(name);
                this.notifyProductQuantityChange(name, 0);
                this.updateDrawerContent();
            });
        });
    }

    // إعلام ProductsGrid بتغير كمية منتج ما (لتحديث واجهة المنتج)
    notifyProductQuantityChange(productName, newQuantity) {
        if (window.productGridInstance && window.productGridInstance.updateProductQuantity) {
            window.productGridInstance.updateProductQuantity(productName, newQuantity);
        }
    }

    // فتح الدراور
    openDrawer() {
        if (this.cartDrawer) this.cartDrawer.classList.add('open');
        if (this.drawerOverlay) this.drawerOverlay.classList.add('open');
        this.updateDrawerContent();
        // إضافة تأثير منع السكرول
        document.body.style.overflow = 'hidden';
    }

    // إغلاق الدراور
    closeDrawer() {
        if (this.cartDrawer) this.cartDrawer.classList.remove('open');
        if (this.drawerOverlay) this.drawerOverlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    // إرسال الطلب عبر واتساب
    sendToWhatsApp() {
        if (this.items.length === 0) {
            this.showToast("السلة فارغة، أضف منتجات أولاً.", "warning");
            return;
        }
        let message = "🛍️ *طلب جديد من توجفن*\n\n";
        for (const item of this.items) {
            const subtotal = item.quantity * item.price;
            message += `▪️ *${item.name}*\n   ${item.quantity} × ${item.price.toLocaleString()} = ${subtotal.toLocaleString()} ل.س\n`;
        }
        message += "\n━━━━━━━━━━━━━━━━━━━\n";
        message += `💰 *الإجمالي النهائي: ${this.totalPrice.toLocaleString()} ل.س*\n`;
        message += "📦 *الشكر لتوجفن*";
        
        window.open(`https://wa.me/${this.targetNumber}?text=${encodeURIComponent(message)}`, '_blank');
    }

    // دالة مساعدة لعرض إشعارات (toast)
    showToast(message, type = "info") {
        let toast = document.getElementById('dynamicToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'dynamicToast';
            toast.className = 'dynamic-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show', type);
        setTimeout(() => {
            toast.classList.remove('show', type);
        }, 2500);
    }

    // تحديث العربة من بيانات خارجية (مثلاً بعد التزامن)
    syncFromExternal(itemsArray) {
        this.items = itemsArray.filter(item => item.quantity > 0);
        this.recalculateTotals();
        this.saveToStorage();
        this.updateDrawerContent();
    }

    // دالة للحصول على نسخة من العربة (للقراءة فقط)
    getCartItems() {
        return [...this.items];
    }

    init() {
        if (this.openDrawerBtn) {
            this.openDrawerBtn.addEventListener('click', () => this.openDrawer());
        }
        if (this.closeDrawerBtns) {
            this.closeDrawerBtns.forEach(btn => {
                btn.addEventListener('click', () => this.closeDrawer());
            });
        }
        if (this.drawerOverlay) {
            this.drawerOverlay.addEventListener('click', () => this.closeDrawer());
        }
        if (this.whatsappFooterBtn) {
            this.whatsappFooterBtn.addEventListener('click', () => this.sendToWhatsApp());
        }
        if (this.drawerWhatsappBtn) {
            this.drawerWhatsappBtn.addEventListener('click', () => {
                this.sendToWhatsApp();
                this.closeDrawer();
            });
        }
        
        // تحديث الواجهة الأولية
        this.updateUI();
    }
}
