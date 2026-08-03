import { createContext } from 'react';

import { routeInfoSubscribe } from '../global-state/routeInfoCache';
import { store } from '../global-state/store';
import type { ReactNavigationState } from '../global-state/types';
import { LoaderSuspenseStore } from './LoaderSuspenseStore';
import { bumpDevLoaderRevision } from './utils';

type LoaderFetcher = (path: string, signal?: AbortSignal) => Promise<unknown>;
type LoaderResult = { data: unknown } | { error: unknown };
type LoaderSubscriber = (result: LoaderResult) => void;

interface LoaderSource {
  subscribers: Set<LoaderSubscriber>;
  fetching: boolean;
  ending: boolean;
  controller: AbortController | null;
}

export class LoaderClient {
  private active = new Map<string, LoaderSource>();
  private fetchers = new Map<string, LoaderFetcher>();
  private routeKeys = new Map<string, string>();
  private version = 0;
  private listeners = new Set<() => void>();

  readonly suspense = new LoaderSuspenseStore();

  // Arrow-bound so `loaderClient.subscribe` returns a stable reference across renders,
  // which keeps `useSyncExternalStore()` from tearing down and re-attaching every render.
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): number => {
    return this.version;
  };

  notify() {
    this.version++;
    for (const listener of this.listeners) {
      listener();
    }
  }

  subscribeLoader(path: string, callback: LoaderSubscriber = () => {}): () => void {
    let source = this.active.get(path);
    if (!source) {
      source = { subscribers: new Set(), fetching: false, ending: false, controller: null };
      this.active.set(path, source);
    }
    source.ending = false;
    source.subscribers.add(callback);

    let subscribed = true;
    return () => {
      if (!subscribed) {
        return;
      }
      subscribed = false;
      source.subscribers.delete(callback);
      if (source.subscribers.size === 0) {
        this.scheduleTeardown(path, source);
      }
    };
  }

  trackRoute(path: string, routeKey: string) {
    this.routeKeys.set(path, routeKey);
  }

  onNavigationStateChange(state: ReactNavigationState | undefined) {
    const presentKeys = new Set<string>();
    const walk = (node: ReactNavigationState | undefined) => {
      for (const route of node?.routes ?? []) {
        if (route.key) {
          presentKeys.add(route.key);
        }
        walk(route.state);
      }
    };
    walk(state);

    for (const [path, routeKey] of this.routeKeys) {
      if (!presentKeys.has(routeKey)) {
        this.abandon(path);
      }
    }
  }

  abandon(path: string) {
    this.routeKeys.delete(path);
    const entry = this.suspense.get(path);
    if (entry === undefined) {
      return;
    }
    const source = this.active.get(path);
    if (entry instanceof Promise) {
      if (source) {
        source.controller?.abort();
        this.active.delete(path);
      }
    } else if (source && source.subscribers.size > 0) {
      return;
    }
    this.suspense.clear(path);
  }

  registerFetcher(path: string, fetcher: LoaderFetcher) {
    this.fetchers.set(path, fetcher);
  }

  execute(path: string, fetcher?: LoaderFetcher) {
    if (fetcher) {
      this.fetchers.set(path, fetcher);
    }
    const source = this.active.get(path);
    const fetcherFn = this.fetchers.get(path);
    if (!source || !fetcherFn || source.fetching) {
      return;
    }

    source.fetching = true;
    const controller = new AbortController();
    source.controller = controller;
    fetcherFn(path, controller.signal).then(
      (data) => this.settle(path, source, { data }),
      (error) =>
        this.settle(path, source, {
          error: new Error(`Failed to load loader data for route: ${path}`, { cause: error }),
        })
    );
  }

  invalidateAll() {
    for (const [path, source] of this.active) {
      if (source.subscribers.size > 0) {
        this.execute(path);
      }
    }
    for (const path of this.suspense.keys()) {
      const source = this.active.get(path);
      if (!source || source.subscribers.size === 0) {
        this.suspense.clear(path);
      }
    }
    this.notify();
  }

  consumeHydrationData(path: string) {
    const hydrationData = globalThis.__EXPO_ROUTER_LOADER_DATA__;
    if (!hydrationData || !(path in hydrationData)) {
      return;
    }

    this.suspense.seed(path, hydrationData[path]);
    delete hydrationData[path];
  }

  clear() {
    this.active.clear();
    this.fetchers.clear();
    this.routeKeys.clear();
    this.suspense.reset();
  }

  private scheduleTeardown(path: string, source: LoaderSource) {
    source.ending = true;
    queueMicrotask(() => {
      if (source.ending && source.subscribers.size === 0 && this.active.get(path) === source) {
        source.controller?.abort();
        this.active.delete(path);
        this.suspense.teardown(path);
      }
    });
  }

  private settle(path: string, source: LoaderSource, result: LoaderResult) {
    source.fetching = false;
    source.controller = null;
    if (this.active.get(path) === source) {
      this.suspense.set(path, result);
    }
    for (const subscriber of source.subscribers) {
      subscriber(result);
    }
    this.notify();
  }
}

export const defaultLoaderClient = new LoaderClient();
export const LoaderClientContext = createContext<LoaderClient>(defaultLoaderClient);

if (typeof window !== 'undefined') {
  routeInfoSubscribe(() => {
    defaultLoaderClient.onNavigationStateChange(store.state);
  });
}

// On `loader-invalidate`, drop any unconsumed server-injected data, bump the dev revision so
// refetches bypass the platform cache, and refresh live readers in place.
if (__DEV__ && typeof window !== 'undefined') {
  globalThis.__EXPO_LOADER_INVALIDATE_LISTENERS__ ??= [];

  if (!globalThis.__EXPO_LOADER_INVALIDATE_LISTENER_REGISTERED__) {
    globalThis.__EXPO_LOADER_INVALIDATE_LISTENER_REGISTERED__ = true;
    globalThis.__EXPO_LOADER_INVALIDATE_LISTENERS__.push(() => {
      delete globalThis.__EXPO_ROUTER_LOADER_DATA__;
      bumpDevLoaderRevision();
      defaultLoaderClient.invalidateAll();
    });
  }
}
