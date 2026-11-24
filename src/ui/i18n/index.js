import { strings as ptBR } from './pt-BR.js';
import { strings as es } from './es.js';
import { strings as en } from './en.js';
import { strings as fr } from './fr.js';

const locales = { 'pt-BR': ptBR, es, en, fr };

export function getStrings(locale = 'pt-BR') {
  return locales[locale] || ptBR;
}

export function translateText(value, locale = 'pt-BR') {
  const text = String(value ?? '');
  const trimmed = text.trim();
  if (!trimmed) return text;
  const target = getStrings(locale);
  const sources = Object.values(locales);
  for (const key of Object.keys(ptBR.ui)) {
    if (sources.some(source => source.ui[key] === trimmed)) {
      const leading = text.match(/^\s*/)?.[0] || '';
      const trailing = text.match(/\s*$/)?.[0] || '';
      return `${leading}${target.ui[key]}${trailing}`;
    }
  }
  for (const group of ['navigation', 'errors', 'credit', 'messages']) {
    for (const key of Object.keys(ptBR[group])) {
      if (sources.some(source => source[group][key] === trimmed)) return target[group][key];
    }
  }
  const dynamicMessages = [
    [/^Limite de 5 min · gravado (.+) · (.+) MB$/, 'maxDuration', ['duration','size']],
    [/^Limite de tamanho · gravado (.+) · (.+) MB$/, 'maxBytes', ['duration','size']],
    [/^Memória alta · gravação encerrada em (.+)$/, 'memoryLimit', ['duration']],
    [/^Gravado · (.+) · (.+) MB · use Salvar$/, 'recordingReady', ['duration','size']],
    [/^Gravando (.+) · (\d+)×(\d+) · (sem áudio|com áudio do app) · até 5 min$/, 'recordingStart', ['format','width','height','audio']],
    [/^Duração: (.+)$/, 'duration', ['duration']],
  ];
  for (const [pattern, key, fields] of dynamicMessages) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    let translated = target.messages[key];
    fields.forEach((field, index) => {
      const value = field === 'audio'
        ? (match[index + 1] === 'sem áudio' ? target.ui.audioNotIncluded : target.ui.audioIncluded)
        : match[index + 1];
      const placeholder = `{${field}}`;
      if (translated.includes(placeholder)) translated = translated.replace(placeholder, value);
      else if (field === 'audio') translated = translated.replace(/sem áudio|no audio|sin audio|sans son/, value);
    });
    return translated;
  }
  const flatten = (object, prefix = '') => Object.entries(object || {}).flatMap(([key, item]) =>
    item && typeof item === 'object' ? flatten(item, `${prefix}${key}.`) : [[`${prefix}${key}`, item]]);
  const readPath = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
  for (const [path, sourceText] of flatten(ptBR.app)) {
    if (sourceText === trimmed || sources.some(source => readPath(source.app, path) === trimmed)) {
      const translated = readPath(target.app, path);
      if (typeof translated === 'string') return translated;
    }
  }
  return text;
}
