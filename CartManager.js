import { CONFIG } from './config.js';

export class CartManager {
    constructor(targetNumber, onUpdate) {
        this.targetNumber = targetNumber;
        this.onUpdate = onUpdate;
        this.items = new Map();
        this.totalQuantity = 0;
        this.totalPrice = 0;
        this.removeItemCallback = null;
        this.loadFromStorage();
    }

    loadFromStorage() {
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.CART);
            if (saved) {
                const parsed = JSON.parse(saved);
                this.items.clear();
                for (const [name, data] of Object.entries(parsed)) {
                    // التحقق من صحة البيانات قبل الإضافة
                    if (data && typeof data.quantity === 'number' && typeof data.price === 'number') {
                        this.items.set(name, {
                            quantity: data.quantity,
                            price: data.price,
                            imageUrl: data.imageUrl || null
                        });
                    }
                }
                this.recalculateTotals();
            }
        } catch (e) {
            console.warn('[CartManager] loadFromStorage error', e);
        }
    }

    saveToStorage() {
        const obj = {};
        for (const [name, data] of this.items.entries()) {
            obj[name] = data;
        }
        localStorage.setItem(CONFIG.STORAGE_KEYS.CART, JSON.stringify(obj));
    }

    recalculateTotals() {
        this.totalQuantity = 0;
        this.totalPrice = 0;
        for (const data of this.items.values()) {
            this.totalQuantity += data.quantity;
            this.totalPrice += data.quantity * data.price;
        }
        if (this.onUpdate) {
            this.onUpdate(this.totalQuantity, this.totalPrice);
        }
    }

    updateItem(name, quantity, price, imageUrl) {
        if (quantity <= 0) {
            this.items.delete(name);
        } else {
            this.items.set(name, { quantity, price, imageUrl });
        }
        this.saveToStorage();
        this.recalculateTotals();
        if (this.removeItemCallback && quantity === 0) {
            this.removeItemCallback(name);
        }
    }

    removeItem(name) {
        if (this.items.has(name)) {
            this.items.delete(name);
            this.saveToStorage();
            this.recalculateTotals();
            if (this.removeItemCallback) {
                this.removeItemCallback(name);
            }
        }
    }

    getCartItems() {
        return Array.from(this.items.entries()).map(([name, data]) => ({
            name,
            quantity: data.quantity,
            price: data.price,
            imageUrl: data.imageUrl
        }));
    }

    setRemoveItemCallback(cb) {
        this.removeItemCallback = cb;
    }

    getItemQuantity(productName) {
        const item = this.items.get(productName);
        return item ? item.quantity : 0;
    }
}
