document.querySelector('#close-sidebar-btn')?.addEventListener('click', () => {
    window.location.href = 'index.html';
});

const addBtn = document.querySelector('#add-btn');

addBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    addBtn.classList.toggle('open');
});

addBtn?.querySelectorAll('.add-btn-row').forEach((row, i) => {
    row.addEventListener('click', (e) => {
        if (!addBtn.classList.contains('open')) return;
        e.stopPropagation();
        if (i === 0) window.location.href = 'add-source.html';
        if (i === 1) window.location.href = 'new-space.html';
    });
});

document.addEventListener('click', () => {
    addBtn?.classList.remove('open');
});

document.addEventListener('DOMContentLoaded', async () => {
    const profile = await loadAndApplyTheme();
    if (!profile) return;

    const activeIndex = parseInt(localStorage.getItem('activeSpaceIndex') || '0', 10);
    const list = document.querySelector('#spaces-list');

    profile.spaces.forEach((space, i) => {
        const item = document.createElement('div');
        item.className = 'list-option';
        item.innerHTML = `<p>${space.emoji || ''}</p><p>${space.name}</p>`;
        if (i === activeIndex) item.style.opacity = '1';

        item.addEventListener('click', () => {
            localStorage.setItem('activeSpaceIndex', i);
            window.location.href = 'index.html';
        });

        list.appendChild(item);
    });
});
