/**
 * Neo-Brutalism Portfolio Client Script - GuoBug Preview
 */

(function () {
    'use strict';

    // 1. Bilingual Language Switcher & URL State Sync
    function getUrlLang() {
        try {
            const params = new URLSearchParams(window.location.search);
            const lang = params.get('lang');
            if (lang === 'zh' || lang === 'en') {
                return lang;
            }
        } catch (e) {}
        return null;
    }

    function updateDocumentTitle(activeLang) {
        const titleEl = document.querySelector('title');
        if (!titleEl) return;
        const zhTitle = titleEl.getAttribute('data-title-zh');
        const enTitle = titleEl.getAttribute('data-title-en');
        if (activeLang === 'zh' && zhTitle) {
            document.title = zhTitle;
        } else if (activeLang === 'en' && enTitle) {
            document.title = enTitle;
        } else if (!zhTitle && !enTitle) {
            const path = window.location.pathname;
            if (path.includes('/about')) {
                document.title = activeLang === 'zh'
                    ? '关于我 · Gu0 Qiang | Product Engineer'
                    : 'About · Gu0 Qiang | Product Engineer';
            } else if (path.includes('/posts')) {
                document.title = activeLang === 'zh'
                    ? '文章归档 · Gu0 Qiang'
                    : 'Writings · Gu0 Qiang';
            } else {
                document.title = activeLang === 'zh'
                    ? 'Gu0 Qiang · Product Engineer · 工作空间'
                    : 'Gu0 Qiang · Product Engineer · Workspace';
            }
        }
    }

    function syncInternalLinks(activeLang) {
        const links = document.querySelectorAll('a[href]');
        links.forEach(link => {
            const href = link.getAttribute('href');
            if (!href) return;
            if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#') || href.startsWith('javascript:')) {
                return;
            }
            try {
                const url = new URL(link.href, window.location.href);
                if (url.origin === window.location.origin) {
                    url.searchParams.set('lang', activeLang);
                    link.href = url.pathname + url.search + url.hash;
                }
            } catch (e) {}
        });
    }

    function setLanguage(lang, updateUrl) {
        if (updateUrl === undefined) updateUrl = true;
        const activeLang = lang === 'zh' ? 'zh' : 'en';
        document.documentElement.setAttribute('data-lang', activeLang);
        document.documentElement.setAttribute('lang', activeLang === 'en' ? 'en' : 'zh-CN');
        localStorage.setItem('guobug_lang', activeLang);

        document.querySelectorAll('.lang-btn').forEach(btn => {
            if (btn.getAttribute('data-lang-btn') === activeLang) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update document title dynamically
        updateDocumentTitle(activeLang);

        // Sync URL query param without reload
        if (updateUrl && window.history && window.history.replaceState) {
            try {
                const url = new URL(window.location.href);
                url.searchParams.set('lang', activeLang);
                window.history.replaceState(null, '', url.pathname + url.search + url.hash);
            } catch (e) {}
        }

        // Sync internal page links
        syncInternalLinks(activeLang);
    }

    // Attach click listeners to language buttons
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const targetLang = this.getAttribute('data-lang-btn');
            setLanguage(targetLang, true);
        });
    });

    // Handle browser Back/Forward navigation
    window.addEventListener('popstate', function () {
        const urlLang = getUrlLang();
        if (urlLang && urlLang !== document.documentElement.getAttribute('data-lang')) {
            setLanguage(urlLang, false);
        }
    });

    // Initialize Language (URL parameter has highest precedence, then localStorage, default 'en')
    const INITIAL_LANG = getUrlLang() || localStorage.getItem('guobug_lang') || 'en';
    setLanguage(INITIAL_LANG, true);

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

    // 3. Smooth Active Link Observer & Top Nav Elevation
    const sections = document.querySelectorAll('section[id], header[id]');
    const navLinks = document.querySelectorAll('.nav-links .nav-link');
    const topNav = document.querySelector('.top-nav');

    function handleScroll() {
        const scrollY = window.pageYOffset || window.scrollY || document.documentElement.scrollTop;

        // Sticky Navigation Elevation Shadow
        if (topNav) {
            if (scrollY > 12) {
                topNav.classList.add('is-scrolled');
            } else {
                topNav.classList.remove('is-scrolled');
            }
        }

        let currentSectionId = '';
        const scrollPosition = scrollY + 160;

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
    handleScroll();

    // 4. Code Block Copy & Terminal Enhancer (Auto decorate all markdown code blocks)
    function enhanceAllCodeBlocks() {
        const articleBodies = document.querySelectorAll('.medium-body-text, .post-content-body, article');
        if (articleBodies.length === 0) return;

        articleBodies.forEach(body => {
            const containers = body.querySelectorAll('.highlighter-rouge, pre');
            containers.forEach(block => {
                // If it's a pre inside .highlighter-rouge or already wrapped in .neo-code-block, skip
                if (block.tagName === 'PRE' && (block.closest('.highlighter-rouge') || block.closest('.neo-code-block'))) {
                    return;
                }

                // If already enhanced or has header bar inside or as previous sibling, skip
                if (block.querySelector('.code-header-bar') || block.classList.contains('neo-code-block') || block.previousElementSibling?.classList.contains('code-header-bar')) {
                    return;
                }

                // Skip mermaid diagrams from code-block decoration
                const fullClassStr = (block.className || '') + ' ' + (block.querySelector('pre, code')?.className || '');
                if (fullClassStr.includes('language-mermaid') || fullClassStr.includes('mermaid')) {
                    return;
                }

                const pre = block.tagName === 'PRE' ? block : block.querySelector('pre');
                if (!pre || pre.dataset.enhanced === 'true') return;
                pre.dataset.enhanced = 'true';

                // Detect programming language
                let lang = 'CODE';
                const match = fullClassStr.match(/language-([a-zA-Z0-9_\-]+)/);
                if (match && match[1]) {
                    lang = match[1].toUpperCase();
                }

                // Build header bar
                const header = document.createElement('div');
                header.className = 'code-header-bar';
                header.innerHTML = `
                    <div class="code-window-dots">
                        <span class="code-dot red"></span>
                        <span class="code-dot yellow"></span>
                        <span class="code-dot green"></span>
                    </div>
                    <span class="code-lang-label">${lang}</span>
                    <button type="button" class="code-copy-btn">
                        <span>⎘</span> <span>COPY</span>
                    </button>
                `;

                if (block.tagName === 'PRE') {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'neo-code-block';
                    block.parentNode.insertBefore(wrapper, block);
                    wrapper.appendChild(header);
                    wrapper.appendChild(block);
                } else {
                    block.insertBefore(header, block.firstChild);
                }

                // Attach copy handler
                const copyBtn = header.querySelector('.code-copy-btn');
                if (copyBtn) {
                    copyBtn.addEventListener('click', function () {
                        const codeEl = pre.querySelector('code') || pre;
                        const textToCopy = codeEl.innerText;
                        navigator.clipboard.writeText(textToCopy).then(() => {
                            const originalHtml = copyBtn.innerHTML;
                            copyBtn.innerHTML = '<span>✓</span> <span>COPIED!</span>';
                            copyBtn.style.backgroundColor = '#7fff00';
                            copyBtn.style.color = '#000000';
                            setTimeout(() => {
                                copyBtn.innerHTML = originalHtml;
                                copyBtn.style.backgroundColor = '';
                                copyBtn.style.color = '';
                            }, 2000);
                        });
                    });
                }
            });
        });

        // Trigger Prism syntax highlighting if available
        if (window.Prism && typeof window.Prism.highlightAll === 'function') {
            window.Prism.highlightAll();
        }
    }

    enhanceAllCodeBlocks();
    window.addEventListener('DOMContentLoaded', enhanceAllCodeBlocks);

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
