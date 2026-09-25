/**
 * Neo-Brutalism Portfolio Client Script - GuoBug Preview
 *
 * 模块顺序：
 *   1. 可调参数常量
 *   2. 通用工具（安全存储 / 剪贴板 / DOM 辅助）
 *   3. 中英双语切换与 URL 状态同步
 *   4. 移动端抽屉导航
 *   5. 滚动引擎（导航高亮 + 视差，合并为单条 rAF 通道）
 *   6. 代码块增强与复制
 *   7. 图片灯箱
 */

(function () {
    'use strict';

    /* ======================================================================
       1. 可调参数常量
       ====================================================================== */

    var SCROLL_SHADOW_THRESHOLD = 12;    // 导航栏浮现阴影的滚动距离(px)
    var SCROLL_SPY_OFFSET = 160;         // 判定"当前区块"时的视口补偿(px)
    var HUD_INDICATOR_THRESHOLD = 90;    // HUD 指示器激活阈值(px)

    var MESH_DRIFT_FACTOR = 0.12;        // 背景点阵网格随滚动的漂移系数
    var HERO_DEPTH_MULTIPLIER = 1.5;     // Hero 分层位移放大系数
    var HERO_FADE_RATIO = 0.95;          // Hero 淡出所用的高度比例
    var HERO_EXTRA_RANGE = 100;          // Hero 计算范围之外的冗余(px)
    var HERO_FALLBACK_HEIGHT = 600;      // Hero 高度读取失败时的兜底值(px)

    var MARQUEE_DAMPING = 0.82;          // 跑马灯速度惯性衰减
    var MARQUEE_ACCELERATION = 0.18;     // 跑马灯速度增量权重
    var MARQUEE_SHIFT_FACTOR = 0.6;      // 速度到位移的换算系数
    var MARQUEE_MAX_OFFSET = 200;        // 跑马灯位移上限(px)

    var CARD_PARALLAX_RANGE = 24;        // 卡片内部视差最大位移(px)
    var TILT_MAX_DEG = 6;                // 3D 倾斜最大角度(deg)
    var TILT_LIFT_PX = -3;               // 3D 倾斜时的抬升位移(px)
    var TILT_DEPTH_PX = 8;               // 3D 倾斜时的 Z 轴推进(px)
    var TILT_PERSPECTIVE_PX = 900;       // 3D 倾斜的透视距离(px)

    var COPY_FEEDBACK_MS = 2000;         // 复制成功提示持续时间(ms)
    var LIGHTBOX_CLEAR_MS = 220;         // 灯箱关闭后清空 src 的延时(ms)

    var LANG_STORAGE_KEY = 'guobug_lang';
    var DEFAULT_LANG = 'en';

    /* ======================================================================
       2. 通用工具
       ====================================================================== */

    /**
     * localStorage 在隐私模式或配额耗尽时会直接抛异常，
     * 读写都必须兜底，否则会中断后续初始化。
     */
    function readStoredLang() {
        try {
            return window.localStorage.getItem(LANG_STORAGE_KEY);
        } catch (e) {
            return null;
        }
    }

    function writeStoredLang(lang) {
        try {
            window.localStorage.setItem(LANG_STORAGE_KEY, lang);
        } catch (e) {
            /* 存储不可用时静默降级，仅本次会话生效 */
        }
    }

    /**
     * Clipboard API 仅在安全上下文（HTTPS / localhost）可用，
     * 缺失时退回 execCommand，避免直接 TypeError 中断点击。
     */
    function copyTextToClipboard(text) {
        if (window.navigator.clipboard && typeof window.navigator.clipboard.writeText === 'function') {
            return window.navigator.clipboard.writeText(text);
        }

        return new Promise(function (resolve, reject) {
            var textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.top = '-1000px';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();

            var ok = false;
            try {
                ok = document.execCommand('copy');
            } catch (e) {
                ok = false;
            }
            document.body.removeChild(textarea);
            if (ok) {
                resolve();
            } else {
                reject(new Error('copy unavailable'));
            }
        });
    }

    /** 安全取最近的祖先元素：事件目标可能不是 Element（如 document） */
    function closestFrom(node, selector) {
        if (!node || typeof node.closest !== 'function') return null;
        return node.closest(selector);
    }

    function normalizeLang(lang) {
        return lang === 'zh' ? 'zh' : DEFAULT_LANG;
    }

    function toNodeArray(list) {
        return Array.prototype.slice.call(list || []);
    }

    /* ======================================================================
       3. 中英双语切换与 URL 状态同步
       ====================================================================== */

    function getUrlLang() {
        try {
            var lang = new URLSearchParams(window.location.search).get('lang');
            if (lang === 'zh' || lang === DEFAULT_LANG) {
                return lang;
            }
        } catch (e) {
            /* URLSearchParams 不受支持时回退到存储值 */
        }
        return null;
    }

    function fallbackTitleForPath(activeLang) {
        var path = window.location.pathname;
        if (path.indexOf('/about') !== -1) {
            return activeLang === 'zh'
                ? '关于我 · Guo Qiang | Product Engineer'
                : 'About · Guo Qiang | Product Engineer';
        }
        if (path.indexOf('/posts') !== -1) {
            return activeLang === 'zh'
                ? '文章归档 · Guo Qiang'
                : 'Writings · Guo Qiang';
        }
        return activeLang === 'zh'
            ? 'Guo Qiang · Product Engineer · 工作空间'
            : 'Guo Qiang · Product Engineer · Workspace';
    }

    function updateDocumentTitle(activeLang) {
        var titleEl = document.querySelector('title');
        if (!titleEl) return;

        var zhTitle = titleEl.getAttribute('data-title-zh');
        var enTitle = titleEl.getAttribute('data-title-en');

        if (activeLang === 'zh' && zhTitle) {
            document.title = zhTitle;
        } else if (activeLang === DEFAULT_LANG && enTitle) {
            document.title = enTitle;
        } else if (!zhTitle && !enTitle) {
            document.title = fallbackTitleForPath(activeLang);
        }
    }

    function syncInternalLinks(activeLang) {
        toNodeArray(document.querySelectorAll('a[href]')).forEach(function (link) {
            var href = link.getAttribute('href');
            if (!href) return;
            // 外部协议、锚点、脚本链接不参与语言参数同步
            if (/^(https?:|mailto:|tel:|#|javascript:)/.test(href)) return;

            try {
                var url = new URL(link.href, window.location.href);
                if (url.origin === window.location.origin) {
                    url.searchParams.set('lang', activeLang);
                    link.href = url.pathname + url.search + url.hash;
                }
            } catch (e) {
                /* 非法 href 保持原样 */
            }
        });
    }

    function setLanguage(lang, updateUrl) {
        if (updateUrl === undefined) updateUrl = true;
        var activeLang = normalizeLang(lang);

        document.documentElement.setAttribute('data-lang', activeLang);
        document.documentElement.setAttribute('lang', activeLang === 'zh' ? 'zh-CN' : 'en');
        writeStoredLang(activeLang);

        toNodeArray(document.querySelectorAll('.lang-btn')).forEach(function (btn) {
            var matched = btn.getAttribute('data-lang-btn') === activeLang;
            if (matched) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        updateDocumentTitle(activeLang);

        if (updateUrl && window.history && window.history.replaceState) {
            try {
                var url = new URL(window.location.href);
                url.searchParams.set('lang', activeLang);
                window.history.replaceState(null, '', url.pathname + url.search + url.hash);
            } catch (e) {
                /* 不支持 replaceState 时跳过 URL 同步 */
            }
        }

        syncInternalLinks(activeLang);
    }

    toNodeArray(document.querySelectorAll('.lang-btn')).forEach(function (btn) {
        btn.addEventListener('click', function () {
            setLanguage(this.getAttribute('data-lang-btn'), true);
        });
    });

    window.addEventListener('popstate', function () {
        var urlLang = getUrlLang();
        if (urlLang && urlLang !== document.documentElement.getAttribute('data-lang')) {
            setLanguage(urlLang, false);
        }
    });

    // 初始化优先级：URL 参数 > localStorage > 默认英文
    setLanguage(getUrlLang() || readStoredLang() || DEFAULT_LANG, true);

    /* ======================================================================
       4. 移动端抽屉导航
       ====================================================================== */

    (function initMobileNav() {
        var menuBtn = document.getElementById('menuToggleBtn');
        var mobileDrawer = document.getElementById('mobileNavDrawer');
        if (!menuBtn || !mobileDrawer) return;

        function closeDrawer() {
            mobileDrawer.classList.remove('open');
            menuBtn.textContent = '[MENU]';
        }

        menuBtn.addEventListener('click', function () {
            var isOpen = mobileDrawer.classList.toggle('open');
            menuBtn.textContent = isOpen ? '[CLOSE]' : '[MENU]';
        });

        // 事件委托：抽屉内链接数量变化时无需重新绑定
        mobileDrawer.addEventListener('click', function (event) {
            if (closestFrom(event.target, 'a')) {
                closeDrawer();
            }
        });
    })();

    /* ======================================================================
       5. 滚动引擎
       原实现中"导航高亮"与"视差"各注册了一条 scroll 监听，且各自在回调里
       重复读取 offsetTop / offsetHeight / scrollHeight，导致每个滚动事件触发
       多次强制同步布局（layout thrashing），其中高亮那条还没有做 rAF 节流。
       现合并为单条 rAF 通道：每帧只集中读一次几何信息，并把区块位置缓存到
       文档高度变化或窗口尺寸变化为止。
       ====================================================================== */

    (function initScrollEngine() {
        var topNav = document.querySelector('.top-nav');
        var sections = toNodeArray(document.querySelectorAll('section[id], header[id]'));
        var navLinks = toNodeArray(document.querySelectorAll('.nav-links .nav-link'));

        var hudProgress = document.getElementById('hudProgressBar');
        var hudIndicator = document.getElementById('hudIndicator');
        var hudPercent = document.getElementById('hudScrollPercent');
        var bgMesh = document.getElementById('parallaxBgMesh');
        var heroSection = document.getElementById('hero');
        var heroLayers = toNodeArray(document.querySelectorAll('.parallax-hero .parallax-layer'));
        var marquees = toNodeArray(document.querySelectorAll('.parallax-marquee'));
        var vibeCards = toNodeArray(document.querySelectorAll('.vibe-card.parallax-card'));

        var reducedMotion = !!(window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

        var lastScrollY = window.pageYOffset || document.documentElement.scrollTop;
        var marqueeOffset = 0;
        var scrollVelocity = 0;

        var geometry = null;         // 区块几何缓存
        var geometryDocHeight = -1;  // 缓存对应的文档高度，用于失效判定

        function getGeometry(docHeight) {
            if (geometry && docHeight === geometryDocHeight) return geometry;
            geometryDocHeight = docHeight;
            geometry = {
                sections: sections.map(function (section) {
                    return {
                        id: section.getAttribute('id'),
                        top: section.offsetTop,
                        height: section.offsetHeight
                    };
                }),
                heroHeight: heroSection ? (heroSection.offsetHeight || HERO_FALLBACK_HEIGHT) : 0
            };
            return geometry;
        }

        function invalidateGeometry() {
            geometry = null;
        }

        function setNavElevation(scrollY) {
            if (!topNav) return;
            if (scrollY > SCROLL_SHADOW_THRESHOLD) {
                topNav.classList.add('is-scrolled');
            } else {
                topNav.classList.remove('is-scrolled');
            }
        }

        function updateScrollSpy(scrollY, cached) {
            if (navLinks.length === 0) return;

            var scrollPosition = scrollY + SCROLL_SPY_OFFSET;
            var currentSectionId = '';

            cached.sections.forEach(function (section) {
                if (scrollPosition >= section.top && scrollPosition < section.top + section.height) {
                    currentSectionId = section.id;
                }
            });

            navLinks.forEach(function (link) {
                if (link.getAttribute('href') === '#' + currentSectionId) {
                    link.classList.add('active-nav');
                } else {
                    link.classList.remove('active-nav');
                }
            });
        }

        function updateMotion(scrollY, winHeight, docHeight, cached) {
            var maxScroll = docHeight - winHeight;

            // HUD 滚动进度
            if (maxScroll > 0) {
                var percent = Math.min(100, Math.max(0, (scrollY / maxScroll) * 100));
                if (hudProgress) hudProgress.style.width = percent + '%';
                if (hudPercent) hudPercent.textContent = String(Math.round(percent)).padStart(2, '0') + '%';
                if (hudIndicator) {
                    if (scrollY > HUD_INDICATOR_THRESHOLD) {
                        hudIndicator.classList.add('active');
                    } else {
                        hudIndicator.classList.remove('active');
                    }
                }
            }

            // 背景点阵网格漂移
            if (bgMesh) {
                bgMesh.style.transform = 'translate3d(0, ' + -(scrollY * MESH_DRIFT_FACTOR) + 'px, 0)';
            }

            // Hero 分层视差
            if (heroSection && heroLayers.length > 0) {
                var heroHeight = cached.heroHeight;
                if (scrollY <= heroHeight + HERO_EXTRA_RANGE) {
                    heroLayers.forEach(function (layer) {
                        var depth = parseFloat(layer.getAttribute('data-depth')) || 0.1;
                        var y = -scrollY * depth * HERO_DEPTH_MULTIPLIER;
                        var opacity = Math.max(0, 1 - (scrollY / (heroHeight * HERO_FADE_RATIO)));
                        layer.style.transform = 'translate3d(0, ' + y.toFixed(2) + 'px, 0)';
                        layer.style.opacity = opacity.toFixed(3);
                    });
                }
            }

            // 跑马灯惯性位移
            var deltaY = scrollY - lastScrollY;
            scrollVelocity = scrollVelocity * MARQUEE_DAMPING + deltaY * MARQUEE_ACCELERATION;
            marqueeOffset += scrollVelocity * MARQUEE_SHIFT_FACTOR;
            if (Math.abs(marqueeOffset) > MARQUEE_MAX_OFFSET) {
                marqueeOffset = (marqueeOffset < 0 ? -1 : 1) * MARQUEE_MAX_OFFSET;
            }

            marquees.forEach(function (mq) {
                var track = mq.querySelector('.marquee-track');
                if (!track) return;
                var speedAttr = parseFloat(mq.getAttribute('data-speed')) || 1;
                track.style.transform = 'translate3d(' + (marqueeOffset * speedAttr).toFixed(1) + 'px, 0, 0)';
            });

            // 卡片内部视差（仅处理视口内的卡片）
            vibeCards.forEach(function (card) {
                var rect = card.getBoundingClientRect();
                if (rect.top >= winHeight || rect.bottom <= 0) return;
                var cardCenter = rect.top + rect.height / 2;
                var offsetFromCenter = (cardCenter - winHeight / 2) / winHeight;
                card.style.setProperty('--card-parallax-y', (offsetFromCenter * CARD_PARALLAX_RANGE).toFixed(1) + 'px');
            });
        }

        var ticking = false;

        function update() {
            ticking = false;

            var scrollY = window.pageYOffset || document.documentElement.scrollTop;
            var winHeight = window.innerHeight;
            var docHeight = document.documentElement.scrollHeight;
            var cached = getGeometry(docHeight);

            setNavElevation(scrollY);
            updateScrollSpy(scrollY, cached);
            if (!reducedMotion) {
                updateMotion(scrollY, winHeight, docHeight, cached);
            }

            lastScrollY = scrollY;
        }

        function requestUpdate() {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(update);
        }

        window.addEventListener('scroll', requestUpdate, { passive: true });

        window.addEventListener('resize', function () {
            invalidateGeometry();
            requestUpdate();
        }, { passive: true });

        // 图片加载完成后布局高度会变化，需要让缓存失效
        window.addEventListener('load', function () {
            invalidateGeometry();
            requestUpdate();
        });

        update();

        // 桌面端 3D 卡片倾斜（仅精确指针设备）
        if (!reducedMotion && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
            vibeCards.forEach(function (card) {
                var rafId = null;

                card.addEventListener('mousemove', function (event) {
                    var rect = card.getBoundingClientRect();
                    var centerX = rect.width / 2;
                    var centerY = rect.height / 2;
                    var rotateX = (((event.clientY - rect.top) - centerY) / centerY) * -TILT_MAX_DEG;
                    var rotateY = (((event.clientX - rect.left) - centerX) / centerX) * TILT_MAX_DEG;

                    if (rafId) window.cancelAnimationFrame(rafId);
                    rafId = window.requestAnimationFrame(function () {
                        card.style.transform = 'perspective(' + TILT_PERSPECTIVE_PX + 'px) rotateX('
                            + rotateX.toFixed(2) + 'deg) rotateY(' + rotateY.toFixed(2)
                            + 'deg) translate3d(0, ' + TILT_LIFT_PX + 'px, ' + TILT_DEPTH_PX + 'px)';
                        card.style.boxShadow = (8 - rotateY) + 'px ' + (8 + rotateX) + 'px 0px #000000';
                    });
                });

                card.addEventListener('mouseleave', function () {
                    if (rafId) window.cancelAnimationFrame(rafId);
                    card.style.transform = '';
                    card.style.boxShadow = '';
                });
            });
        }
    })();

    /* ======================================================================
       6. 代码块增强与复制
       ====================================================================== */

    function buildCodeHeader(lang) {
        var header = document.createElement('div');
        header.className = 'code-header-bar';
        header.innerHTML =
            '<div class="code-window-dots">' +
            '<span class="code-dot red"></span>' +
            '<span class="code-dot yellow"></span>' +
            '<span class="code-dot green"></span>' +
            '</div>' +
            '<span class="code-lang-label"></span>' +
            '<button type="button" class="code-copy-btn"><span>&#9096;</span> <span>COPY</span></button>';
        // 用 textContent 写入语言名，避免把内容拼进 innerHTML
        header.querySelector('.code-lang-label').textContent = lang;
        return header;
    }

    function attachCopyHandler(header, pre) {
        var copyBtn = header.querySelector('.code-copy-btn');
        if (!copyBtn) return;

        copyBtn.addEventListener('click', function () {
            var codeEl = pre.querySelector('code') || pre;
            copyTextToClipboard(codeEl.innerText).then(function () {
                var originalHtml = copyBtn.innerHTML;
                copyBtn.innerHTML = '<span>&#10003;</span> <span>COPIED!</span>';
                copyBtn.style.backgroundColor = '#7fff00';
                copyBtn.style.color = '#000000';
                window.setTimeout(function () {
                    copyBtn.innerHTML = originalHtml;
                    copyBtn.style.backgroundColor = '';
                    copyBtn.style.color = '';
                }, COPY_FEEDBACK_MS);
            }).catch(function () {
                /* 复制失败时保持原状，避免未捕获的 Promise 异常 */
            });
        });
    }

    function enhanceAllCodeBlocks() {
        var articleBodies = document.querySelectorAll('.medium-body-text, .post-content-body, article');
        if (articleBodies.length === 0) return;

        toNodeArray(articleBodies).forEach(function (body) {
            var blocks = body.querySelectorAll('.highlighter-rouge, pre');

            toNodeArray(blocks).forEach(function (block) {
                if (block.tagName === 'PRE'
                    && (closestFrom(block, '.highlighter-rouge') || closestFrom(block, '.neo-code-block'))) {
                    return;
                }

                var prev = block.previousElementSibling;
                var alreadyEnhanced = block.querySelector('.code-header-bar')
                    || block.classList.contains('neo-code-block')
                    || (prev && prev.classList.contains('code-header-bar'));
                if (alreadyEnhanced) return;

                var inner = block.querySelector('pre, code');
                var fullClassStr = (block.className || '') + ' ' + (inner ? inner.className : '');
                // mermaid 图不做代码块装饰
                if (fullClassStr.indexOf('mermaid') !== -1) return;

                var pre = block.tagName === 'PRE' ? block : block.querySelector('pre');
                if (!pre || pre.dataset.enhanced === 'true') return;
                pre.dataset.enhanced = 'true';

                var langMatch = fullClassStr.match(/language-([a-zA-Z0-9_\-]+)/);
                var lang = (langMatch && langMatch[1]) ? langMatch[1].toUpperCase() : 'CODE';
                var header = buildCodeHeader(lang);

                if (block.tagName === 'PRE') {
                    var wrapper = document.createElement('div');
                    wrapper.className = 'neo-code-block';
                    block.parentNode.insertBefore(wrapper, block);
                    wrapper.appendChild(header);
                    wrapper.appendChild(block);
                } else {
                    block.insertBefore(header, block.firstChild);
                }

                attachCopyHandler(header, pre);
            });
        });

        if (window.Prism && typeof window.Prism.highlightAll === 'function') {
            window.Prism.highlightAll();
        }
    }

    // 脚本位于 body 末尾，执行时机可能在 DOMContentLoaded 前后。
    // 原实现无条件执行两次（立即 + DOMContentLoaded），这里保证只跑一次。
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enhanceAllCodeBlocks);
    } else {
        enhanceAllCodeBlocks();
    }

    /* ======================================================================
       7. 图片灯箱
       ====================================================================== */

    (function initLightbox() {
        var articleImages = toNodeArray(document.querySelectorAll('.medium-body-text img, .post-content img'));
        if (articleImages.length === 0) return;

        var overlay = document.getElementById('neoLightbox');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'neoLightbox';
            overlay.className = 'neo-lightbox-overlay';
            overlay.setAttribute('aria-hidden', 'true');
            overlay.innerHTML =
                '<button type="button" class="neo-lightbox-close" id="neoLightboxClose" aria-label="关闭">[关闭 &#10005;]</button>' +
                '<div class="neo-lightbox-content">' +
                '<img class="neo-lightbox-img" id="neoLightboxImg" src="" alt="">' +
                '<div class="neo-lightbox-caption" id="neoLightboxCaption"></div>' +
                '</div>';
            document.body.appendChild(overlay);
        }

        var lightboxImg = document.getElementById('neoLightboxImg');
        var lightboxCaption = document.getElementById('neoLightboxCaption');
        var clearTimer = null;

        function openLightbox(src, alt) {
            if (!src) return;
            if (clearTimer) {
                window.clearTimeout(clearTimer);
                clearTimer = null;
            }
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
            if (clearTimer) window.clearTimeout(clearTimer);
            clearTimer = window.setTimeout(function () {
                clearTimer = null;
                if (!overlay.classList.contains('active')) {
                    lightboxImg.src = '';
                }
            }, LIGHTBOX_CLEAR_MS);
        }

        // 让正文图片可被键盘聚焦，Enter / Space 打开灯箱
        articleImages.forEach(function (img) {
            if (!img.hasAttribute('tabindex')) {
                img.setAttribute('tabindex', '0');
                img.setAttribute('role', 'button');
            }
        });

        function isArticleImage(node) {
            if (!node || node.tagName !== 'IMG') return false;
            return !!(closestFrom(node, '.medium-body-text') || closestFrom(node, '.post-content'));
        }

        document.addEventListener('click', function (event) {
            if (!isArticleImage(event.target)) return;
            event.stopPropagation();
            var img = event.target;
            openLightbox(img.currentSrc || img.src, img.alt);
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && overlay.classList.contains('active')) {
                closeLightbox();
                return;
            }
            if ((event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')
                && isArticleImage(event.target)) {
                event.preventDefault();
                var img = event.target;
                openLightbox(img.currentSrc || img.src, img.alt);
            }
        });

        overlay.addEventListener('click', function () {
            closeLightbox();
        });
    })();
})();
