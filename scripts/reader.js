/**
 * Configuration & State
 */
const SOURCES_FILE = 'feeds.txt'; 
const feedContainer = document.querySelector('.feed');

const proxySources = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
];

/**
 * Core Logic: Fetching & Parsing
 */
async function fetchFeed(url) {
  const attempts = [
    fetch(url), 
    ...proxySources.map(p => fetch(p + encodeURIComponent(url)))
  ];

  try {
    const response = await Promise.any(attempts);
    const text = await response.text();
    const parser = new DOMParser();
    return parser.parseFromString(text, 'application/xml');
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

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  const hours = Math.floor(seconds / 3600);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}H`;
  return `${Math.floor(hours / 24)}D`;
}

/**
 * UI Rendering
 */
function renderPosts(allPosts) {
  // Clear container and set header
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

/**
 * Init: Multi-source Fetching and Global Sorting
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch(SOURCES_FILE);
    if (!response.ok) throw new Error('Could not find feeds.txt');
    
    const rawText = await response.text();
    const feedUrls = rawText.split(',').map(url => url.trim()).filter(url => url.length > 0);

    feedContainer.innerHTML = `<p class="feed-name">Loading and sorting feeds...</p>`;

    let allPosts = [];

    // 1. Fetch all feeds in parallel
    const feedPromises = feedUrls.map(async (url) => {
      const xmlDoc = await fetchFeed(url);
      if (!xmlDoc) return;

      // Extract the name of the publication/website
      const feedTitle = xmlDoc.querySelector('channel > title, feed > title')?.textContent?.trim() || 'Unknown Source';
      
      // Extract feed image/icon from RSS
      const feedImage = xmlDoc.querySelector('channel > image > url, feed > logo')?.textContent?.trim() || 
                       xmlDoc.querySelector('channel > image')?.getAttribute('url') || null;
      
      const items = Array.from(xmlDoc.querySelectorAll('item, entry'));

      items.forEach(item => {
        const pubDateStr = item.querySelector('pubDate, published, updated')?.textContent;
        const postDate = pubDateStr ? new Date(pubDateStr) : new Date(0);

        // --- IMPROVED AUTHOR LOGIC ---
        // 1. Check common RSS/Atom author tags
        const authorEl = item.querySelector('dc\\:creator, creator, author > name, author');
        let authorName = authorEl ? authorEl.textContent.trim() : '';

        // 2. Clean up email-style authors: "email@site.com (Name)" -> "Name"
        if (authorName.includes('@') && authorName.includes('(')) {
          authorName = authorName.match(/\(([^)]+)\)/)?.[1] || authorName;
        }

        // 3. Fallback: If empty, generic "Staff", or an email, use the Site Name instead
        const finalAuthor = (authorName && 
                             authorName.toLowerCase() !== 'staff' && 
                             !authorName.includes('@')) 
                             ? authorName 
                             : feedTitle;

        allPosts.push({
          feedTitle: feedTitle,
          feedImage: feedImage,
          title: item.querySelector('title')?.textContent?.trim() || 'Untitled',
          link: item.querySelector('link')?.getAttribute('href') || item.querySelector('link')?.textContent?.trim(),
          author: finalAuthor,
          description: (item.querySelector('description, summary')?.textContent || '')
                        .replace(/<[^>]+>/g, '') // Strip HTML tags
                        .trim()
                        .slice(0, 150) + '...',
          image: extractImage(item),
          date: postDate
        });
      });
    });

    // Wait for all fetches to finish
    await Promise.all(feedPromises);

    // 2. Global Sort: Newest to Oldest
    allPosts.sort((a, b) => b.date - a.date);

    // 3. Render result (Top 30)
    if (allPosts.length > 0) {
      renderPosts(allPosts.slice(0, 30));
    } else {
      feedContainer.innerHTML = '<p class="feed-name">No posts found in any feeds.</p>';
    }

  } catch (err) {
    console.error("Initialization Error:", err);
    feedContainer.innerHTML = '<p class="feed-name">Error loading feed sources.</p>';
  }
});