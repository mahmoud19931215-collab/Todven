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

// ========== Video Modal (Singleton - Fullscreen + Swipe + Preload + Skeleton + Progress) ==========
export class VideoModal {
    static _el = null;
    static _historyPushed = false;

    static _playlist = [];
    static _currentIndex = 0;

    // متغيرات السحب
    static _touchStartY = 0;
    static _touchStartX = 0;
    static _isDragging = false;
    static _dragDeltaY = 0;

    // preload: نحفظ blob URLs مؤقتاً { index -> objectURL }
    static _preloadCache = new Map();
    static _preloadControllers = new Map(); // AbortController لكل طلب

    // ========== تسجيل الفيديوهات ==========
    static setPlaylist(items) {
        VideoModal._playlist = items;
        // امسح الـ preload cache القديم عند تحميل بيانات جديدة
        VideoModal._clearPreloadCache();
    }

    static _clearPreloadCache() {
        VideoModal._preloadCache.forEach(url => {
            try { URL.revokeObjectURL(url); } catch {}
        });
        VideoModal._preloadCache.clear();
        VideoModal._preloadControllers.forEach(ctrl => {
            try { ctrl.abort(); } catch {}
        });
        VideoModal._preloadControllers.clear();
    }

    // ========== Preload الفيديو التالي والسابق في الخلفية ==========
    static _preloadAround(index) {
        const targets = [index + 1, index - 1].filter(
            i => i >= 0 && i < VideoModal._playlist.length && !VideoModal._preloadCache.has(i)
        );
        for (const i of targets) {
            const url = VideoModal._playlist[i]?.url;
            if (!url) continue;
            // إلغاء طلب سابق لنفس الـ index لو موجود
            VideoModal._preloadControllers.get(i)?.abort();
            const ctrl = new AbortController();
            VideoModal._preloadControllers.set(i, ctrl);
            fetch(url, { signal: ctrl.signal })
                .then(r => r.blob())
                .then(blob => {
                    if (ctrl.signal.aborted) return;
                    const objUrl = URL.createObjectURL(blob);
                    VideoModal._preloadCache.set(i, objUrl);
                    VideoModal._preloadControllers.delete(i);
                })
                .catch(() => {}); // تجاهل الأخطاء (abort / شبكة)
        }
    }

    // ========== بناء الـ DOM مرة واحدة ==========
    static _build() {
        if (document.getElementById('videoModal')) return;
        const modal = document.createElement('div');
        modal.id = 'videoModal';
        modal.className = 'video-modal-overlay';
        modal.innerHTML = `
            <div class="video-modal-fullscreen" id="videoModalFullscreen">
                <div class="video-modal-topbar">
                    <button id="videoModalBack" class="video-modal-back" aria-label="رجوع">
                        <i class="fas fa-arrow-right"></i>
                    </button>
                    <span id="videoModalTitle" class="video-modal-title"></span>
                    <span id="videoModalCounter" class="video-modal-counter"></span>
                </div>
                <div class="video-modal-body" id="videoModalBody">

                    <!-- Skeleton shimmer يظهر ريثما يتحمّل الفيديو -->
                    <div class="video-skeleton" id="videoSkeleton">
                        <div class="video-skeleton-shimmer"></div>
                        <div class="video-skeleton-icon"><i class="fas fa-film"></i></div>
                    </div>

                    <!-- Spinner + نسبة تحميل -->
                    <div class="video-loader" id="videoLoader">
                        <svg class="video-spinner" viewBox="0 0 44 44">
                            <circle class="video-spinner-track" cx="22" cy="22" r="18" fill="none" stroke-width="3"/>
                            <circle class="video-spinner-fill" id="videoSpinnerFill" cx="22" cy="22" r="18" fill="none" stroke-width="3"
                                stroke-dasharray="113" stroke-dashoffset="113"/>
                        </svg>
                        <span class="video-loader-pct" id="videoLoaderPct">0%</span>
                    </div>

                    <video id="videoModalPlayer" class="video-player" playsinline></video>

                    <!-- مؤشرات السحب -->
                    <div class="swipe-hint swipe-hint-up" id="swipeHintUp">
                        <i class="fas fa-chevron-up"></i>
                        <span id="swipeHintUpTitle"></span>
                    </div>
                    <div class="swipe-hint swipe-hint-down" id="swipeHintDown">
                        <i class="fas fa-chevron-down"></i>
                        <span id="swipeHintDownTitle"></span>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // أضف controls بعد الـ append لتجنّب مشكلة iOS مع autoplay
        document.getElementById('videoModalPlayer').setAttribute('controls', '');

        document.getElementById('videoModalBack').addEventListener('click', () => VideoModal.close());

        document.addEventListener('keydown', (e) => {
            if (!document.getElementById('videoModal')?.classList.contains('open')) return;
            if (e.key === 'Escape')    VideoModal.close();
            if (e.key === 'ArrowDown') VideoModal._goTo(VideoModal._currentIndex + 1);
            if (e.key === 'ArrowUp')   VideoModal._goTo(VideoModal._currentIndex - 1);
        });

        window.addEventListener('popstate', () => {
            if (VideoModal._historyPushed) {
                VideoModal._historyPushed = false;
                VideoModal.close(true);
            }
        });

        // ========== أحداث الفيديو: skeleton / loader / play ==========
        const player = document.getElementById('videoModalPlayer');

        player.addEventListener('waiting',  () => VideoModal._showLoader());
        player.addEventListener('stalled',  () => VideoModal._showLoader());
        player.addEventListener('loadstart',() => VideoModal._showSkeleton());

        player.addEventListener('canplay', () => {
            VideoModal._hideSkeleton();
            VideoModal._hideLoader();
        });
        player.addEventListener('playing', () => {
            VideoModal._hideSkeleton();
            VideoModal._hideLoader();
        });

        // تتبع نسبة التحميل عبر buffered
        player.addEventListener('progress', () => VideoModal._updateProgress(player));
        player.addEventListener('timeupdate', () => VideoModal._updateProgress(player));

        // ========== Touch swipe ==========
        const body = document.getElementById('videoModalBody');

        body.addEventListener('touchstart', (e) => {
            VideoModal._touchStartY = e.touches[0].clientY;
            VideoModal._touchStartX = e.touches[0].clientX;
            VideoModal._isDragging = true;
            VideoModal._dragDeltaY = 0;
        }, { passive: true });

        body.addEventListener('touchmove', (e) => {
            if (!VideoModal._isDragging) return;
            const dy = e.touches[0].clientY - VideoModal._touchStartY;
            const dx = e.touches[0].clientX - VideoModal._touchStartX;
            if (Math.abs(dx) > Math.abs(dy)) return;
            VideoModal._dragDeltaY = dy;
            const fs = document.getElementById('videoModalFullscreen');
            if (fs) fs.style.transform = `translateY(${dy * 0.18}px)`;
            VideoModal._updateSwipeHints(dy);
        }, { passive: true });

        body.addEventListener('touchend', () => {
            if (!VideoModal._isDragging) return;
            VideoModal._isDragging = false;
            const fs = document.getElementById('videoModalFullscreen');
            if (fs) fs.style.transform = '';
            const THRESHOLD = 80;
            if      (VideoModal._dragDeltaY < -THRESHOLD) VideoModal._goTo(VideoModal._currentIndex + 1);
            else if (VideoModal._dragDeltaY >  THRESHOLD) VideoModal._goTo(VideoModal._currentIndex - 1);
            VideoModal._hideSwipeHints();
            VideoModal._dragDeltaY = 0;
        }, { passive: true });

        VideoModal._el = modal;
    }

    // ========== Skeleton ==========
    static _showSkeleton() {
        const sk = document.getElementById('videoSkeleton');
        const pl = document.getElementById('videoModalPlayer');
        if (sk) sk.style.display = 'flex';
        if (pl) pl.style.opacity = '0';
        VideoModal._resetProgress();
    }
    static _hideSkeleton() {
        const sk = document.getElementById('videoSkeleton');
        const pl = document.getElementById('videoModalPlayer');
        if (sk) sk.style.display = 'none';
        if (pl) pl.style.opacity = '1';
    }

    // ========== Loader / Spinner ==========
    static _showLoader() {
        const ld = document.getElementById('videoLoader');
        if (ld) ld.style.display = 'flex';
    }
    static _hideLoader() {
        const ld = document.getElementById('videoLoader');
        if (ld) ld.style.display = 'none';
    }
    static _resetProgress() {
        const fill = document.getElementById('videoSpinnerFill');
        const pct  = document.getElementById('videoLoaderPct');
        if (fill) fill.style.strokeDashoffset = '113';
        if (pct)  pct.textContent = '0%';
        VideoModal._hideLoader();
    }
    static _updateProgress(player) {
        if (!player.duration || player.duration === Infinity) return;
        const buffered = player.buffered;
        if (!buffered.length) return;
        const loaded = buffered.end(buffered.length - 1) / player.duration;
        const pctVal = Math.round(loaded * 100);
        // أظهر الـ loader فقط إذا كان التحميل لسه ناقصاً
        if (pctVal < 95) {
            VideoModal._showLoader();
            const CIRCUMFERENCE = 113;
            const offset = CIRCUMFERENCE * (1 - loaded);
            const fill = document.getElementById('videoSpinnerFill');
            const pct  = document.getElementById('videoLoaderPct');
            if (fill) fill.style.strokeDashoffset = offset.toString();
            if (pct)  pct.textContent = `${pctVal}%`;
        } else {
            VideoModal._hideLoader();
        }
    }

    // ========== Swipe hints ==========
    static _updateSwipeHints(dy) {
        const hintUp   = document.getElementById('swipeHintUp');
        const hintDown = document.getElementById('swipeHintDown');
        const SHOW_AFTER = 30;
        if (!hintUp || !hintDown) return;
        if (dy < -SHOW_AFTER) {
            const next = VideoModal._playlist[VideoModal._currentIndex + 1];
            hintUp.style.opacity = Math.min(1, (-dy - SHOW_AFTER) / 60).toString();
            const t = document.getElementById('swipeHintUpTitle');
            if (t) t.textContent = next ? next.title : '';
            hintDown.style.opacity = '0';
        } else if (dy > SHOW_AFTER) {
            const prev = VideoModal._playlist[VideoModal._currentIndex - 1];
            hintDown.style.opacity = Math.min(1, (dy - SHOW_AFTER) / 60).toString();
            const t = document.getElementById('swipeHintDownTitle');
            if (t) t.textContent = prev ? prev.title : '';
            hintUp.style.opacity = '0';
        } else {
            VideoModal._hideSwipeHints();
        }
    }
    static _hideSwipeHints() {
        const hintUp   = document.getElementById('swipeHintUp');
        const hintDown = document.getElementById('swipeHintDown');
        if (hintUp)   hintUp.style.opacity   = '0';
        if (hintDown) hintDown.style.opacity = '0';
    }

    // ========== التنقل ==========
    static _goTo(index) {
        const list = VideoModal._playlist;
        if (index < 0 || index >= list.length) return;
        VideoModal._currentIndex = index;
        const item    = list[index];
        const player  = document.getElementById('videoModalPlayer');
        const titleEl = document.getElementById('videoModalTitle');
        const counter = document.getElementById('videoModalCounter');

        const fs = document.getElementById('videoModalFullscreen');
        if (fs) {
            fs.classList.add('video-transitioning');
            setTimeout(() => fs.classList.remove('video-transitioning'), 320);
        }

        if (titleEl) titleEl.textContent = item.title;
        if (counter) counter.textContent = `${index + 1} / ${list.length}`;

        if (player) {
            player.pause();
            // استخدم blob URL المحمّل مسبقاً لو متاح
            const cached = VideoModal._preloadCache.get(index);
            player.src = cached || item.url;
            player.load();
            player.play().catch(() => {});
        }

        VideoModal._updateNavHints();
        // حمّل الفيديوهات المجاورة في الخلفية
        VideoModal._preloadAround(index);
    }

    static _updateNavHints() {
        const hintUp   = document.getElementById('swipeHintUp');
        const hintDown = document.getElementById('swipeHintDown');
        const i   = VideoModal._currentIndex;
        const len = VideoModal._playlist.length;
        if (hintUp)   hintUp.style.display   = i < len - 1 ? 'flex' : 'none';
        if (hintDown) hintDown.style.display = i > 0       ? 'flex' : 'none';
        VideoModal._hideSwipeHints();
    }

    // ========== open / close ==========
    static open(videoUrl, title = '', playlist = null) {
        VideoModal._build();

        if (playlist) VideoModal._playlist = playlist;

        const idx = VideoModal._playlist.findIndex(v => v.url === videoUrl);
        VideoModal._currentIndex = idx >= 0 ? idx : 0;

        if (VideoModal._playlist.length === 0) {
            VideoModal._playlist = [{ url: videoUrl, title }];
            VideoModal._currentIndex = 0;
        }

        const modal   = document.getElementById('videoModal');
        const player  = document.getElementById('videoModalPlayer');
        const titleEl = document.getElementById('videoModalTitle');
        const counter = document.getElementById('videoModalCounter');

        if (titleEl) titleEl.textContent = title;
        if (counter) counter.textContent = VideoModal._playlist.length > 1
            ? `${VideoModal._currentIndex + 1} / ${VideoModal._playlist.length}`
            : '';

        VideoModal._showSkeleton();

        const cached = VideoModal._preloadCache.get(VideoModal._currentIndex);
        player.src = cached || videoUrl;
        player.load();
        modal.classList.add('open');

        history.pushState({ videoModal: true }, '', location.href);
        VideoModal._historyPushed = true;

        player.play().catch(() => {});
        document.body.style.overflow = 'hidden';
        VideoModal._updateNavHints();
        VideoModal._preloadAround(VideoModal._currentIndex);
    }

    static close(fromPopstate = false) {
        const modal  = document.getElementById('videoModal');
        const player = document.getElementById('videoModalPlayer');
        if (!modal || !modal.classList.contains('open')) return;

        modal.classList.remove('open');
        if (player) { player.pause(); player.src = ''; }
        VideoModal._hideSkeleton();
        VideoModal._hideLoader();
        document.body.style.overflow = '';

        if (!fromPopstate && VideoModal._historyPushed) {
            VideoModal._historyPushed = false;
            history.back();
        }
    }
}
