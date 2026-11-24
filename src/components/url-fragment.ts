"use client";

import { useSyncExternalStore } from "react";

function subscribeToFragment(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readFragment() {
  return window.location.hash;
}

export function selectFragment(fragment: string) {
  if (readFragment() === fragment) return;
  const oldURL = window.location.href;
  window.history.pushState(null, "", fragment);
  // pushState changes the URL without firing hashchange.
  window.dispatchEvent(
    new HashChangeEvent("hashchange", { oldURL, newURL: window.location.href }),
  );
}

export function useUrlFragment() {
  return useSyncExternalStore(subscribeToFragment, readFragment, () => "");
}
