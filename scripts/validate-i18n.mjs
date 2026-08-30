import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const LOCALE_DIR = join(ROOT, 'src', 'i18n');
const SOURCE_DIR = join(ROOT, 'src');
const SOURCE_LOCALE = 'en';
const HTML = /<\/?[a-z][^>]*>/i;
const DANGEROUS_HTML = /<(script|style|iframe|object|embed)|\son\w+\s*=|javascript:/i;
const TOKEN = /{{\s*([a-zA-Z][\w-]*)\s*}}/g;
const CALL = /(?:\bt\s*\(|\bi18n\.t\s*\(|\btranslate\s*\()\s*(['"`])([^'"`$]+)\1/g;

function flatten(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce((result, [key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof item === 'string') result[path] = item;
    else Object.assign(result, flatten(item, path));
    return result;
  }, {});
}

function tokens(value) {
  return [...value.matchAll(TOKEN)].map(match => match[1]).sort();
}

function same(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }));
  return nested.flat();
}

async function catalogs() {
  const paths = (await readdir(LOCALE_DIR)).filter(name => name.endsWith('.json'));
  const result = new Map();
  await Promise.all(paths.map(async name => {
    const locale = name.slice(0, -5);
    const raw = await readFile(join(LOCALE_DIR, name), 'utf8');
    result.set(locale, flatten(JSON.parse(raw)));
  }));
  return result;
}

async function usedKeys() {
  const paths = (await files(SOURCE_DIR)).filter(path => /\.(ts|tsx|js|jsx)$/.test(path) && !path.includes('/i18n/'));
  const keys = new Set();
  for (const path of paths) {
    const content = await readFile(path, 'utf8');
    for (const match of content.matchAll(CALL)) keys.add(match[2]);
  }
  return keys;
}

function validateLocale(locale, source, target, referenced) {
  const errors = [];
  for (const [key, sourceValue] of Object.entries(source)) {
    const translation = target[key];
    if (typeof translation !== 'string' || !translation.trim()) errors.push(`${locale}:${key}: missing translation`);
    else {
      if (!same(tokens(sourceValue), tokens(translation))) errors.push(`${locale}:${key}: interpolation mismatch`);
      if (DANGEROUS_HTML.test(translation)) errors.push(`${locale}:${key}: unsafe HTML`);
      if (HTML.test(translation) && !HTML.test(sourceValue)) errors.push(`${locale}:${key}: unexpected HTML`);
    }
  }
  for (const key of Object.keys(target)) {
    const pluralBase = key.replace(/_(zero|one|two|few|many|other)$/, '');
    if (!Object.hasOwn(source, key) && !Object.hasOwn(source, pluralBase)) errors.push(`${locale}:${key}: unused catalog key`);
  }
  for (const key of referenced) if (!Object.hasOwn(source, key)) errors.push(`${locale}:${key}: referenced key missing from source catalog`);
  return errors;
}

const all = await catalogs();
const source = all.get(SOURCE_LOCALE);
if (!source) throw new Error(`Source locale ${SOURCE_LOCALE}.json is required.`);
const referenced = await usedKeys();
const errors = [...all.entries()]
  .filter(([locale]) => locale !== SOURCE_LOCALE)
  .flatMap(([locale, target]) => validateLocale(locale, source, target, referenced));

if (errors.length) {
  console.error(`Locale validation failed with ${errors.length} problem(s):`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exitCode = 1;
} else console.log(`Locale validation passed for ${all.size} catalogs and ${referenced.size} referenced keys.`);
