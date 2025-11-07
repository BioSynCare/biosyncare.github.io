// Storage Mode Detection for Annotation/Telemetry
// Attempts anonymous Firebase auth to decide if collaborative cloud features are available.
// Falls back silently to localStorage when restricted.

import { ensureAnonymousUser } from '../utils/firebase.js';

let cached = null;

export async function detectStorageMode() {
  if (cached) return cached;
  try {
    const user = await ensureAnonymousUser();
    if (user && user.user && user.user.uid) {
      cached = { mode: 'firebase', detail: 'Firebase (anonymous session)', uid: user.user.uid };
    } else if (user && user.uid) {
      cached = { mode: 'firebase', detail: 'Firebase (anonymous session)', uid: user.uid };
    } else {
      cached = { mode: 'local', detail: 'LocalStorage only (no auth UID)' };
    }
  } catch (e) {
    cached = { mode: 'local', detail: 'LocalStorage only (auth disabled)' };
  }
  return cached;
}

export function getCachedStorageMode() {
  return cached;
}
