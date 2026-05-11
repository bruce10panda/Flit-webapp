/**
 * article-reader.js
 * Handles fetching, parsing, and displaying full article content using Readability.js
 */

const proxySources = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest=',
];

/**
 * Fetch HTML content through proxies to bypass CORS
 */
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
 * Main logic to parse and render the article
 */
async function loadArticle() {
    // 1. Get the URL from the query parameter (e.g., article.html?url=...)
    const urlParams = new URLSearchParams(window.location.search);
    const articleUrl = urlParams.get('url');

    if (!articleUrl) {
        console.error("No article URL provided in query string.");
        return;
    }

    // Get post data from sessionStorage
    const postDataStr = sessionStorage.getItem('currentPostData');
    const postData = postDataStr ? JSON.parse(postDataStr) : null;

    // Reference existing UI elements from article.html
    const postContainer = document.querySelector('.post');
    const titleEl = document.querySelector('.title');
    const sourceNameEl = document.querySelector('.source-name');
    const authorEl = document.querySelector('.author');
    const postImage = document.querySelector('.post-image');
    const sourceIcon = document.querySelector('.source img');
    const timeEl = document.querySelector('.time');

    // Show loading state
    titleEl.textContent = "Loading article...";

    const html = await fetchArticleHTML(articleUrl);

    if (html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        // Ensure Readability can find images by fixing relative paths
        const base = doc.createElement('base');
        base.href = articleUrl;
        doc.head.appendChild(base);

        // 2. Use Mozilla Readability
        const reader = new Readability(doc);{"error":"Response exceeds 1MB size limit. Upgrade at https://corsproxy.io/pricing/"}
        const article = reader.parse();

        if (article) {
            // Update UI with parsed data
            titleEl.textContent = article.title;
            sourceNameEl.textContent = postData?.feedTitle || article.siteName || new URL(articleUrl).hostname;
            authorEl.textContent = postData?.author || article.byline || "Unknown Author";
            
            // Update source icon from RSS feed data
            if (postData?.feedImage) {
                sourceIcon.src = postData.feedImage;
            } else {
                // Fallback to favicon if no RSS image
                sourceIcon.src = `https://www.google.com/s2/favicons?sz=64&domain=${articleUrl}`;
            }
            
            // Update time from RSS feed data
            if (postData?.date) {
                const date = new Date(postData.date);
                const hours = Math.floor((new Date() - date) / (1000 * 60 * 60));
                timeEl.textContent = hours < 1 ? 'Just now' : (hours < 24 ? `${hours}H` : `${Math.floor(hours / 24)}D`);
            }

            // Extract first image from article content and put it at the top
            let firstImage = null;
            if (article.content) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = article.content;
                const img = tempDiv.querySelector('img');
                if (img) {
                    firstImage = img.src;
                    // Remove the image from content
                    img.remove();
                    article.content = tempDiv.innerHTML;
                }
            }

            // Remove the placeholder image
            if (postImage) {
                postImage.remove();
            }

            // 3. Create the content container
            const contentDiv = document.createElement('div');
            contentDiv.className = 'article-content';
            
            // If we found a first image, add it at the top
            if (firstImage) {
                const topImage = document.createElement('img');
                topImage.src = firstImage;
                topImage.className = 'post-image';
                topImage.alt = 'Article Image';
                topImage.onerror = () => topImage.remove();
                contentDiv.appendChild(topImage);
            }
            
            // Set the innerHTML (Readability cleans the HTML for us)
            const contentEl = document.createElement('div');
            contentEl.innerHTML = article.content;
            contentDiv.appendChild(contentEl);

            // Append to the .post container after the header info
            postContainer.appendChild(contentDiv);
        } else {
            titleEl.textContent = "Unable to parse article content.";
        }
    } else {
        titleEl.textContent = "Failed to load article.";
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', loadArticle);

// Back button functionality
const backBtn = document.querySelector('.nav-top.overlay:first-child');
if (backBtn) {
    backBtn.style.cursor = 'pointer';
    backBtn.onclick = () => window.history.back();
}