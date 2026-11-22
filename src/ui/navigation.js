export function createNavigation({ pages, buttons, initial = 'stage', onChange = () => {} }) {
  const pageMap = new Map(pages.map(page => [page.name, page.element]));
  const buttonMap = new Map(buttons.map(button => [button.name, button.element]));
  if (!pageMap.has(initial)) throw new RangeError('Unknown initial page: ' + initial);
  let current = null;
  function navigate(name, { focus = false } = {}) {
    const next = pageMap.get(name);
    if (!next) return false;
    const previous = current;
    for (const [pageName, element] of pageMap) {
      element.hidden = pageName !== name;
      if (pageName === name) element.setAttribute('aria-current', 'page');
      else element.removeAttribute('aria-current');
    }
    for (const [buttonName, element] of buttonMap) {
      if (buttonName === name) element.setAttribute('aria-current', 'page');
      else element.removeAttribute('aria-current');
    }
    current = name;
    if (focus) next.querySelector('h1')?.focus?.({ preventScroll: true });
    if (previous !== name) onChange(name, previous);
    return true;
  }
  for (const [name, element] of buttonMap) element.addEventListener('click', () => navigate(name));
  navigate(initial);
  return { navigate, get current() { return current; } };
}