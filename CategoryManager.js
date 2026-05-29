import { escapeHtml } from './config.js';

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
        this.items = [];
        this.totalQuantity = 0;
        this.totalPrice = 0;
        this.init();
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
    }

    openDrawer() {
        if (this.cartDrawer) this.cartDrawer.classList.add('open');
        if (this.drawerOverlay) this.drawerOverlay.classList.add('open');
        this.updateDrawerContent();
    }

    closeDrawer() {
        if (this.cartDrawer) this.cartDrawer.classList.remove('open');
        if (this.drawerOverlay) this.drawerOverlay.classList.remove('open');
    }

    updateFromCartItems(cartItems) {
        this.items = [...cartItems];
        this.totalQuantity = this.items.reduce((sum, i) => sum + i.quantity, 0);
        this.totalPrice = this.items.reduce((sum, i) => sum + (i.quantity * i.price), 0);

        if (this.cartBadge) {
            this.cartBadge.innerText = this.totalQuantity;
            this.cartBadge.style.display = this.totalQuantity > 0 ? 'flex' : 'none';
        }
        if (this.cartFooter) {
            if (this.totalQuantity > 0) this.cartFooter.classList.add('show');
            else this.cartFooter.classList.remove('show');
        }
        if (this.grandTotalSpan) {
            this.grandTotalSpan.innerText = this.totalPrice.toLocaleString();
        }
        if (this.cartDrawer && this.cartDrawer.classList.contains('open')) {
            this.updateDrawerContent();
        }
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

    setRemoveItemCallback(callback) {
        this.onRemoveItemCallback = callback;
    }

    sendToWhatsApp() {
        if (this.items.length === 0) {
            alert('السلة فارغة، أضف منتجات أولاً.');
            return;
        }
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
