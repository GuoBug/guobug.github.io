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

    // 5. Neo-Brutalism Image Lightbox Modal
    const articleImages = document.querySelectorAll('.medium-body-text img, .post-content img');

    if (articleImages.length > 0) {
        let overlay = document.getElementById('neoLightbox');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'neoLightbox';
            overlay.className = 'neo-lightbox-overlay';
            overlay.setAttribute('aria-hidden', 'true');
            overlay.innerHTML = `
                <button type="button" class="neo-lightbox-close" id="neoLightboxClose" aria-label="关闭">[关闭 ✕]</button>
                <div class="neo-lightbox-content">
                    <img class="neo-lightbox-img" id="neoLightboxImg" src="" alt="">
                    <div class="neo-lightbox-caption" id="neoLightboxCaption"></div>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        const lightboxImg = document.getElementById('neoLightboxImg');
        const lightboxCaption = document.getElementById('neoLightboxCaption');

        function openLightbox(src, alt) {
            if (!src) return;
            lightboxImg.src = src;
            lightboxImg.alt = alt || '';
            if (alt) {
                lightboxCaption.textContent = alt;
                lightboxCaption.style.display = 'block';
            } else {
                lightboxCaption.style.display = 'none';
            }
            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }

        function closeLightbox() {
            overlay.classList.remove('active');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            setTimeout(() => {
                if (!overlay.classList.contains('active')) {
                    lightboxImg.src = '';
                }
            }, 220);
        }

        articleImages.forEach(img => {
            img.addEventListener('click', function (e) {
                e.stopPropagation();
                openLightbox(this.currentSrc || this.src, this.alt);
            });
        });

        // Click anywhere within screen (overlay, image, close button) closes it
        overlay.addEventListener('click', function () {
            closeLightbox();
        });

        // Escape key to close
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlay.classList.contains('active')) {
                closeLightbox();
            }
        });
    }
})();
