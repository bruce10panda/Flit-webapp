const root = document.documentElement;

// Updated to accept a theme object from profile.json
const applyProfileTheme = (theme) => {
  if (!theme) return;

  root.style.setProperty('--base-h', theme['base-hue']);
  root.style.setProperty('--saturation', theme['saturation'] + '%');
  root.style.setProperty('--lightness-offset', theme['lightness']);

  updateTextColor();
};

const updateTextColor = () => {
  const style = getComputedStyle(root);
  const offset = parseFloat(style.getPropertyValue('--lightness-offset'));
  const baseH = style.getPropertyValue('--base-h').trim();

  if (offset > 0) {
    root.style.setProperty('--text-color-100', `hsl(${baseH}, 20%, 20%)`);
    root.style.setProperty('--text-color-65', `hsla(${baseH}, 20%, 20%, 0.65)`);
    root.style.setProperty('--text-color-50', `hsla(${baseH}, 20%, 20%, 0.5)`);
  } else {
    root.style.setProperty('--text-color-100', 'hsl(0, 0%, 100%)');
    root.style.setProperty('--text-color-65', 'hsla(0, 0%, 100%, 0.65)');
    root.style.setProperty('--text-color-50', 'hsla(0, 0%, 100%, 0.5)');
  }
};