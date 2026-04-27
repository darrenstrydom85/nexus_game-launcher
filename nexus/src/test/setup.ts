import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import * as React from "react";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    isMaximized: () => Promise.resolve(false),
    onResized: () => Promise.resolve(() => {}),
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(() => Promise.resolve()),
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: vi.fn(() => Promise.resolve()),
  readTextFile: vi.fn(() => Promise.resolve("{}")),
  exists: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn(() => Promise.resolve()),
  openUrl: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(() => Promise.resolve(true)),
  onAction: vi.fn(() =>
    Promise.resolve({
      plugin: "notification",
      event: "actionPerformed",
      channelId: 1,
      unregister: vi.fn(() => Promise.resolve()),
    }),
  ),
  requestPermission: vi.fn(() => Promise.resolve("granted")),
  sendNotification: vi.fn(),
}));

const __motionMock = vi.hoisted(() => {
  const MOTION_PROPS = new Set([
    "initial", "animate", "exit", "transition", "variants",
    "whileHover", "whileTap", "whileFocus", "whileDrag", "whileInView",
    "layout", "layoutId",
  ]);

  function stripMotionProps(props: Record<string, unknown>) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (!MOTION_PROPS.has(key) && !key.startsWith("variants")) {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  return { stripMotionProps, useReducedMotion: vi.fn(() => false) };
});

vi.mock("motion/react", () => {
  const motion = new Proxy(
    {},
    {
      get: (_target, prop: string) =>
        React.forwardRef(
          ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref: React.Ref<HTMLElement>) =>
            React.createElement(prop, { ...__motionMock.stripMotionProps(props), ref }, children),
        ),
    },
  );

  return {
    motion,
    AnimatePresence: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
    useAnimation: () => ({ start: vi.fn(), stop: vi.fn() }),
    useMotionValue: (init: number) => ({ get: () => init, set: vi.fn() }),
    useTransform: (v: unknown) => v,
    useSpring: (v: unknown) => v,
    useReducedMotion: __motionMock.useReducedMotion,
  };
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  configurable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
}
