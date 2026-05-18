const feedContainer = document.querySelector('.feed');
const PAGE_SIZE = 30;

let allPosts = [];
let filteredPosts = [];
let activeFilter = null;
let currentOffset = 0;
let sentinel = null;
let observer = null;

const STOP_WORDS = new Set([
    // English
    'a','an','the','and','but','or','nor','for','yet','so',
    'in','on','at','to','of','by','up','as','is','it','its',
    'be','do','go','if','no','my','me','we','us','he','she','they',
    'are','was','were','has','had','have','will','can','may','could',
    'would','should','does','did','not','with','from','that','this',
    'than','then','when','what','which','who','how','why','all','also',
    'just','into','over','more','about','after','their','them','these',
    'those','been','being','get','got','make','made','take','out','your',
    'our','any','each','now','new','say','says','said','top','best',
    'first','year','week','day','back','here','like','time','way','next',
    'last','one','two','three','big','via','amid','ahead','still','even',
    'ever','set','show','shows','look','use','want','need','come',
    'see','find','help','give','keep','let','put','run','try','ask',
    'seem','feel','become','mean','leave','much','many','most','some',
    'own','same','long','old','high','low','off','open','such',
    'every','both','few','between','before','under','while','without',
    'where','there','once','too','very','well','only','since','again',
    'further','through','according','report','reports','amid',
    // Dutch
    'de','het','een','en','van','in','is','dat','op','te','zijn','met',
    'voor','die','aan','er','maar','om','na','bij','ook','als','nog',
    'dan','uit','naar','zo','wel','niet','over','al','dit','hij','ze',
    'tot','af','door','twee','drie','vier','meer','alle','veel',
    'nieuwe','wordt','werd','waren','heeft','hebben','kan','kunnen',
    'moet','mee','waar','hoe','wat','wie','hun','hen','ons','wij',
    'bent','ben','geen','iets','iemand','elke','elks','hier','daar',
    'toen','nu','toch','dus','want','want','maar','echter','want',
    // French (ASCII only)
    'le','la','les','de','du','des','un','une','et','au','aux',
    'ce','se','qui','que','dans','sur','par','plus','pas','est',
    'son','sa','ses','leur','leurs','tout','tous','avec','cette',
    'pour','ont','fait','comme','ils','elles','nous','vous','mon',
    'ton','nos','vos','mes','tes','ses','dont','dont','lors',
    // German (ASCII only)
    'der','die','das','den','dem','ein','einer','eines','eine',
    'und','aber','auf','mit','von','bei','als','zur','zum','im',
    'am','ab','aus','nach','vor','noch','nur','haben','hatte',
    'wird','wurden','sind','war','sich','oder','wenn','dann','dass',
    'nicht','auch','ich','du','wir','ihr','sie','es','man','uns',
    'ihm','ihn','ihr','uns','euch','mein','dein','sein','kein',
    // Spanish (ASCII only)
    'el','los','del','al','por','para','con','sus','pero','como',
    'son','mas','han','era','fue','ser','estar','hay','cada',
    'esto','esta','ese','esa','esos','esas','todo','toda','muy',
]);

function extractKeywords(posts, topN = 15) {
    const freq = new Map();

    posts.forEach(post => {
        const words = post.title
            .replace(/['']/g, '')
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length >= 2 && /^[a-zA-Z][a-zA-Z0-9]*$/.test(w) && !STOP_WORDS.has(w.toLowerCase()));

        const seen = new Set();
        words.forEach(w => {
            const lower = w.toLowerCase();
            if (seen.has(lower)) return;
            seen.add(lower);
            const entry = freq.get(lower) || { count: 0, forms: {} };
            entry.count++;
            entry.forms[w] = (entry.forms[w] || 0) + 1;
            freq.set(lower, entry);
        });
    });

    return [...freq.entries()]
        .filter(([, e]) => e.count >= 2)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, topN)
        .map(([, e]) => Object.entries(e.forms).sort((a, b) => b[1] - a[1])[0][0]);
}

function buildFilters() {
    const container = document.querySelector('.filters');
    if (!container) return;

    const sources = [...new Set(allPosts.map(p => p.feedTitle).filter(Boolean))];
    const keywords = extractKeywords(allPosts);
    const sourceSet = new Set(sources.map(s => s.toLowerCase()));

    const chips = [
        ...(sources.length > 1 ? sources.map(s => ({ label: s, type: 'source' })) : []),
        ...keywords
            .filter(k => !sourceSet.has(k.toLowerCase()))
            .map(k => ({ label: k, type: 'keyword' })),
    ];

    container.innerHTML = '';

    const allChip = makeFilterChip('All', true);
    allChip.addEventListener('click', () => setFilter(null));
    container.appendChild(allChip);

    chips.forEach(({ label, type }) => {
        const chip = makeFilterChip(label, false);
        chip.addEventListener('click', () => setFilter(label, type));
        container.appendChild(chip);
    });
}

function makeFilterChip(label, active) {
    const chip = document.createElement('div');
    chip.className = 'filter overlay' + (active ? ' filter-active' : '');
    chip.dataset.filter = label;
    chip.innerHTML = `<p>${label}</p>`;
    return chip;
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function setFilter(term, type) {
    if (activeFilter?.term === term) term = null;
    activeFilter = term ? { term, type } : null;

    if (!activeFilter) {
        filteredPosts = [...allPosts];
    } else if (type === 'source') {
        filteredPosts = allPosts.filter(p => p.feedTitle === term);
    } else {
        const re = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
        filteredPosts = allPosts.filter(p => re.test(p.title));
    }

    document.querySelectorAll('.filter').forEach(chip => {
        chip.classList.toggle('filter-active', chip.dataset.filter === (activeFilter?.term ?? 'All'));
    });

    renderPosts();
}

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

function createPostElement(postData) {
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
            <p class="author">${postData.readTime} min read</p>
            <p class="time">${getTimeAgo(postData.date)}</p>
        </div>
    `;

    return post;
}

function appendBatch() {
    const batch = filteredPosts.slice(currentOffset, currentOffset + PAGE_SIZE);
    if (batch.length === 0) return;

    batch.forEach(postData => feedContainer.insertBefore(createPostElement(postData), sentinel));
    currentOffset += batch.length;

    if (currentOffset >= filteredPosts.length) {
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

                if (authorName.includes('@') && authorName.includes('(')) {
                    authorName = authorName.match(/\(([^)]+)\)/)?.[1] || authorName;
                }

                const finalAuthor = (authorName && authorName.toLowerCase() !== 'staff' && !authorName.includes('@'))
                    ? authorName
                    : feedTitle;

                const rawDesc = (item.querySelector('description, summary')?.textContent || '').replace(/<[^>]+>/g, '').trim();
                const wordCount = rawDesc.split(/\s+/).filter(Boolean).length;
                const readTime = Math.max(1, Math.round(wordCount / 220));

                allPosts.push({
                    feedTitle,
                    feedImage,
                    title: item.querySelector('title')?.textContent?.trim() || 'Untitled',
                    link: item.querySelector('link')?.getAttribute('href') || item.querySelector('link')?.textContent?.trim(),
                    author: finalAuthor,
                    description: rawDesc.slice(0, 150) + (rawDesc.length > 150 ? '...' : ''),
                    image: extractImage(item),
                    date: postDate,
                    readTime,
                });
            });
        });

        await Promise.all(feedPromises);
        allPosts.sort((a, b) => b.date - a.date);
        filteredPosts = [...allPosts];

        buildFilters();

        if (filteredPosts.length > 0) {
            renderPosts();
        } else {
            feedContainer.innerHTML = '<p class="feed-name">No posts found.</p>';
        }

    } catch (err) {
        console.error("Initialization Error:", err);
        feedContainer.innerHTML = '<p class="feed-name">Error loading profile.</p>';
    }
});
