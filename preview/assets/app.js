/**
 * Neo-Brutalism Portfolio Client Script - Gu0Bug Preview
 */

(function () {
    'use strict';

    // 1. Bilingual Language Switcher (Default: English)
    const DEFAULT_LANG = localStorage.getItem('gu0bug_lang') || 'en';

    function setLanguage(lang) {
        const activeLang = lang === 'en' ? 'en' : 'zh';
        document.documentElement.setAttribute('data-lang', activeLang);
        document.documentElement.setAttribute('lang', activeLang === 'en' ? 'en' : 'zh-CN');
        localStorage.setItem('gu0bug_lang', activeLang);

        document.querySelectorAll('.lang-btn').forEach(btn => {
            if (btn.getAttribute('data-lang-btn') === activeLang) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // Attach click listeners to language buttons
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const targetLang = this.getAttribute('data-lang-btn');
            setLanguage(targetLang);
        });
    });

    // Initialize Language
    setLanguage(DEFAULT_LANG);

    // 2. Mobile Navigation Toggle
    const menuBtn = document.getElementById('menuToggleBtn');
    const mobileDrawer = document.getElementById('mobileNavDrawer');

    if (menuBtn && mobileDrawer) {
        menuBtn.addEventListener('click', function () {
            const isOpen = mobileDrawer.classList.toggle('open');
            menuBtn.textContent = isOpen ? '[CLOSE]' : '[MENU]';
        });

        mobileDrawer.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                mobileDrawer.classList.remove('open');
                menuBtn.textContent = '[MENU]';
            });
        });
    }

    // 3. Smooth Active Link Observer
    const sections = document.querySelectorAll('section[id], header[id]');
    const navLinks = document.querySelectorAll('.nav-links .nav-link');

    function handleScroll() {
        let currentSectionId = '';
        const scrollPosition = window.scrollY + 160;

        sections.forEach(section => {
            const top = section.offsetTop;
            const height = section.offsetHeight;
            if (scrollPosition >= top && scrollPosition < top + height) {
                currentSectionId = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href === `#${currentSectionId}`) {
                link.classList.add('active-nav');
            } else {
                link.classList.remove('active-nav');
            }
        });
    }

    window.addEventListener('scroll', handleScroll, { passive: true });

    // 4. Code Block Copy & Terminal Enhancer
    document.querySelectorAll('.code-copy-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const container = this.closest('.neo-code-block') || this.parentElement.parentElement;
            const codeEl = container.querySelector('pre code') || container.querySelector('pre');
            if (codeEl) {
                const textToCopy = codeEl.innerText;
                navigator.clipboard.writeText(textToCopy).then(() => {
                    const originalText = this.innerHTML;
                    this.innerHTML = 'COPIED! ✓';
                    this.style.backgroundColor = '#7fff00';
                    this.style.color = '#000000';
                    setTimeout(() => {
                        this.innerHTML = originalText;
                        this.style.backgroundColor = '';
                        this.style.color = '';
                    }, 2000);
                });
            }
        });
    });
})();
