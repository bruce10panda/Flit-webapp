const feedContainer = document.querySelector('.feed');
const PAGE_SIZE = 30;

let allPosts = [];
let currentOffset = 0;
let sentinel = null;
let observer = null;
let openInReader = true;


async function fetchFeed(url) {
    const attempts = [
        fetch(url),
        ...proxySources.map(p => fetch(p + encodeURIComponent(url)))
    ];

    try {
        const response = await Promise.any(attempts);
        const text = await response.text();
        return new DOMParser().parseFromString(text, 'application/xml');
    } catch (err) {
        console.error(`Failed to fetch feed: ${url}`, err);
        return null;
    }
}

async function fetchBlueskyFeed(handle) {
    const resolved = handle.includes('.') ? handle : `${handle}.bsky.social`;

    const [feedResult, profileResult] = await Promise.allSettled([
        fetchFeed(`https://bsky.app/profile/${resolved}/rss`),
        fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${resolved}`)
            .then(r => r.json()),
    ]);

    return {
        xmlDoc: feedResult.status === 'fulfilled' ? feedResult.value : null,
        avatar: profileResult.status === 'fulfilled' ? profileResult.value?.avatar ?? null : null,
    };
}

function extractImage(item) {
    const media = item.getElementsByTagNameNS('*', 'thumbnail')[0] ||
                  item.getElementsByTagNameNS('*', 'content')[0];
    if (media?.getAttribute('url')) return media.getAttribute('url');

    const enclosure = item.querySelector('enclosure[type^="image"]');
    if (enclosure?.getAttribute('url')) return enclosure.getAttribute('url');

    const content = item.querySelector('description, content')?.textContent || '';
    const match = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    return match ? match[1] : null;
}

function createPostElement(postData) {
    const post = document.createElement('div');
    post.className = 'post overlay';

    if (postData.isBluesky) {
        post.classList.add('twitter-post');
        post.onclick = () => window.open(postData.link, '_blank');

        post.innerHTML = `
            <div class="source">
                <img src="${postData.feedImage || 'https://www.google.com/s2/favicons?sz=64&domain=bsky.app'}" alt="Avatar" onerror="this.src='https://www.google.com/s2/favicons?sz=64&domain=bsky.app'">
                <p class="source-name">${postData.feedTitle}</p>
            </div>
            <p class="tweet-body">${postData.title}</p>
            ${postData.externalLink ? `<a class="post-link overlay" href="${postData.externalLink}" target="_blank" onclick="event.stopPropagation()"><p>link</p></a>` : ''}
            <div class="author-time">
                <p class="time">${getTimeAgo(postData.date)}</p>
            </div>
        `;
    } else {
        post.onclick = () => {
            if (openInReader) {
                sessionStorage.setItem('currentPostData', JSON.stringify(postData));
                window.location.href = `article.html?url=${encodeURIComponent(postData.link)}`;
            } else {
                openBuiltInBrowser(postData.link);
            }
        };

        post.innerHTML = `
            <div class="source">
                <img src="https://www.google.com/s2/favicons?sz=64&domain=${postData.link}" alt="Source Icon">
                <p class="source-name">${postData.feedTitle}</p>
            </div>
            ${postData.image ? `<img class="post-image" src="${postData.image}" alt="Post Image" onerror="this.remove()">` : ''}
            <h2 class="title">${postData.title}</h2>
            <p class="description">${postData.description}</p>
            <div class="author-time">
                <p class="author">${postData.readTime} min read</p>
                <p class="time">${getTimeAgo(postData.date)}</p>
            </div>
        `;
    }

    return post;
}

function appendBatch() {
    const batch = allPosts.slice(currentOffset, currentOffset + PAGE_SIZE);
    if (batch.length === 0) return;

    batch.forEach(postData => feedContainer.insertBefore(createPostElement(postData), sentinel));
    currentOffset += batch.length;

    if (currentOffset >= allPosts.length) {
        observer.disconnect();
        sentinel.remove();
        sentinel = null;
    }
}

function renderPosts() {
    feedContainer.innerHTML = `<p class="feed-name">Recent Updates</p>`;
    currentOffset = 0;

    sentinel = document.createElement('div');
    sentinel.className = 'feed-sentinel';
    feedContainer.appendChild(sentinel);

    observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) appendBatch();
    }, { rootMargin: '200px' });

    observer.observe(sentinel);
}

function openBuiltInBrowser(url) {
    window.location.href = `browser.html?url=${encodeURIComponent(url)}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!feedContainer) return;

    try {
        const profile = await loadAndApplyTheme();
        if (!profile) throw new Error('Could not load profile.json');

        openInReader = profile.preferences?.open_in_reader !== false;

        const activeIndex = parseInt(localStorage.getItem('activeSpaceIndex') || '0', 10);
        const activeSpace = profile.spaces[activeIndex] || profile.spaces[0];
        if (activeSpace) {
            document.querySelector('h1').textContent = activeSpace.name;
        }

        const feedUrls = activeSpace.feeds || [];
        feedContainer.innerHTML = `<p class="feed-name">Loading ${activeSpace.name}...</p>`;

        const feedPromises = feedUrls.map(async (url) => {
            const isBluesky = url.startsWith('@') || /bsky\.app/i.test(url);

            let xmlDoc;
            let blueskyAvatar = null;
            if (url.startsWith('@')) {
                const result = await fetchBlueskyFeed(url.slice(1));
                xmlDoc = result.xmlDoc;
                blueskyAvatar = result.avatar;
            } else {
                xmlDoc = await fetchFeed(url);
            }
            if (!xmlDoc) return;

            const feedTitle = xmlDoc.querySelector('channel > title, feed > title')?.textContent?.trim() || 'Unknown Source';
            const feedImage = isBluesky
                ? blueskyAvatar
                : (xmlDoc.querySelector('channel > image > url, feed > logo')?.textContent?.trim() ||
                   xmlDoc.querySelector('channel > image')?.getAttribute('url') || null);

            Array.from(xmlDoc.querySelectorAll('item, entry')).forEach(item => {
                const pubDateStr = item.querySelector('pubDate, published, updated')?.textContent?.trim();
                const parsedDate = pubDateStr ? new Date(pubDateStr) : null;
                const postDate = parsedDate && !isNaN(parsedDate) ? parsedDate : new Date(0);
                const authorEl = item.querySelector('dc\\:creator, creator, author > name, author');
                let authorName = authorEl ? authorEl.textContent.trim() : '';

                if (authorName.includes('@') && authorName.includes('(')) {
                    authorName = authorName.match(/\(([^)]+)\)/)?.[1] || authorName;
                }

                const finalAuthor = (authorName && authorName.toLowerCase() !== 'staff' && !authorName.includes('@'))
                    ? authorName
                    : feedTitle;

                const rawDescHtml = item.querySelector('description, summary')?.textContent || '';
                const rawDesc = rawDescHtml.replace(/<[^>]+>/g, '').trim();
                const wordCount = rawDesc.split(/\s+/).filter(Boolean).length;
                const readTime = Math.max(1, Math.round(wordCount / 220));

                const link = item.querySelector('link')?.getAttribute('href') || item.querySelector('link')?.textContent?.trim();
                const rawTitle = item.querySelector('title')?.textContent?.trim();
                const title = isBluesky ? rawDesc : (rawTitle || 'Untitled');

                const urlMatch = isBluesky ? rawDesc.match(/https?:\/\/[^\s)>\]"]+/) : null;
                const externalLink = urlMatch ? urlMatch[0].replace(/[.,;!?]+$/, '') : null;
                const displayTitle = externalLink ? title.replace(urlMatch[0], '').trim() : title;

                allPosts.push({
                    feedTitle,
                    feedImage,
                    title: displayTitle,
                    link,
                    author: finalAuthor,
                    description: rawDesc.slice(0, 150) + (rawDesc.length > 150 ? '...' : ''),
                    image: extractImage(item),
                    date: postDate,
                    readTime,
                    isBluesky,
                    externalLink,
                });
            });
        });

        await Promise.all(feedPromises);
        allPosts.sort((a, b) => b.date - a.date);

        if (allPosts.length > 0) {
            renderPosts();
        } else {
            feedContainer.innerHTML = '<p class="feed-name">No posts found.</p>';
        }

    } catch (err) {
        console.error("Initialization Error:", err);
        feedContainer.innerHTML = '<p class="feed-name">Error loading profile.</p>';
    }
});
