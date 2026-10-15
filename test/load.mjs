// Loads an extension script the way the browser does (a classic script) and returns its global.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function load(file, extra = {}) {
  const ctx = vm.createContext({ URL, console, ...extra });
  vm.runInContext(readFileSync(new URL(`../extension/${file}`, import.meta.url), 'utf8'), ctx, { filename: file });
  return ctx;
}
