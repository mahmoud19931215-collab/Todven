// ==================== مدير السلة ====================
// يدير: دراور السلة، الفوتر العائم، تحديث العدد والإجمالي، الإرسال إلى واتساب
import { CONFIG, formatCurrency, escapeHtml } from "../config.js";

export class CartManager {
    constructor(targetNumber, onCartUpdate) {
        this.targetNumber = targetNumber;
        this.onCartUpdate = onCartUpdate; // callback (totalQuantity, totalPrice)
        
        // العناصر DOM
        this.cartDrawer = document.getElementById('cartDrawer');
        this.drawerOverlay = document.getElementById('cartOverlay');
        this.cartBadge = document.getElementById('cartBadge');
        this.cartFooter = document.getElementById('cartFooter');
        this.grandTotalSpan = document.getElementById('grandTotal');
        this.cartItemsList = document.getElementById('cartItemsList');
        this.drawerTotalSpan = document.getElementById('drawerTotal');
        
        // الأزرار
        this.openDrawerBtn = document.getElementById('cartDrawerBtn');
        this.closeDrawerBtns = document.querySelectorAll('.drawer-close');
        this.whatsappFooterBtn = document.getElementById('whatsappFooterBtn');
        this.drawerWhatsappBtn = document.getElementById('drawerWhatsappBtn');
        
        // الحالة الداخلية
        this.items = []; // { name, quantity, price }
        this.totalQuantity = 0;
        this.totalPrice = 0;
        
        this.init();
    }
    
    init() {
        // فتح الدراور
        if (this.openDrawerBtn) {
            this.openDrawerBtn.addEventListener('click', () => this.openDrawer());
        }
        
        // إغلاق الدراور
        if (this.closeDrawerBtns) {
            this.closeDrawerBtns.forEach(btn => {
                btn.addEventListener('click', () => this.closeDrawer());
            });
        }
        if (this.drawerOverlay) {
            this.drawerOverlay.addEventListener('click', () => this.closeDrawer());
        }
        
        // أزرار الواتساب
        if (this.whatsappFooterBtn) {
            this.whatsappFooterBtn.addEventListener('click', () => this.sendToWhatsApp());
        }
        if (this.drawerWhatsappBtn) {
            this.drawerWhatsappBtn.addEventListener('click', () => {
                this.sendToWhatsApp();
                this.closeDrawer();
            });
        }
    }
    
    openDrawer() {
        if (this.cartDrawer) this.cartDrawer.classList.add('open');
        if (this.drawerOverlay) this.drawerOverlay.classList.add('open');
        this.updateDrawerContent(); // تحديث المحتوى عند الفتح
    }
    
    closeDrawer() {
        if (this.cartDrawer) this.cartDrawer.classList.remove('open');
        if (this.drawerOverlay) this.drawerOverlay.classList.remove('open');
    }
    
    // تحديث البيانات من مصدر خارجي (يتم استدعاؤها من الـ ProductsGrid)
    updateFromCartItems(cartItems) {
        this.items = [...cartItems];
        this.totalQuantity = this.items.reduce((sum, i) => sum + i.quantity, 0);
        this.totalPrice = this.items.reduce((sum, i) => sum + (i.quantity * i.price), 0);
        
        // تحديث الباج (العدد على أيقونة السلة)
        if (this.cartBadge) {
            this.cartBadge.innerText = this.totalQuantity;
            this.cartBadge.style.display = this.totalQuantity > 0 ? 'flex' : 'none';
        }
        
        // تحديث الفوتر العائم
        if (this.cartFooter) {
            if (this.totalQuantity > 0) this.cartFooter.classList.add('show');
            else this.cartFooter.classList.remove('show');
        }
        
        // تحديث الإجمالي في الفوتر
        if (this.grandTotalSpan) {
            this.grandTotalSpan.innerText = this.totalPrice.toLocaleString();
        }
        
        // تحديث محتوى الدراور (إذا كان مفتوحاً نحدثه فوراً)
        if (this.cartDrawer && this.cartDrawer.classList.contains('open')) {
            this.updateDrawerContent();
        }
        
        // استدعاء الـ callback إذا لزم الأمر (مثلاً لحفظ السلة)
        if (this.onCartUpdate) {
            this.onCartUpdate(this.totalQuantity, this.totalPrice);
        }
    }
    
    updateDrawerContent() {
        if (!this.cartItemsList) return;
        
        if (this.items.length === 0) {
            this.cartItemsList.innerHTML = '<div class="empty-cart">🛒 السلة فارغة</div>';
            if (this.drawerTotalSpan) this.drawerTotalSpan.innerText = '0';
            return;
        }
        
        let html = '';
        for (const item of this.items) {
            const subtotal = item.quantity * item.price;
            html += `
                <div class="cart-item" data-name="${escapeHtml(item.name)}">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${escapeHtml(item.name)}</div>
                        <div class="cart-item-price">${item.price.toLocaleString()} ل.س</div>
                        <div class="cart-item-qty">الكمية: ${item.quantity}</div>
                    </div>
                    <button class="remove-item" data-name="${escapeHtml(item.name)}"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
        }
        this.cartItemsList.innerHTML = html;
        
        if (this.drawerTotalSpan) {
            this.drawerTotalSpan.innerText = this.totalPrice.toLocaleString();
        }
        
        // إضافة أحداث الحذف لكل زر
        const removeBtns = this.cartItemsList.querySelectorAll('.remove-item');
        removeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const name = btn.getAttribute('data-name');
                if (name && this.onRemoveItemCallback) {
                    this.onRemoveItemCallback(name);
                }
            });
        });
    }
    
    // دالة لحذف عنصر (يتم ربطها من التطبيق الرئيسي)
    setRemoveItemCallback(callback) {
        this.onRemoveItemCallback = callback;
    }
    
    sendToWhatsApp() {
        if (this.items.length === 0) return;
        
        let message = "";
        for (const item of this.items) {
            const subtotal = item.quantity * item.price;
            message += `🛒 *${item.name}*\n   ${item.quantity} قطعة × ${item.price.toLocaleString()} = ${subtotal.toLocaleString()} ل.س\n`;
        }
        message += "--------------------------\n";
        message += `💰 *الإجمالي النهائي: ${this.totalPrice.toLocaleString()} ل.س*`;
        
        const url = `https://wa.me/${this.targetNumber}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    }
}