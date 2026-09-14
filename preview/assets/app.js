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
                    ? '关于我 · Gu0 Qiang | 资深技术产品经理'
                    : 'About · Gu0 Qiang | Product Manager & Designer';
            } else if (path.includes('/posts')) {
                document.title = activeLang === 'zh'
                    ? '文章归档 · Gu0 Qiang'
                    : 'Writings · Gu0 Qiang';
            } else {
                document.title = activeLang === 'zh'
                    ? 'Gu0 Qiang · 资深技术产品经理 · 工作空间'
                    : 'Gu0 Qiang · Technology Product Manager · Workspace';
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

    // 5. Neo-Brutalist Parallax Scrolling Engine (Preview Experiment)
    (function initParallaxEngine() {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return;
        }

        const hudProgress = document.getElementById('hudProgressBar');
        const hudIndicator = document.getElementById('hudIndicator');
        const hudPercent = document.getElementById('hudScrollPercent');
        const bgMesh = document.getElementById('parallaxBgMesh');
        const heroSection = document.getElementById('hero');
        const heroLayers = document.querySelectorAll('.parallax-hero .parallax-layer');
        const marquees = document.querySelectorAll('.parallax-marquee');
        const vibeCards = document.querySelectorAll('.vibe-card.parallax-card');

        let lastScrollY = window.pageYOffset || document.documentElement.scrollTop;
        let ticking = false;
        let scrollVelocity = 0;
        let marqueeOffset = 0;

        function updateParallax() {
            const scrollY = window.pageYOffset || document.documentElement.scrollTop;
            const docHeight = document.documentElement.scrollHeight;
            const winHeight = window.innerHeight;
            const maxScroll = docHeight - winHeight;

            // 1. HUD Scroll Progress & Top Nav Sticky Elevation
            if (maxScroll > 0) {
                const percent = Math.min(100, Math.max(0, (scrollY / maxScroll) * 100));
                if (hudProgress) hudProgress.style.width = percent + '%';
                if (hudPercent) hudPercent.textContent = Math.round(percent).toString().padStart(2, '0') + '%';
                if (hudIndicator) {
                    if (scrollY > 90) {
                        hudIndicator.classList.add('active');
                    } else {
                        hudIndicator.classList.remove('active');
                    }
                }
            }

            const topNav = document.querySelector('.top-nav');
            if (topNav) {
                if (scrollY > 12) {
                    topNav.classList.add('is-scrolled');
                } else {
                    topNav.classList.remove('is-scrolled');
                }
            }

            // 2. Background Dot Mesh Drift
            if (bgMesh) {
                const meshY = (scrollY * 0.12);
                bgMesh.style.transform = `translate3d(0, ${-meshY}px, 0)`;
            }

            // 3. Hero Layered Parallax
            if (heroSection) {
                const heroHeight = heroSection.offsetHeight || 600;
                if (scrollY <= heroHeight + 100) {
                    heroLayers.forEach(layer => {
                        const depth = parseFloat(layer.getAttribute('data-depth')) || 0.1;
                        const y = -scrollY * depth * 1.5;
                        const opacity = Math.max(0, 1 - (scrollY / (heroHeight * 0.95)));
                        layer.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
                        layer.style.opacity = opacity.toFixed(3);
                    });
                }
            }

            // 4. Kinetic Marquee Momentum
            const deltaY = scrollY - lastScrollY;
            scrollVelocity = scrollVelocity * 0.82 + deltaY * 0.18;
            marqueeOffset += scrollVelocity * 0.6;
            if (Math.abs(marqueeOffset) > 200) marqueeOffset = Math.sign(marqueeOffset) * 200;

            marquees.forEach(mq => {
                const speedAttr = parseFloat(mq.getAttribute('data-speed')) || 1;
                const track = mq.querySelector('.marquee-track');
                if (track) {
                    const shiftX = (marqueeOffset * speedAttr).toFixed(1);
                    track.style.transform = `translate3d(${shiftX}px, 0, 0)`;
                }
            });

            // 5. Vibe Card Image Inner Parallax
            vibeCards.forEach(card => {
                const rect = card.getBoundingClientRect();
                if (rect.top < winHeight && rect.bottom > 0) {
                    const cardCenter = rect.top + rect.height / 2;
                    const viewportCenter = winHeight / 2;
                    const offsetFromCenter = (cardCenter - viewportCenter) / winHeight;
                    const imgParallaxY = (offsetFromCenter * 24).toFixed(1);
                    card.style.setProperty('--card-parallax-y', `${imgParallaxY}px`);
                }
            });

            lastScrollY = scrollY;
            ticking = false;
        }

        function onScroll() {
            if (!ticking) {
                requestAnimationFrame(updateParallax);
                ticking = true;
            }
        }

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        updateParallax();

        // 6. Interactive 3D Card Tilt on Desktop (Pointer Fine)
        if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
            vibeCards.forEach(card => {
                let rafId = null;

                card.addEventListener('mousemove', (e) => {
                    const rect = card.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;

                    const rotateX = (((y - centerY) / centerY) * -6).toFixed(2);
                    const rotateY = (((x - centerX) / centerX) * 6).toFixed(2);

                    if (rafId) cancelAnimationFrame(rafId);
                    rafId = requestAnimationFrame(() => {
                        card.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translate3d(0, -3px, 8px)`;
                        card.style.boxShadow = `${8 - parseFloat(rotateY)}px ${8 + parseFloat(rotateX)}px 0px #000000`;
                    });
                });

                card.addEventListener('mouseleave', () => {
                    if (rafId) cancelAnimationFrame(rafId);
                    card.style.transform = '';
                    card.style.boxShadow = '';
                });
            });
        }
    })();
})();
