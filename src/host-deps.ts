// Host dependency injection point — the ONLY module that touches the
// loader's `require`.  The browser artifact is a classic script, so bare
// specifiers like 'react' cannot be imported by source modules at runtime;
// instead main.ts's factory receives `require` from the module loader and
// funnels the instances here.  Tests inject stubs through the same function.
//
// The web shell seeds react-dom and the design-system primitives as static
// modules, so these requires resolve synchronously.  `Tooltip` is the same
// instant tooltip the host's "context used" meter uses; the two popup hooks
// plus react-dom's `createPortal` are exactly what that meter's
// click-to-open panel is built from.  React itself is mandatory (a clear
// throw at init beats a mysterious null later); the design-system pieces
// are guarded: a host without them degrades to a native `title` tooltip
// and no popup, rather than failing to load.

// Typed as `any`-flavoured aliases of the real packages: the actual instances
// arrive at runtime, and components use them through these bindings.  The
// type-only import below is erased at build time.
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
// Components are plain functions invoked by React with their props; the
// props bag lives on the component, not on JSX/library types.  `h` accepts
// any component, so callers need no casts at the component boundary.
export let h: (type: any, props?: any, ...children: any[]) => any = null as unknown as typeof h;
export let Tooltip: any = null;
export let createPortal: ((el: unknown, target: unknown) => unknown) | null = null;
export let useAnchoredPosition: ((opts: AnchoredPositionOptions) => Record<string, unknown> | null) | null = null;
export let useDismissOnOutsidePointer: ((rootRef: unknown, open: boolean, setOpen: (v: boolean) => void, panelRef: unknown) => void) | null = null;

// The popup needs all four pieces; whether they exist is decided once per
// init, so the conditional hook calls in the components are stable per render.
export let POPUP_OK = false;

function tryRequire(require: RequireFn, spec: string): any {
  try {
    return require(spec);
  } catch {
    return null;
  }
}

export function initHostDeps(require: RequireFn): void {
  const react = require('react');
  if (!react || typeof react.createElement !== 'function') {
    throw new Error('status-pet: the host did not provide react — cannot initialise');
  }
  React = react;
  h = react.createElement;

  // Each optional seed is fetched once; a missing seed nulls its feature.
  const primitives = tryRequire(require, '@deepseek-ai/dsh-client-ui-primitives');
  const reactDom = tryRequire(require, 'react-dom');
  Tooltip = primitives && primitives.Tooltip ? primitives.Tooltip : null;
  useAnchoredPosition = primitives && primitives.useAnchoredPosition ? primitives.useAnchoredPosition : null;
  useDismissOnOutsidePointer = primitives && primitives.useDismissOnOutsidePointer ? primitives.useDismissOnOutsidePointer : null;
  createPortal = reactDom && reactDom.createPortal ? reactDom.createPortal : null;
  POPUP_OK = !!(Tooltip && createPortal && useAnchoredPosition && useDismissOnOutsidePointer);
}
