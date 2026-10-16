// Host dependency injection — the ONLY module that touches the loader's
// `require`.  The browser artifact is a classic script, so bare specifiers like
// 'react' cannot be imported by source modules at runtime; instead the plugin
// factory receives `require` and funnels the instances here.  Tests inject
// stubs through the same function.
//
// The web shell seeds react-dom and the design-system primitives as static
// modules, so these requires resolve synchronously.  `Tooltip` is the same
// instant tooltip the host's "context used" meter uses; the two popup hooks
// plus react-dom's `createPortal` are exactly what that meter's click-to-open
// panel is built from.  React itself is mandatory (a clear throw at init beats
// a mysterious null later); the design-system pieces are guarded — a host
// without them degrades to a native `title` tooltip and no popup.

import type * as ReactNS from 'react';

export type ReactInstance = typeof ReactNS;
export type RequireFn = (spec: string) => any;

export interface AnchoredPositionOptions {
  open: boolean;
  anchorRef: { current: Element | null };
  panelRef: { current: HTMLElement | null };
  side: string;
  gap: number;
  margin: number;
}

export let React: ReactInstance = null as unknown as ReactInstance;
/** The host's own `createElement`, TYPED as such: a component's props are
 *  checked at every call site, so a source object that names the wrong field is
 *  a compile error instead of a canvas that silently stays blank. */
type CreateElement = typeof ReactNS.createElement;
export let h: CreateElement = null as unknown as CreateElement;
/** What a component may render — the children type for the plain functions
 *  (`field`) that build element trees without being components themselves. */
export type ReactNode = ReactNS.ReactNode;
export let Tooltip: any = null;
export let createPortal: ((el: ReactNS.ReactNode, target: Element) => ReactNS.ReactNode) | null = null;
export let useAnchoredPosition: ((opts: AnchoredPositionOptions) => Record<string, unknown> | null) | null = null;
export let useDismissOnOutsidePointer: ((rootRef: unknown, open: boolean, setOpen: (v: boolean) => void, panelRef: unknown) => void) | null = null;

export let POPUP_OK = false;

function tryRequire(require: RequireFn, spec: string): any {
  try { return require(spec); } catch { return null; }
}

export function initHostDeps(require: RequireFn): void {
  const react = require('react');
  if (!react || typeof react.createElement !== 'function') {
    throw new Error('status-pet: the host did not provide react — cannot initialise');
  }
  React = react;
  h = react.createElement;
  const primitives = tryRequire(require, '@deepseek-ai/dsh-client-ui-primitives');
  const reactDom = tryRequire(require, 'react-dom');
  Tooltip = primitives && primitives.Tooltip ? primitives.Tooltip : null;
  useAnchoredPosition = primitives && primitives.useAnchoredPosition ? primitives.useAnchoredPosition : null;
  useDismissOnOutsidePointer = primitives && primitives.useDismissOnOutsidePointer ? primitives.useDismissOnOutsidePointer : null;
  createPortal = reactDom && reactDom.createPortal ? reactDom.createPortal : null;
  POPUP_OK = !!(Tooltip && createPortal && useAnchoredPosition && useDismissOnOutsidePointer);
}
