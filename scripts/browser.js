const SCROLLBAR_HIDE_CSS = `<style>::-webkit-scrollbar{display:none!important}html,body{scrollbar-width:none;-ms-overflow-style:none}</style>`;

async function fetchPageHTML(url) {
    const attempts = proxySources.map(proxy => fetch(proxy + encodeURIComponent(url)));
    try {
        const response = await Promise.any(attempts);
        return await response.text();
    } catch (err) {
        console.error('Browser: failed to fetch page', err);
        return null;
    }
}

async function loadBrowser() {
    await loadAndApplyTheme();

    const url = new URLSearchParams(window.location.search).get('url');
    if (!url) return;

    document.getElementById('browser-back').onclick = () => window.history.back();

    document.getElementById('browser-open-external').onclick = () => {
        if (window.__TAURI__) {
            window.__TAURI__.shell.open(url);
        } else {
            window.open(url, '_blank');
        }
    };

    const iframe = document.getElementById('browser-iframe');
    const loading = document.getElementById('browser-loading');

    iframe.addEventListener('load', () => {
        iframe.classList.add('loaded');
        loading.style.display = 'none';
    });

    const html = await fetchPageHTML(url);

    if (html) {
        const baseTag = `<base href="${url}">`;
        let injected = html.replace(/(<head[^>]*>)/i, `$1${baseTag}${SCROLLBAR_HIDE_CSS}`);
        if (injected === html) injected = baseTag + SCROLLBAR_HIDE_CSS + html;
        iframe.srcdoc = injected;
    }
}

document.addEventListener('DOMContentLoaded', loadBrowser);
