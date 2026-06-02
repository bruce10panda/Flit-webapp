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
