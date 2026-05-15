const feedContainer = document.querySelector('.feed');

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

function renderPosts(allPosts) {
    feedContainer.innerHTML = `<p class="feed-name">Recent Updates</p>`;

    allPosts.forEach(postData => {
        const post = document.createElement('div');
        post.className = 'post overlay';
        post.onclick = () => {
            sessionStorage.setItem('currentPostData', JSON.stringify(postData));
            window.location.href = `article.html?url=${encodeURIComponent(postData.link)}`;
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
                <p class="author">${postData.author}</p>
                <p class="time">${getTimeAgo(postData.date)}</p>
            </div>
        `;

        feedContainer.appendChild(post);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!feedContainer) return;

    try {
        const profile = await loadAndApplyTheme();
        if (!profile) throw new Error('Could not load profile.json');

        const activeIndex = parseInt(localStorage.getItem('activeSpaceIndex') || '0', 10);
        const activeSpace = profile.spaces[activeIndex] || profile.spaces[0];
        if (activeSpace) {
            document.querySelector('h1').textContent = activeSpace.name;
        }

        const feedUrls = activeSpace.feeds || [];
        feedContainer.innerHTML = `<p class="feed-name">Loading ${activeSpace.name}...</p>`;

        let allPosts = [];

        const feedPromises = feedUrls.map(async (url) => {
            const xmlDoc = await fetchFeed(url);
            if (!xmlDoc) return;

            const feedTitle = xmlDoc.querySelector('channel > title, feed > title')?.textContent?.trim() || 'Unknown Source';
            const feedImage = xmlDoc.querySelector('channel > image > url, feed > logo')?.textContent?.trim() ||
                              xmlDoc.querySelector('channel > image')?.getAttribute('url') || null;

            Array.from(xmlDoc.querySelectorAll('item, entry')).forEach(item => {
                const pubDateStr = item.querySelector('pubDate, published, updated')?.textContent?.trim();
                const parsedDate = pubDateStr ? new Date(pubDateStr) : null;
                const postDate = parsedDate && !isNaN(parsedDate) ? parsedDate : new Date(0);
                const authorEl = item.querySelector('dc\\:creator, creator, author > name, author');
                let authorName = authorEl ? authorEl.textContent.trim() : '';

                // Some feeds encode author as "email@example.com (Display Name)"
                if (authorName.includes('@') && authorName.includes('(')) {
                    authorName = authorName.match(/\(([^)]+)\)/)?.[1] || authorName;
                }

                const finalAuthor = (authorName && authorName.toLowerCase() !== 'staff' && !authorName.includes('@'))
                    ? authorName
                    : feedTitle;

                allPosts.push({
                    feedTitle,
                    feedImage,
                    title: item.querySelector('title')?.textContent?.trim() || 'Untitled',
                    link: item.querySelector('link')?.getAttribute('href') || item.querySelector('link')?.textContent?.trim(),
                    author: finalAuthor,
                    description: (item.querySelector('description, summary')?.textContent || '').replace(/<[^>]+>/g, '').trim().slice(0, 150) + '...',
                    image: extractImage(item),
                    date: postDate
                });
            });
        });

        await Promise.all(feedPromises);
        allPosts.sort((a, b) => b.date - a.date);

        if (allPosts.length > 0) {
            renderPosts(allPosts.slice(0, 30));
        } else {
            feedContainer.innerHTML = '<p class="feed-name">No posts found.</p>';
        }

    } catch (err) {
        console.error("Initialization Error:", err);
        feedContainer.innerHTML = '<p class="feed-name">Error loading profile.</p>';
    }
});
