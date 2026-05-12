/**
 * article-reader.js
 */

const proxySources = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest=',
];

// URLs or fragments of URLs for UI badges/ads that should never be shown
const imageBlacklist = [
    'google-preferred-source',
    'follow-us-on-google-news',
    'badge',
    'social-share',
    'subscribe-button'
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

async function loadArticle() {
    try {
        const profileRes = await fetch('profile.json');
        const profile = await profileRes.json();
        if (profile.spaces[0] && typeof applyProfileTheme === 'function') {
            applyProfileTheme(profile.spaces[0].theme);
        }
    } catch (e) { console.error("Theme load failed", e); }

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

            // --- FILTER & HARD CUTOFF LOGIC ---
            const cutoffPhrases = [
                'popular stories', 
                'recommended for you', 
                'read more', 
                'what do you think', 
                'leave a comment',
                'sponsored content',
                'advertisement',
                'more from',
                'share this',
                'related'
            ];

            let reachedEnd = false;
            const elements = Array.from(tempDiv.querySelectorAll('p, h1, h2, h3, h4, div, section, hr, center'));

            elements.forEach(el => {
                if (reachedEnd) {
                    el.remove();
                    return;
                }

                const text = el.textContent.trim().toLowerCase();
                const isMatch = cutoffPhrases.some(phrase => 
                    text === phrase || 
                    text.startsWith(phrase + ':') || 
                    (text.length < 60 && text.includes(phrase))
                );

                if (isMatch) {
                    reachedEnd = true;
                    el.remove();
                }

                // Check for specific social/news links
                if (el.tagName === 'A' || el.querySelector('a')) {
                    const links = el.tagName === 'A' ? [el] : Array.from(el.querySelectorAll('a'));
                    links.forEach(link => {
                        const href = link.href.toLowerCase();
                        if (href.includes('news.google.com') || href.includes('facebook.com/sharer')) {
                            el.remove(); 
                        }
                    });
                }
            });

            // --- IMAGE CLEANUP & BLACKLIST ---
            const topImageSrc = savedData && savedData.image ? normalizeSrc(savedData.image) : null;
            const seenImages = new Set();

            tempDiv.querySelectorAll('img').forEach(img => {
                const rawSrc = img.src || img.getAttribute('src') || '';
                const imgSrc = normalizeSrc(rawSrc);

                // 1. Check if image URL contains blacklisted keywords (e.g., google-preferred-source)
                const isBlacklisted = imageBlacklist.some(term => rawSrc.toLowerCase().includes(term));

                // 2. Remove if blacklisted, empty, duplicate of top image, or already seen
                if (isBlacklisted || !imgSrc || imgSrc === topImageSrc || seenImages.has(imgSrc)) {
                    img.remove();
                    return;
                }
                
                seenImages.add(imgSrc);
                img.alt = img.alt || 'Article image';
            });

            contentDiv.innerHTML = tempDiv.innerHTML;
            postContainer.appendChild(contentDiv);
        }
    }
}

document.addEventListener('DOMContentLoaded', loadArticle);

const backBtn = document.querySelector('.nav-top.overlay:first-child');
if (backBtn) {
    backBtn.style.cursor = 'pointer';
    backBtn.onclick = () => window.history.back();
}