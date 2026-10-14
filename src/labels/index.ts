// The pet's copy, in every shipped locale.
//
// The host's locale service registers one dictionary per namespace; the slot
// then hands each component its bound translator as a `t` prop.  Both halves
// are needed: `bind` serves the registration-time label thunk, while the
// component's own `t` follows the active locale on re-render.
//
// A slot in a host with no locale service still gets a working pet: the
// fallback translator interpolates `{param}` against English.
//
// The speech lines (`labels/lines/*.ts`) are merged in here rather than being a
// dict of their own.  A pool is an ordered list, so its structure lives in
// `behavior/line-pools.ts`; but a pool ENTRY is looked up by id at render time,
// and the ONLY locale-aware lookup the slot API offers is `t` — there is no
// "current locale" prop.  So the entries join the dictionary, and the two
// locales are kept symmetric by test/labels.test.ts.

import { en } from './en.ts';
import { zh } from './zh.ts';
import { LINES_EN } from './lines/en.ts';
import { LINES_ZH } from './lines/zh.ts';

export const NS = 'status-pet';

export type Locale = 'en' | 'zh';
export type LabelDict = Record<string, string>;

export const LABELS: Record<Locale, LabelDict> = {
  en: { ...en, ...LINES_EN },
  zh: { ...zh, ...LINES_ZH },
};

/** Used only when the slot supplies no translator at all. */
export const LABEL_FALLBACK: LabelDict = LABELS.en;

/** The `t` prop type the host hands every slot component. */
export type Translator = ((key: string, params?: Record<string, unknown>) => string) | null | undefined;

/** Resolve a translator prop into a guaranteed callable, with `{param}`
 *  interpolation even on the fallback path. */
export function translatorOrFallback(t: Translator): (key: string, params?: Record<string, unknown>) => string {
  if (typeof t === 'function') return t;
  return (key, params) => {
    let s = LABEL_FALLBACK[key] || key;
    if (params) {
      for (const name in params) s = s.replace('{' + name + '}', String(params[name]));
    }
    return s;
  };
}
