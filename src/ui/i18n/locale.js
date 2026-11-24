import { strings as portuguese } from './pt-BR.js';

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]));
}

function merge(target, overrides) {
  for (const [key, value] of Object.entries(overrides || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) merge(target[key], value);
    else target[key] = value;
  }
  return target;
}

export function createLocale(overrides) {
  return merge(clone(portuguese), overrides);
}
