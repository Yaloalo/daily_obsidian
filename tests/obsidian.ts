import { parse, stringify } from 'yaml';
/** Minimal Vault API fake: production continues to use the Obsidian host API. */
export class TFile { constructor(public path: string) {} }
export class TFolder { constructor(public path: string) {} }
export function normalizePath(path: string): string { return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '').replace(/\/$/, ''); }
export function parseYaml(source: string): unknown { return parse(source) as unknown; }

export function stringifyYaml(value: unknown): string { return stringify(value); }
