const root = document.documentElement;

const updateTextColor = () => {
  const style = getComputedStyle(root);
  const offset = parseFloat(style.getPropertyValue('--lightness-offset'));
  const baseH = style.getPropertyValue('--base-h').trim();

  // If offset > 0, the "white box" is active, so use dark text
  if (offset > 0) {
    // Dark text for light backgrounds
    root.style.setProperty('--text-color-100', 'hsl(' + baseH + ', 20%, 20%)');
    root.style.setProperty('--text-color-65', 'hsla(' + baseH + ', 20%, 20%, 0.65)');
    root.style.setProperty('--text-color-50', 'hsla(' + baseH + ', 20%, 20%, 0.5)');
  } else {
    // Light text for dark backgrounds
    root.style.setProperty('--text-color-100', 'hsl(0, 0%, 100%)');
    root.style.setProperty('--text-color-65', 'hsla(0, 0%, 100%, 0.65)');
    root.style.setProperty('--text-color-50', 'hsla(0, 0%, 100%, 0.5)');
  }
};

// Initial run
updateTextColor();