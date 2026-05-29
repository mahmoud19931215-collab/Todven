import { CONFIG } from './config.js';

export class ProductCard {
    constructor(product, storage, onQuantityChange, initialQty = 0, cartManager = null) {
        this.product = product;
        this.storage = storage;
        this.onQuantityChange = onQuantityChange;
        this.cartManager = cartManager;   // مرجع اختياري للعربة
        this.quantity = initialQty;
        this.element = null;
        this.qtyInput = null;
        this.subtotalSpan = null;
        this.subtotalRow = null;
        this.debounceTimer = null;
        this.imageElement = null;
        this.plusBtn = null;
        this.minusBtn = null;
        this.isUpdating = false;   // منع التحديثات المتكررة
    }

    render() {
        const uniqueId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        const card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('data-name', this.product.name);
        card.setAttribute('data-price', this.product.price);
        card.setAttribute('data-stock', this.product.stock || 999);

        const subtotalDisplay = this.quantity > 0
            ? `<div class="item-subtotal"><i class="fas fa-calculator"></i> المجموع: <span class="subtotal-val">${(this.quantity * this.product.price).toLocaleString()}</span> ل.س</div>`
            : `<div class="item-subtotal" style="display: none;"><i class="fas fa-calculator"></i> المجموع: <span class="subtotal-val">0</span> ل.س</div>`;

        const stockWarning = (this.product.stock && this.product.stock <= 5) 
            ? `<div class="stock-warning"><i class="fas fa-exclamation-triangle"></i> متبقي ${this.product.stock} فقط</div>` 
            : '';

        card.innerHTML = `
            <div class="product-img-wrapper">
                <img class="product-img" id="${uniqueId}" 
                     src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23f0f0f0'/%3E%3Ctext x='100' y='110' text-anchor='middle' fill='%23999' font-size='14'%3Eجاري التحميل...%3C/text%3E%3C/svg%3E" 
                     alt="${escapeHtml(this.product.name)}"
                     loading="lazy">
                ${stockWarning}
            </div>
            <div class="product-info">
                <div class="product-name">${escapeHtml(this.product.name)}</div>
                <div class="product-price">${this.product.price.toLocaleString()} <span class="currency">ل.س</span></div>
                ${subtotalDisplay}
                <div class="qty-controls">
                    <button class="qty-btn dec-qty" aria-label="إنقاص"><i class="fas fa-minus"></i></button>
                    <input type="number" class="qty-input" value="${this.quantity}" min="0" max="${this.product.stock || 999}" step="1" aria-label="الكمية">
                    <button class="qty-btn inc-qty" aria-label="زيادة"><i class="fas fa-plus"></i></button>
                </div>
            </div>
        `;

        this.element = card;
        this.qtyInput = card.querySelector('.qty-input');
        this.subtotalSpan = card.querySelector('.subtotal-val');
        this.subtotalRow = card.querySelector('.item-subtotal');
        this.imageElement = card.querySelector(`#${uniqueId}`);
        this.plusBtn = card.querySelector('.inc-qty');
        this.minusBtn = card.querySelector('.dec-qty');
        
        // إضافة المستمعين
        this.plusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.changeQuantity(1);
        });
        this.minusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.changeQuantity(-1);
        });

        this.qtyInput.addEventListener('change', (e) => {
            let newVal = parseInt(e.target.value);
            if (isNaN(newVal)) newVal = 0;
            const maxStock = this.product.stock || 999;
            newVal = Math.min(maxStock, Math.max(0, newVal));
            if (newVal !== this.quantity) {
                this.quantity = newVal;
                this.updateUI();
                this.notifyChange();
            }
            this.qtyInput.value = this.quantity;
        });

        // تحميل الصورة
        this.loadImage();
        this.updateUI();
        
        return card;
    }

    async loadImage() {
        if (!this.imageElement) return;
        const imageUrl = this.product.imageUrl;
        if (!imageUrl) {
            this.setPlaceholderImage();
            return;
        }

        let cachedBlob = null;
        try {
            cachedBlob = await this.storage.getImageBlob(imageUrl);
        } catch (e) {
            console.warn("Error getting cached blob", e);
        }

        if (cachedBlob) {
            const url = URL.createObjectURL(cachedBlob);
            this.imageElement.src = url;
            this.imageElement.onload = () => URL.revokeObjectURL(url);
            this.imageElement.onerror = () => {
                URL.revokeObjectURL(url);
                this.loadImageDirect();
            };
            return;
        }

        this.loadImageDirect();
    }

    async loadImageDirect() {
        const imageUrl = this.product.imageUrl;
        if (!imageUrl) {
            this.setPlaceholderImage();
            return;
        }

        try {
            // استخدم img عادي للتغلب على CORS إن أمكن
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = async () => {
                // محاولة تخزين الصورة كـ blob عبر canvas (قد يفشل لـ CORS لكنها محاولة)
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob(async (blob) => {
                        if (blob) {
                            await this.storage.saveImageBlob(imageUrl, blob);
                        }
                        this.imageElement.src = imageUrl; // نعرض الصورة الأصلية
                    });
                } catch (e) {
                    this.imageElement.src = imageUrl;
                }
                this.imageElement.onerror = () => this.setPlaceholderImage();
            };
            img.onerror = () => {
                this.imageElement.src = imageUrl;
                this.imageElement.onerror = () => this.setPlaceholderImage();
            };
            img.src = imageUrl;
        } catch (err) {
            console.warn(`Failed to load image: ${imageUrl}`, err);
            this.imageElement.src = imageUrl;
            this.imageElement.onerror = () => this.setPlaceholderImage();
        }
    }

    setPlaceholderImage() {
        if (this.imageElement) {
            this.imageElement.src = 'https://via.placeholder.com/300?text=No+Image';
        }
    }

    updateUI() {
        if (!this.qtyInput) return;
        this.qtyInput.value = this.quantity;
        if (this.quantity > 0) {
            const subtotal = this.quantity * this.product.price;
            if (this.subtotalSpan) this.subtotalSpan.innerText = subtotal.toLocaleString();
            if (this.subtotalRow) this.subtotalRow.style.display = 'flex';
            // إضافة تأثير نبض للبطاقة
            this.element.classList.add('added');
            setTimeout(() => this.element.classList.remove('added'), 300);
        } else {
            if (this.subtotalRow) this.subtotalRow.style.display = 'none';
        }
        // تعطيل زر الزيادة إذا وصل للمخزون
        const maxStock = this.product.stock || 999;
        if (this.plusBtn) {
            this.plusBtn.disabled = (this.quantity >= maxStock);
        }
        if (this.minusBtn) {
            this.minusBtn.disabled = (this.quantity <= 0);
        }
    }

    changeQuantity(delta) {
        if (this.isUpdating) return;
        this.isUpdating = true;
        
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            const newVal = this.quantity + delta;
            const maxStock = this.product.stock || 999;
            if (newVal >= 0 && newVal <= maxStock) {
                this.quantity = newVal;
                this.updateUI();
                this.notifyChange();
            }
            this.debounceTimer = null;
            this.isUpdating = false;
        }, 100);
    }

    notifyChange() {
        if (this.onQuantityChange) {
            this.onQuantityChange(this.product.name, this.quantity, null);
        }
    }

    // تعيين الكمية من الخارج (مثلاً عند تحديث العربة من الدراور)
    setQuantity(qty) {
        const maxStock = this.product.stock || 999;
        const newQty = Math.min(maxStock, Math.max(0, qty));
        if (newQty !== this.quantity) {
            this.quantity = newQty;
            this.updateUI();
            // لا نستدعي notifyChange هنا لتجنب حلقة لا نهائية، لأن المتغير قد أتى من CartManager أصلاً
        }
    }

    getQuantity() {
        return this.quantity;
    }

    getProduct() {
        return this.product;
    }
}

// دالة escapeHtml مساعدة
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
