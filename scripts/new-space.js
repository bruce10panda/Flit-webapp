document.addEventListener('DOMContentLoaded', async () => {
    const profile = await loadAndApplyTheme();
    initFromProfile(profile);
});

document.querySelector('#back-btn')?.addEventListener('click', () => history.back());

// ── State ──────────────────────────────────────────────────────────────────

// mode 'dark'  → lightness 10-28%, sat 35-60%  (always looks like a real dark theme)
// mode 'light' → lightness 78-92%, sat 12-30%  (always looks like a real light theme)
let hue  = 236;   // 0-360
let dotY = 0.4;   // 0 (top/lighter) → 1 (bottom/darker)
let mode = 'dark';

const canvas  = document.getElementById('color-canvas');
const ctx     = canvas.getContext('2d');
const handle  = document.getElementById('color-handle');
const btnShuffle = document.getElementById('btn-shuffle');
const btnLight   = document.getElementById('btn-light');
const btnDark    = document.getElementById('btn-dark');

// ── Colour math ────────────────────────────────────────────────────────────

function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
        const k = (n + h / 30) % 12;
        const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex) {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

// Get the sat/light at a given dotY for the current mode
function getColorValues(y = dotY) {
    if (mode === 'dark') {
        return { s: 35 + (1 - y) * 25, l: 10 + (1 - y) * 18 };
    } else {
        return { s: 28 + (1 - y) * 32, l: 78 + (1 - y) * 14 };
    }
}

// Auto-generate a complementary fg colour that always looks great
function computeFg(h, s, l) {
    if (l < 50) {
        return hslToHex((h + 30) % 360, Math.min(s * 0.5, 28), 82);
    } else {
        return hslToHex((h + 210) % 360, Math.min(s * 0.35, 20), 18);
    }
}

// ── Canvas drawing ─────────────────────────────────────────────────────────

function drawCanvas() {
    const W = canvas.width, H = canvas.height;
    for (let x = 0; x < W; x++) {
        const h = (x / (W - 1)) * 360;
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        // top (y=0, dotY=0): lightest/most-saturated within mode
        // bottom (y=H, dotY=1): darkest/least-saturated within mode
        const top    = getColorValues(0);
        const bottom = getColorValues(1);
        grad.addColorStop(0, `hsl(${h}, ${top.s}%, ${top.l}%)`);
        grad.addColorStop(1, `hsl(${h}, ${bottom.s}%, ${bottom.l}%)`);
        ctx.fillStyle = grad;
        ctx.fillRect(x, 0, 1, H);
    }
}

// ── UI sync ────────────────────────────────────────────────────────────────

function updateHandle() {
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    handle.style.left = `${(hue / 360) * W}px`;
    handle.style.top  = `${dotY * H}px`;
}

function updateButtonStates() {
    btnLight.classList.toggle('active', mode === 'light');
    btnDark.classList.toggle('active',  mode === 'dark');
}

function applyTheme() {
    const { s, l } = getColorValues();
    applyProfileTheme({
        bg: hslToHex(hue, s, l),
        fg: computeFg(hue, s, l),
    });
}

function update() {
    updateHandle();
    updateButtonStates();
    applyTheme();
}

// ── Canvas drag ────────────────────────────────────────────────────────────

let dragging = false;

function readCanvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.touches?.[0]?.clientX ?? e.clientX;
    const cy = e.touches?.[0]?.clientY ?? e.clientY;
    hue  = Math.round(Math.max(0, Math.min(360, ((cx - rect.left) / rect.width)  * 360)));
    dotY = Math.max(0, Math.min(1,              (cy - rect.top)  / rect.height));
    update();
}

canvas.addEventListener('mousedown',  e => { dragging = true; handle.classList.add('dragging');    readCanvasPoint(e); });
canvas.addEventListener('touchstart', e => { dragging = true; handle.classList.add('dragging');    readCanvasPoint(e); }, { passive: true });
document.addEventListener('mousemove',  e => { if (dragging) readCanvasPoint(e); });
document.addEventListener('touchmove',  e => { if (dragging) readCanvasPoint(e); }, { passive: true });
document.addEventListener('mouseup',  () => { dragging = false; handle.classList.remove('dragging'); });
document.addEventListener('touchend', () => { dragging = false; handle.classList.remove('dragging'); });

// ── Buttons ────────────────────────────────────────────────────────────────

btnShuffle.addEventListener('click', () => {
    const startHue = hue;
    let target = Math.round(Math.random() * 360);
    // take the shortest path around the hue wheel
    let delta = ((target - startHue + 540) % 360) - 180;
    const duration = 350;
    const start = performance.now();
    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
    function step(now) {
        const t = Math.min((now - start) / duration, 1);
        hue = ((startHue + delta * easeOut(t)) % 360 + 360) % 360;
        drawCanvas();
        update();
        if (t < 1) requestAnimationFrame(step);
        else hue = ((target % 360) + 360) % 360;
    }
    requestAnimationFrame(step);
});

btnLight.addEventListener('click', () => {
    if (mode === 'light') return;
    mode = 'light';
    drawCanvas();
    update();
});

btnDark.addEventListener('click', () => {
    if (mode === 'dark') return;
    mode = 'dark';
    drawCanvas();
    update();
});

// ── Init ───────────────────────────────────────────────────────────────────

function initFromProfile(profile) {
    const activeIndex = parseInt(localStorage.getItem('activeSpaceIndex') || '0', 10);
    const bg = profile?.spaces?.[activeIndex]?.theme?.bg;

    if (bg) {
        const { h, s, l } = hexToHsl(bg);
        hue  = h;
        mode = l < 50 ? 'dark' : 'light';
        // Map l back to dotY for the current mode
        if (mode === 'dark') {
            dotY = 1 - Math.max(0, Math.min(1, (l - 10) / 18));
        } else {
            dotY = 1 - Math.max(0, Math.min(1, (l - 78) / 14));
        }
    }

    drawCanvas();
    update();
}
