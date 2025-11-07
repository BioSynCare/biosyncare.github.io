# PWA Install Button - Debug Instructions

## Issue Found: Service Worker Caching

The PWA install button code was updated with new debug logging, but the **service worker was serving the old cached version** of `pwa-install-button.js`.

### Root Cause

The service worker ([sw.js:105-112](sw.js#L105)) uses a **cache-first strategy**:
1. Check cache first
2. If found, serve cached version (even if file changed on disk)
3. Only fetch from network if not in cache

This meant your browser was loading the old version of the button component without the new debug logging.

### Fix Applied

**Updated**: [sw.js:15](sw.js#L15)
```javascript
const CACHE_VERSION = 'v1.0.1'; // Was v1.0.0
```

Bumping the cache version forces the service worker to:
1. Install new version
2. Delete old caches (`biosyncare-v1.0.0`, `biosyncare-runtime-v1.0.0`)
3. Re-cache all assets with new version

---

## What To Do Now

### Step 1: Hard Refresh
**macOS**: `Cmd + Shift + R`
**Windows/Linux**: `Ctrl + Shift + R`

This will:
- Reload the page
- Install the new service worker (v1.0.1)
- Load the updated pwa-install-button.js with debug logging

### Step 2: Check Console

You should now see ALL of these logs:

```
[PWA] Creating install button...
[createInstallButton] Creating button with options: Object
[PWAInstallButton] Initializing button... Object
[PWAInstallButton] Element created: div.pwa-install-container
[PWAInstallButton] Checking initial visibility...
[PWAInstallButton] Visibility check: Object { canInstall: false, isInstalled: true, ... }
[createInstallButton] Position is not inline, will append to body
[createInstallButton] document.readyState: interactive (or complete)
[createInstallButton] DOM already loaded, appending immediately
[createInstallButton] Button appended to body, children count: 3
[PWA] Install button created: Object { visible: true, canInstall: false, isInstalled: true }
```

### Step 3: Verify Button in DOM

Run in browser console:
```javascript
document.querySelectorAll('.pwa-install-container')
// Should return: NodeList [div.pwa-install-container]

document.body.children
// Should include the button container
```

### Step 4: Check Button Visibility

If button is in DOM but not visible, check:
```javascript
const btn = document.querySelector('.pwa-install-container');
console.log('Display:', btn.style.display);
console.log('Visibility:', btn.style.visibility);
console.log('Opacity:', btn.style.opacity);
console.log('Position:', window.getComputedStyle(btn).position);
console.log('Bounding box:', btn.getBoundingClientRect());
```

---

## Expected Behavior

### Scenario 1: App Not Installed
- `canInstall: true`, `isInstalled: false`
- Button shows: **"Install App"** (blue background)
- Button visible in bottom-right corner

### Scenario 2: App Already Installed
- `canInstall: false`, `isInstalled: true`
- Button shows: **"App Installed ✓"** (green background)
- Button visible in bottom-right corner (because `hideWhenInstalled: false`)

### Scenario 3: User Dismissed Button
- localStorage has: `pwa-install-dismissed = "true"`
- Button hidden (display: none)

---

## Troubleshooting

### Still No Logs?

1. **Check service worker updated**:
   - DevTools → Application → Service Workers
   - Should show: `#worker_id activated` with new timestamp
   - Cache Storage should show: `biosyncare-v1.0.1`

2. **Force service worker update**:
   - DevTools → Application → Service Workers
   - Check "Update on reload"
   - Hard refresh again

3. **Nuclear option - Clear everything**:
   ```javascript
   // Run in console
   navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => reg.unregister()));
   caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
   localStorage.clear();
   location.reload();
   ```

### Button in DOM But Not Visible?

Check if dismissed:
```javascript
localStorage.getItem('pwa-install-dismissed')
// If "true", the button is intentionally hidden
```

Reset dismissal:
```javascript
localStorage.removeItem('pwa-install-dismissed');
location.reload();
```

### Button Shows But Wrong State?

Check install state:
```javascript
import('./src/core/pwa-installer.js').then(({ pwaInstaller }) => {
  console.log('Status:', pwaInstaller.getStatus());
  console.log('Can install:', pwaInstaller.canInstall());
  console.log('Is installed:', pwaInstaller.isInstalled());
});
```

---

## Service Worker Caching Strategy

For future reference, here's how the caching works:

### Cache-First (Default for Static Assets)
```
Request → Check cache → If found: Serve cached
                     ↓
                  If not found: Fetch from network → Cache → Serve
```

**Pros**: Fast, works offline
**Cons**: Can serve stale files if cache not invalidated

### How to Force Cache Update
1. **Bump CACHE_VERSION** in sw.js (recommended for production)
2. **Hard refresh** (bypasses cache for that load only)
3. **DevTools "Disable cache"** (only while DevTools open)
4. **Update on reload** (DevTools → Application → Service Workers)

---

**Cache Version Updated**: v1.0.0 → v1.0.1
**Files with New Logging**: [src/ui/pwa-install-button.js:322-349](src/ui/pwa-install-button.js#L322)
**Date**: 2025-11-07
