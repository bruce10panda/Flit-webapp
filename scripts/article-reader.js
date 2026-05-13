/**
 * article-reader.js - Enhanced Experimental Mode
 */

const proxySources = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest=',
];

// Expanded blacklist for UI elements, badges, social prompts, and author imagery
const imageBlacklist = [
    'google-preferred-source',
    'follow-us-on-google-news',
    'badge',
    'social-share',
    'subscribe-button',
    'newsletter-signup',
    'download-on-the-app-store',
    'get-it-on-google-play',
    'facebook-icon',
    'twitter-icon',
    // Author/avatar patterns
    'author',
    'avatar',
    'headshot',
    'profile',
    'byline',
    'contributor',
    'journalist',
    'reporter',
    'staff',
    'mugshot',
    'bio-img',
    'bio-image',
    'writer',
];

// Cutoff phrases — when matched, everything from this element onward is removed
const cutoffPhrases = [
    'popular stories',
    'recommended for you',
    'what do you think',
    'leave a comment',
    'sponsored content',
    'advertisement',
    'more from',
    'share this',
    'related articles',
    'related stories',
    'you might also like',
    'follow us on',
    'join the conversation',
    'subscribe',
    'sign up',
    'get updates',
    'download our app',
    'connect with us',
    'stay informed',
    'about the author',
    'original article',
    'source:',
    'share your thoughts',
    'google-preferred-source',
    'know in the comments',
    'follow topics and authors',
    'receive email updates',
    'most read',
    'trending now',
    'editor\'s picks',
    'also on',
    'comments',
    'have a tip',
    'corrections',
    'disclosure',
    'terms of use',
    'privacy policy',
    'auto affiliate links'
];

// Social/tracking domains whose links should be stripped
const blockedLinkDomains = [
    'news.google.com',
    'facebook.com/sharer',
    'twitter.com/intent',
    'linkedin.com/share',
    'reddit.com/submit',
    'whatsapp.com',
    'telegram.me',
    't.me',
];

function normalizeSrc(src) {
    return src?.trim().replace(/\/?(?:\?.*)?$/, '').replace(/\/+$/, '');
}

function getTimeAgo(dateStr) {
    const date = new Date(dateStr);
    const seconds = Math.floor((new Date() - date) / 1000);
    const hours = Math.floor(seconds / 3600);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}H`;
    return `${Math.floor(hours / 24)}D`;
}

async function fetchArticleHTML(url) {
    const attempts = proxySources.map(proxy => fetch(proxy + encodeURIComponent(url)));
    try {
        const response = await Promise.any(attempts);
        return await response.text();
    } catch (err) {
        console.error("Failed to fetch article content:", err);
        return null;
    }
}

/**
 * Returns true if the image should be removed in experimental mode.
 * Checks URL/filename, alt text, class names, and aspect ratio (avatar heuristic).
 */
function isBlockedImage(img) {
    const src = (img.src || img.getAttribute('src') || '').toLowerCase();
    const alt = (img.alt || '').toLowerCase();
    const classList = (img.className || '').toLowerCase();
    const id = (img.id || '').toLowerCase();

    const combined = `${src} ${alt} ${classList} ${id}`;

    // Check against the blacklist terms
    if (imageBlacklist.some(term => combined.includes(term))) return true;

    // Heuristic: small square images are likely avatars/icons (if dimensions are known)
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (w > 0 && h > 0) {
        const ratio = w / h; 
        const isSquarish = ratio >= 0.8 && ratio <= 1.25;
        const isSmall = w <= 120 && h <= 120;
        if (isSmall && isSquarish) return true;
    }

    // Heuristic: check parent element for author-related class/id names
    const parent = img.closest('[class],[id]');
    if (parent) {
        const parentCtx = `${parent.className || ''} ${parent.id || ''}`.toLowerCase();
        if (imageBlacklist.some(term => parentCtx.includes(term))) return true;
    }

    return false;
}

/**
 * Returns true if the element contains a blocked social/tracking link.
 */
function hasBlockedLink(el) {
    const links = el.tagName === 'A' ? [el] : Array.from(el.querySelectorAll('a'));
    return links.some(link => {
        const href = (link.href || '').toLowerCase();
        return blockedLinkDomains.some(domain => href.includes(domain));
    });
}

/**
 * Returns true if an element matches a cutoff phrase and should trigger end-of-article removal.
 */
function matchesCutoff(el) {
    const text = el.textContent.trim().toLowerCase();
    if (!text) return false;

    return cutoffPhrases.some(phrase => {
        // Exact match, or starts the element text, or contained in short elements (<=200 chars)
        return (
            text === phrase ||
            text.startsWith(phrase + ':') ||
            text.startsWith(phrase + ' ') ||
            (text.length <= 200 && text.includes(phrase))
        );
    });
}

/**
 * Strips boilerplate from the parsed article DOM when experimental mode is on.
 * Walks top-level children to avoid re-processing already-removed nodes.
 */
function stripBoilerplate(container) {
    // Collect a flat snapshot of all relevant elements before we start removing
    const elements = Array.from(
        container.querySelectorAll('p, h1, h2, h3, h4, ul, ol, blockquote, div, section, hr, footer, aside, figure, table')
    );

    let cutoffReached = false;

    for (const el of elements) {
        // Skip if already removed by a parent being removed earlier
        if (!container.contains(el)) continue;

        if (cutoffReached) {
            el.remove();
            continue;
        }

        // Check for cutoff trigger
        if (matchesCutoff(el)) {
            cutoffReached = true;
            el.remove();
            continue;
        }

        // Remove elements that contain blocked social/tracking links
        if (hasBlockedLink(el)) {
            el.remove();
            continue;
        }
    }
}

async function loadArticle() {
    let experimentalReaderEnabled = false;

    console.log("Reader: Checking profile...");
    try {
        const profileRes = await fetch('profile.json');
        const profile = await profileRes.json();
        experimentalReaderEnabled = profile.preferences?.experimental_reader || false;
        console.log("Reader: Experimental Mode is", experimentalReaderEnabled ? "ON" : "OFF");
    } catch (e) {
        console.error("Reader: Profile fetch failed", e);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const articleUrl = urlParams.get('url');
    const savedData = JSON.parse(sessionStorage.getItem('currentPostData'));

    if (!articleUrl) return;

    const postContainer = document.querySelector('.post');
    const titleEl = document.querySelector('.title');
    const sourceNameEl = document.querySelector('.source-name');
    const sourceImgEl = document.querySelector('.source-info img');
    const authorEl = document.querySelector('.author');
    const timeEl = document.querySelector('.time');

    const tempImage = document.querySelector('.post-image');
    if (tempImage) tempImage.remove();

    if (savedData) {
        titleEl.textContent = savedData.title;
        sourceNameEl.textContent = savedData.feedTitle;
        authorEl.textContent = savedData.author;
        timeEl.textContent = getTimeAgo(savedData.date);
        sourceImgEl.src = savedData.feedImage || `https://www.google.com/s2/favicons?sz=64&domain=${articleUrl}`;

        // --- NEW: Update Button Text and Link ---
        const actionBtn = document.querySelector('.open-source');
        const btnText = actionBtn ? actionBtn.querySelector('p') : null;

    if (actionBtn && articleUrl) {
        try {
            const domain = new URL(articleUrl).hostname.replace('www.', '');
            if (btnText) {
                btnText.textContent = `Open on ${domain}`;
            }
            actionBtn.onclick = () => window.open(articleUrl, '_blank');
        } catch (e) {
            if (btnText) {
                btnText.textContent = "Open Original Source";
            }
        }
    }

        if (savedData.image) {
            const firstImg = document.createElement('img');
            firstImg.className = 'post-image main-article-img';
            firstImg.src = savedData.image;
            titleEl.parentNode.insertBefore(firstImg, titleEl);
        }
    }

    titleEl.textContent = "Loading content...";

    const html = await fetchArticleHTML(articleUrl);

    if (html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const reader = new Readability(doc);
        const article = reader.parse();

        if (article) {
            titleEl.textContent = article.title;

            const contentDiv = document.createElement('div');
            contentDiv.className = 'article-content';

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = article.content;

            // --- Image filtering ---
            const topImageSrc = savedData?.image ? normalizeSrc(savedData.image) : null;
            const seenImages = new Set();

            tempDiv.querySelectorAll('img').forEach(img => {
                const rawSrc = img.src || img.getAttribute('src') || '';
                const imgSrc = normalizeSrc(rawSrc);

                // Always: remove empty, duplicate, or already-shown hero images
                if (!imgSrc || imgSrc === topImageSrc || seenImages.has(imgSrc)) {
                    img.remove();
                    return;
                }

                // Experimental: remove blacklisted or author/avatar images
                if (experimentalReaderEnabled && isBlockedImage(img)) {
                    img.remove();
                    return;
                }

                seenImages.add(imgSrc);
                img.alt = img.alt || 'Article image';
            });

            // --- Boilerplate text/element filtering (experimental only) ---
            if (experimentalReaderEnabled) {
                stripBoilerplate(tempDiv);
            }

            contentDiv.innerHTML = tempDiv.innerHTML;
            postContainer.appendChild(contentDiv);


            // Post-process: label short paragraphs, hide AI summary tags
            if (typeof window.processArticleContent === 'function') {
                window.processArticleContent(contentDiv);
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', loadArticle);

const backBtn = document.querySelector('.nav-top.overlay:first-child');
if (backBtn) {
    backBtn.style.cursor = 'pointer';
    backBtn.onclick = () => window.history.back();
}