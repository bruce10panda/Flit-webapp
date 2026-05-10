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
    post.onclick = () => window.open(postData.link, '_blank');

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

    // 1. Fetch all feeds
    const feedPromises = feedUrls.map(async (url) => {
      const xmlDoc = await fetchFeed(url);
      if (!xmlDoc) return;

      const feedTitle = xmlDoc.querySelector('channel > title, feed > title')?.textContent || 'Feed';
      const items = Array.from(xmlDoc.querySelectorAll('item, entry'));

      items.forEach(item => {
        const pubDateStr = item.querySelector('pubDate, published, updated')?.textContent;
        const postDate = pubDateStr ? new Date(pubDateStr) : new Date(0); // Fallback to epoch if no date

        allPosts.push({
          feedTitle: feedTitle,
          title: item.querySelector('title')?.textContent || 'Untitled',
          link: item.querySelector('link')?.getAttribute('href') || item.querySelector('link')?.textContent,
          author: item.querySelector('author name, dc\\:creator, author')?.textContent || 'Staff',
          description: (item.querySelector('description, summary')?.textContent || '')
                        .replace(/<[^>]+>/g, '').slice(0, 150) + '...',
          image: extractImage(item),
          date: postDate
        });
      });
    });

    // Wait for all fetches to complete
    await Promise.all(feedPromises);

    // 2. Sort all collected posts by date (newest first)
    allPosts.sort((a, b) => b.date - a.date);

    // 3. Render the top 30 posts (or however many you prefer)
    renderPosts(allPosts.slice(0, 30));

  } catch (err) {
    console.error("Initialization Error:", err);
    feedContainer.innerHTML = '<p class="feed-name">Error loading feed sources.</p>';
  }
});