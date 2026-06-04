import { escapeHtml } from './config.js';

export class ProductCard {
    constructor(product, storage, onQuantityChange, initialQty = 0) {
        this.product = product;
        this.storage = storage;
        this.onQuantityChange = onQuantityChange;
        this.quantity = initialQty;
        this.element = null;
        this.qtyInput = null;
        this.subtotalSpan = null;
        this.subtotalRow = null;
        this.debounceTimer = null;
        this.imageElement = null;
    }

    render() {
        const uniqueId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        const card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('data-name', this.product.name);
        card.setAttribute('data-price', this.product.price);
        card.setAttribute('data-stock', this.product.stock || 999);

        const subtotalDisplay = this.quantity > 0
            ? `<div class="item-subtotal">المجموع: <span class="subtotal-val">${(this.quantity * this.product.price).toLocaleString()}</span> ل.س</div>`
            : `<div class="item-subtotal" style="display: none;">المجموع: <span class="subtotal-val">0</span> ل.س</div>`;

        const descHtml = this.product.details
            ? `<div class="product-desc-toggle" role="button" aria-expanded="false" tabindex="0">
                   <span class="desc-toggle-label">التفاصيل <i class="fas fa-chevron-down desc-chevron"></i></span>
               </div>
               <div class="product-desc-body" hidden>
                   <p class="product-desc-text">${escapeHtml(this.product.details)}</p>
               </div>`
            : '';

        card.innerHTML = `
            <img class="product-img" id="${uniqueId}"
                 src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23f0f0f0'/%3E%3Ctext x='100' y='110' text-anchor='middle' fill='%23999' font-size='14'%3Eتحميل...%3C/text%3E%3C/svg%3E"
                 alt="${escapeHtml(this.product.name)}"
                 loading="lazy"
                 decoding="async">
            <div class="product-info">
                <div class="product-name">${escapeHtml(this.product.name)}</div>
                <div class="product-price">${this.product.price.toLocaleString()} ل.س</div>
                ${descHtml}
                ${subtotalDisplay}
                <div class="qty-controls">
                    <button class="qty-btn inc-qty">+</button>
                    <input type="number" class="qty-input" value="${this.quantity}" min="0" max="${this.product.stock || 999}" step="1">
                    <button class="qty-btn dec-qty">-</button>
                </div>
            </div>
        `;

        this.element = card;
        this.qtyInput = card.querySelector('.qty-input');
        this.subtotalSpan = card.querySelector('.subtotal-val');
        this.subtotalRow = card.querySelector('.item-subtotal');
        this.imageElement = card.querySelector(`#${uniqueId}`);

        // فتح الفيديو عند الضغط على الصورة
        if (this.product.videoUrl) {
            this.imageElement.style.cursor = 'pointer';
            const playBadge = document.createElement('div');
            playBadge.className = 'video-play-badge';
            playBadge.innerHTML = '<i class="fas fa-play"></i>';
            // نضعه بعد الصورة مباشرة
            this.imageElement.insertAdjacentElement('afterend', playBadge);
            const openVideo = (e) => {
                e.stopPropagation();
                VideoModal.open(this.product.videoUrl, this.product.name);
            };
            this.imageElement.addEventListener('click', openVideo);
            playBadge.addEventListener('click', openVideo);
        }

        // تفعيل زر التفاصيل
        const descToggle = card.querySelector('.product-desc-toggle');
        const descBody   = card.querySelector('.product-desc-body');
        if (descToggle && descBody) {
            const toggle = () => {
                const open = !descBody.hidden;
                descBody.hidden = open;
                descToggle.setAttribute('aria-expanded', String(!open));
                descToggle.querySelector('.desc-chevron')?.classList.toggle('open', !open);
            };
            descToggle.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
            descToggle.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
        }

        const incBtn = card.querySelector('.inc-qty');
        const decBtn = card.querySelector('.dec-qty');

        incBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.changeQuantity(1);
        });
        decBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.changeQuantity(-1);
        });

        this.qtyInput.addEventListener('change', (e) => {
            let newVal = parseInt(e.target.value);
            if (isNaN(newVal)) newVal = 0;
            const maxStock = this.product.stock || 999;
            newVal = Math.min(maxStock, Math.max(0, newVal));
            const delta = newVal - this.quantity;
            if (delta !== 0) {
                this.quantity = newVal;
                this.updateUI();
                if (this.onQuantityChange) {
                    this.onQuantityChange(this.product.name, this.quantity, delta);
                }
            }
            this.qtyInput.value = this.quantity;
        });

        this.loadImage();
        this.updateUI();
        return card;
    }

    loadImage() {
        if (!this.imageElement) return;
        const imageUrl = this.product.imageUrl;

        if (!imageUrl || !imageUrl.startsWith('http')) {
            this.setPlaceholderImage();
            return;
        }

        // الـ Service Worker يتكفّل بالكاش تلقائياً —
        // نضع الـ src مباشرة والمتصفح يسترجعها من Cache API بعد أول زيارة
        this.imageElement.src = imageUrl;
        this.imageElement.onload  = () => this.imageElement.classList.add('loaded');
        this.imageElement.onerror = () => {
            this.setPlaceholderImage();
            this.imageElement.classList.add('loaded'); // أظهر الـ placeholder أيضاً
        };
    }

    setPlaceholderImage() {
        if (this.imageElement) {
            this.imageElement.src = 'https://via.placeholder.com/300?text=No+Image';
            this.imageElement.classList.add('loaded');
        }
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

    changeQuantity(delta) {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            const newVal = this.quantity + delta;
            const maxStock = this.product.stock || 999;
            if (newVal >= 0 && newVal <= maxStock) {
                this.quantity = newVal;
                this.updateUI();
                this.element.classList.add('added');
                setTimeout(() => this.element.classList.remove('added'), 300);
                if (this.onQuantityChange) {
                    this.onQuantityChange(this.product.name, this.quantity, delta);
                }
            }
            this.debounceTimer = null;
        }, 150);
    }

    getQuantity() {
        return this.quantity;
    }

    setQuantity(qty) {
        const newQty = Math.min(this.product.stock || 999, Math.max(0, qty));
        const delta = newQty - this.quantity;
        this.quantity = newQty;
        this.updateUI();
        if (delta !== 0 && this.onQuantityChange) {
            this.onQuantityChange(this.product.name, this.quantity, delta);
        }
    }

    getProduct() {
        return this.product;
    }
}

// ========== Video Modal (Singleton - Fullscreen) ==========
export class VideoModal {
    static _el = null;
    static _historyPushed = false;

    static _build() {
        if (document.getElementById('videoModal')) return;
        const modal = document.createElement('div');
        modal.id = 'videoModal';
        modal.className = 'video-modal-overlay';
        modal.innerHTML = `
            <div class="video-modal-fullscreen">
                <div class="video-modal-topbar">
                    <button id="videoModalBack" class="video-modal-back" aria-label="رجوع">
                        <i class="fas fa-arrow-right"></i>
                    </button>
                    <span id="videoModalTitle" class="video-modal-title"></span>
                    <div class="video-modal-spacer"></div>
                </div>
                <div class="video-modal-body">
                    <video id="videoModalPlayer" class="video-player" controls playsinline></video>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // زر الرجوع
        document.getElementById('videoModalBack').addEventListener('click', () => VideoModal.close());

        // إغلاق بـ Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') VideoModal.close();
        });

        // التعامل مع زر الرجوع في المتصفح / الجهاز
        window.addEventListener('popstate', (e) => {
            if (VideoModal._historyPushed) {
                VideoModal._historyPushed = false;
                VideoModal.close(true); // true = جاء من popstate، لا تدفع تاريخاً جديداً
            }
        });

        VideoModal._el = modal;
    }

    static open(videoUrl, title = '') {
        VideoModal._build();
        const modal   = document.getElementById('videoModal');
        const player  = document.getElementById('videoModalPlayer');
        const titleEl = document.getElementById('videoModalTitle');

        if (titleEl) titleEl.textContent = title;
        player.src = videoUrl;
        player.load();
        modal.classList.add('open');

        // أضف حالة في التاريخ حتى يشتغل زر الرجوع في الهاتف
        history.pushState({ videoModal: true }, '', location.href);
        VideoModal._historyPushed = true;

        // تشغيل تلقائي
        player.play().catch(() => {});
        document.body.style.overflow = 'hidden';
    }

    static close(fromPopstate = false) {
        const modal  = document.getElementById('videoModal');
        const player = document.getElementById('videoModalPlayer');
        if (!modal || !modal.classList.contains('open')) return;

        modal.classList.remove('open');
        if (player) {
            player.pause();
            player.src = '';
        }
        document.body.style.overflow = '';

        // إذا أُغلق بدون popstate (بالضغط على زر الرجوع في الواجهة)، امسح الحالة من التاريخ
        if (!fromPopstate && VideoModal._historyPushed) {
            VideoModal._historyPushed = false;
            history.back();
        }
    }
}
