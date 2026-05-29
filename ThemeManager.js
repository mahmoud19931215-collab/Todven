import { CONFIG } from './config.js';

export class ThemeManager {
    constructor() {
        this.body = document.body;
        this.currentTheme = this.loadTheme();
        this.dayElements = document.querySelector('.day-scene');
        this.nightElements = document.querySelector('.night-scene');
        this.themeToggleBtn = document.getElementById('themeToggle');
        this.themeIcon = this.themeToggleBtn?.querySelector('i');
        this.metaThemeColor = document.querySelector('meta[name="theme-color"]');
        this.applyTheme(this.currentTheme);
        this.initEventListeners();
        this.watchSystemPreference();
    }

    loadTheme() {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.THEME);
        if (saved === 'dark' || saved === 'light') return saved;
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        return prefersDark ? 'dark' : (CONFIG.DEFAULT_THEME || 'light');
    }

    saveTheme(theme) {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, theme);
        } catch(e) {}
    }

    applyTheme(theme) {
        this.currentTheme = theme;
        if (theme === 'dark') {
            this.body.setAttribute('data-theme', 'dark');
            if (this.dayElements) this.dayElements.style.display = 'none';
            if (this.nightElements) this.nightElements.style.display = 'block';
            if (this.themeIcon) {
                this.themeIcon.classList.remove('fa-moon');
                this.themeIcon.classList.add('fa-sun');
            }
            if (this.metaThemeColor) this.metaThemeColor.setAttribute('content', '#0f172a');
        } else {
            this.body.setAttribute('data-theme', 'light');
            if (this.dayElements) this.dayElements.style.display = 'block';
            if (this.nightElements) this.nightElements.style.display = 'none';
            if (this.themeIcon) {
                this.themeIcon.classList.remove('fa-sun');
                this.themeIcon.classList.add('fa-moon');
            }
            if (this.metaThemeColor) this.metaThemeColor.setAttribute('content', '#10b981');
        }
        this.saveTheme(theme);
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.applyTheme(newTheme);
        if (this.themeToggleBtn) {
            this.themeToggleBtn.style.transform = 'scale(0.9)';
            setTimeout(() => {
                if (this.themeToggleBtn) this.themeToggleBtn.style.transform = '';
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
            const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.THEME);
            if (!saved) {
                this.applyTheme(e.matches ? 'dark' : 'light');
            }
        };
        mediaQuery.addEventListener('change', handleChange);
    }

    getCurrentTheme() {
        return this.currentTheme;
    }
}
