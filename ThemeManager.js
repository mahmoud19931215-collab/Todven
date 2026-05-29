import { CONFIG } from './config.js';

export class ThemeManager {
    constructor() {
        this.body = document.body;
        this.currentTheme = this.loadTheme();
        this.dayElements = document.querySelector('.day-scene');
        this.nightElements = document.querySelector('.night-scene');
        this.themeToggleBtn = document.getElementById('themeToggle');
        this.themeIcon = this.themeToggleBtn?.querySelector('i');
        
        // عناصر إضافية للتأثيرات
        this.metaThemeColor = document.querySelector('meta[name="theme-color"]');
        
        this.applyTheme(this.currentTheme);
        this.initEventListeners();
        
        // مراقبة تغيير تفضيل النظام
        this.watchSystemPreference();
    }

    loadTheme() {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.THEME);
        if (saved === 'dark' || saved === 'light') return saved;
        
        // التحقق من تفضيل النظام
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        return prefersDark ? 'dark' : CONFIG.DEFAULT_THEME || 'light';
    }

    saveTheme(theme) {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, theme);
        } catch (e) {
            console.warn('Failed to save theme preference', e);
        }
    }

    applyTheme(theme) {
        this.currentTheme = theme;
        
        // تطبيق الثيم على الـ body
        if (theme === 'dark') {
            this.body.setAttribute('data-theme', 'dark');
            if (this.dayElements) this.dayElements.style.display = 'none';
            if (this.nightElements) this.nightElements.style.display = 'block';
            if (this.themeIcon) {
                this.themeIcon.classList.remove('fa-moon');
                this.themeIcon.classList.add('fa-sun');
            }
            // تغيير لون شريط العنوان في المتصفحات المدعومة
            if (this.metaThemeColor) {
                this.metaThemeColor.setAttribute('content', '#0f172a');
            }
        } else {
            this.body.setAttribute('data-theme', 'light');
            if (this.dayElements) this.dayElements.style.display = 'block';
            if (this.nightElements) this.nightElements.style.display = 'none';
            if (this.themeIcon) {
                this.themeIcon.classList.remove('fa-sun');
                this.themeIcon.classList.add('fa-moon');
            }
            if (this.metaThemeColor) {
                this.metaThemeColor.setAttribute('content', '#10b981');
            }
        }
        
        this.saveTheme(theme);
        
        // إضافة تأثير انتقالي للثيم
        this.body.style.transition = 'background-color 0.3s ease, color 0.2s ease';
        setTimeout(() => {
            this.body.style.transition = '';
        }, 300);
        
        // تفعيل حدث مخصص للإعلام بتغيير الثيم
        const event = new CustomEvent('themeChanged', { detail: { theme } });
        window.dispatchEvent(event);
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.applyTheme(newTheme);
        
        // إضافة تأثير اهتزاز للزر
        if (this.themeToggleBtn) {
            this.themeToggleBtn.style.transform = 'scale(0.9)';
            setTimeout(() => {
                this.themeToggleBtn.style.transform = '';
            }, 150);
        }
    }

    initEventListeners() {
        if (this.themeToggleBtn) {
            this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
        }
    }

    watchSystemPreference() {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e) => {
            // فقط إذا لم يكن المستخدم قد حفظ تفضيلاً مسبقاً
            const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.THEME);
            if (!saved) {
                const newTheme = e.matches ? 'dark' : 'light';
                this.applyTheme(newTheme);
            }
        };
        
        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handleChange);
        } else if (mediaQuery.addListener) {
            mediaQuery.addListener(handleChange);
        }
    }
    
    // دالة للحصول على الثيم الحالي
    getCurrentTheme() {
        return this.currentTheme;
    }
    
    // دالة للتبديل مع تأثير إضافي
    toggleWithAnimation() {
        this.toggleTheme();
        // يمكن إضافة تأثير إضافي مثل وميض الشاشة
        const flash = document.createElement('div');
        flash.style.position = 'fixed';
        flash.style.top = 0;
        flash.style.left = 0;
        flash.style.width = '100%';
        flash.style.height = '100%';
        flash.style.backgroundColor = this.currentTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
        flash.style.pointerEvents = 'none';
        flash.style.zIndex = 9999;
        flash.style.opacity = 0;
        flash.style.transition = 'opacity 0.2s';
        document.body.appendChild(flash);
        
        setTimeout(() => { flash.style.opacity = 1; }, 10);
        setTimeout(() => { flash.style.opacity = 0; }, 150);
        setTimeout(() => { flash.remove(); }, 400);
    }
}
