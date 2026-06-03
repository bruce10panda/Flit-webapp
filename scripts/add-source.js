document.addEventListener('DOMContentLoaded', async () => {
    await loadAndApplyTheme();
});

document.querySelector('#back-btn')?.addEventListener('click', () => {
    history.back();
});

document.querySelectorAll('.source-header').forEach(header => {
    header.addEventListener('click', () => {
        const section = header.closest('.source-section');
        const isOpen = section.classList.contains('open');
        document.querySelectorAll('.source-section').forEach(s => s.classList.remove('open'));
        if (!isOpen) section.classList.add('open');
    });
});

function addFeedToStorage(feedUrl) {
    const spaceIndex = parseInt(localStorage.getItem('activeSpaceIndex') || '0', 10);
    const key = `extraFeeds_${spaceIndex}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    if (!existing.includes(feedUrl)) {
        existing.push(feedUrl);
        localStorage.setItem(key, JSON.stringify(existing));
    }
}

function showError(input) {
    input.classList.add('error');
    input.addEventListener('animationend', () => input.classList.remove('error'), { once: true });
}

function showSuccess(row) {
    row.classList.add('success');
    setTimeout(() => history.back(), 700);
}

const sections = document.querySelectorAll('.source-section');
const rssSection = sections[0];
const bskySection = sections[1];

// ── RSS ────────────────────────────────────────────────────────────────────

const rssInput = rssSection?.querySelector('.source-input');
const rssBtn   = rssSection?.querySelector('.source-input-row .material-symbols-rounded');

function submitRss() {
    const url = rssInput.value.trim();
    if (!url.match(/^https?:\/\/.+/)) { showError(rssInput); return; }
    addFeedToStorage(url);
    showSuccess(rssSection.querySelector('.source-input-row'));
}

rssBtn?.addEventListener('click', submitRss);
rssInput?.addEventListener('keydown', e => { if (e.key === 'Enter') submitRss(); });

// ── Bluesky ────────────────────────────────────────────────────────────────

const bskyInput = bskySection?.querySelector('.source-input');
const bskyBtn   = bskySection?.querySelector('.source-input-row .material-symbols-rounded');

function submitBsky() {
    let handle = bskyInput.value.trim();
    if (!handle) { showError(bskyInput); return; }
    if (!handle.startsWith('@')) handle = '@' + handle;
    if (!handle.slice(1).includes('.')) { showError(bskyInput); return; }
    addFeedToStorage(handle);
    showSuccess(bskySection.querySelector('.source-input-row'));
}

bskyBtn?.addEventListener('click', submitBsky);
bskyInput?.addEventListener('keydown', e => { if (e.key === 'Enter') submitBsky(); });
