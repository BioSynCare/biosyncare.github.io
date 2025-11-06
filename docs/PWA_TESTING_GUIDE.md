# PWA Testing Guide - BioSynCare Lab

This guide helps you verify and test the Progressive Web App (PWA) features implemented in BioSynCare Lab, including service workers, offline support, safety monitoring, and browser compatibility detection.

---

## Prerequisites

- Modern browser (Chrome/Edge 79+, Firefox 76+, Safari 14.1+)
- Local development server running on port 5173 (or deployed environment)
- Browser DevTools knowledge (F12 to open)

---

## 1. Service Worker Verification

### Check Registration Status

1. **Open Browser DevTools** (F12 or right-click → Inspect)
2. **Navigate to Application tab** (Chrome/Edge) or **Storage tab** (Firefox)
3. **Select "Service Workers"** from the left sidebar

**Expected Results**:
- ✅ Service worker status: **Activated and running**
- ✅ Source: `sw.js`
- ✅ Scope: `/`
- ✅ Update on reload: checkbox available

**Console Verification**:
```javascript
// Check if service worker is registered
navigator.serviceWorker.getRegistration().then(reg => {
  console.log('Service Worker registered:', reg ? 'Yes' : 'No');
  if (reg) console.log('Scope:', reg.scope);
});
```

---

## 2. Manifest Inspection

### Verify App Manifest

1. **In DevTools > Application tab**
2. **Select "Manifest"** from the left sidebar

**Expected Results**:
- ✅ **Name**: "BioSynCare Lab - Neurosensory Modulation"
- ✅ **Short name**: "BioSynCare"
- ✅ **Start URL**: `/`
- ✅ **Display**: `standalone`
- ✅ **Background color**: `#1a1a2e`
- ✅ **Theme color**: `#6366f1`
- ⚠️ **Icons**: Warning expected (not yet generated)

**Manual Verification**:
```bash
# Open manifest directly in browser
open http://localhost:5173/manifest.json
```

---

## 3. Cache Storage Verification

### Check Cached Assets

1. **In DevTools > Application tab**
2. **Select "Cache Storage"** from the left sidebar
3. **Expand the cache entries**

**Expected Caches**:
- ✅ `biosyncare-v1.0.0` (static assets)
- ✅ `biosyncare-runtime-v1.0.0` (runtime cached assets)

**Expected Cached Files** (in static cache):
- `/` (root)
- `/index.html`
- `/manifest.json`

**Console Verification**:
```javascript
// List all caches
caches.keys().then(names => {
  console.log('Available caches:', names);
  names.forEach(name => {
    caches.open(name).then(cache => {
      cache.keys().then(keys => {
        console.log(`${name} contains:`, keys.map(k => k.url));
      });
    });
  });
});
```

---

## 4. Offline Mode Testing

### Test Offline Functionality

1. **Load the application normally** (online)
2. **In DevTools > Network tab**, check **"Offline"** checkbox
3. **Refresh the page** (Cmd+R or Ctrl+R)

**Expected Results**:
- ✅ Page loads successfully from cache
- ✅ Console shows: `[ServiceWorker] Serving from cache`
- ✅ Core UI elements render correctly
- ⚠️ Firebase/external API calls fail gracefully

**Test Runtime Caching**:
1. Load app online and navigate through different sections
2. Enable offline mode
3. Navigate to previously visited sections

**Expected Results**:
- ✅ Previously loaded assets serve from cache
- ✅ New assets show offline fallback messages

---

## 5. Install Testing

### Desktop Installation

1. **Look for install icon** in browser address bar (Chrome/Edge)
   - Icon: ⊕ (plus in circle) or 🖥️ (computer screen)
2. **Click the install icon**
3. **Follow installation prompt**

**Expected Results**:
- ✅ Install prompt appears with app name and icon
- ✅ After install, app opens in standalone window (no browser UI)
- ✅ Console shows: `[PWA] App installed successfully`

**Programmatic Install Prompt**:
```javascript
// Check if install prompt is available
import { pwaInstaller } from './src/core/pwa-installer.js';

console.log('Can install:', pwaInstaller.canInstall());
console.log('Is installed:', pwaInstaller.isInstalled());

// Trigger install prompt programmatically
if (pwaInstaller.canInstall()) {
  pwaInstaller.promptInstall().then(accepted => {
    console.log('User accepted install:', accepted);
  });
}
```

### Mobile Installation (iOS Safari)

1. **Open app in Safari on iPhone/iPad**
2. **Tap Share button** (square with arrow)
3. **Scroll down and tap "Add to Home Screen"**
4. **Tap "Add"**

**Expected Results**:
- ✅ App icon appears on home screen
- ✅ Opening from home screen shows splash screen
- ✅ App runs in standalone mode (no Safari UI)

---

## 6. Compatibility Check Verification

### Browser Feature Detection

**Console Verification**:
```javascript
import { compatChecker } from './src/core/compat-check.js';

// Run full compatibility check
const result = compatChecker.check();

console.log('Supported:', result.supported);
console.log('Features:', result.features);
console.log('Warnings:', result.warnings);
console.log('Errors:', result.errors);
console.log('Recommendations:', result.recommendations);

// Check specific features
console.log('Web Audio:', compatChecker.supports('webAudio'));
console.log('AudioWorklet:', compatChecker.supports('audioWorklet'));
console.log('Service Worker:', compatChecker.supports('serviceWorker'));
console.log('Local Storage:', compatChecker.supports('localStorage'));
```

**Expected Results** (modern browser):
- ✅ `supported: true`
- ✅ All features: `true`
- ✅ No errors
- ⚠️ Possible warnings for mobile devices

**Test in Older Browser**:
- Try in Safari 13 or Firefox 60 to see graceful degradation
- Should show specific warnings for missing features

---

## 7. Safety Monitor Testing

### Volume & Session Safety

**Console Commands**:
```javascript
// Access the audio engine (assuming it's initialized)
const engine = window.audioEngine || audioEngine;

// Check safety status
console.log('Safety Status:', engine.getSafetyStatus());

// Expected output:
// {
//   enabled: true,
//   currentVolume: 0.0 - 1.0,
//   sessionDuration: <milliseconds>,
//   isSessionActive: true/false
// }
```

**Manual Tests**:

1. **Volume Warning Test**:
   - Play audio from the UI
   - Increase volume slider to 80%+
   - Watch console for: `[Safety] WARNING: Volume level: high (0.8)`

2. **Emergency Stop Test**:
   - Increase volume to 95%+
   - Expected: Automatic volume reduction to 70%
   - Console: `[Safety] CRITICAL: Volume too high! Auto-reducing...`

3. **Session Duration Test**:
   - Let app run for 45+ minutes (or modify config for testing)
   - Expected: Console warning at 45 minutes
   - Expected: Graceful fadeout and stop at 60 minutes

**Modify Safety Thresholds** (for faster testing):
```javascript
// Access safety monitor
const safety = engine.safetyMonitor;

// Set shorter session duration (5 minutes for testing)
safety.config.maxSessionDuration = 5 * 60 * 1000;
safety.config.warningSessionDuration = 4 * 60 * 1000;

// Lower volume thresholds
safety.config.volumeWarningThreshold = 0.5;
safety.config.volumeEmergencyThreshold = 0.7;

console.log('Safety config updated for testing');
```

**Listen to Safety Events**:
```javascript
// Listen for safety warnings
window.addEventListener('audioSafetyWarning', (event) => {
  console.log('Safety Warning:', event.detail);
  // event.detail contains: { severity, type, message, volume, duration }
});

// Listen for emergency stops
window.addEventListener('audioEmergencyStop', (event) => {
  console.log('Emergency Stop:', event.detail);
});
```

---

## 8. Update Detection Testing

### Service Worker Updates

1. **With app running**, modify `sw.js`:
   - Change `CACHE_VERSION = 'v1.0.0'` to `CACHE_VERSION = 'v1.0.1'`
2. **Wait ~1 minute** (or refresh multiple times)

**Expected Results**:
- ✅ Console shows: `[PWA] Update available`
- ✅ New service worker in "waiting" state (DevTools)

**Activate Update**:
```javascript
import { pwaInstaller } from './src/core/pwa-installer.js';

// Check for update
console.log('Update available:', pwaInstaller.updateAvailable);

// Activate update (will reload page)
pwaInstaller.activateUpdate();
```

---

## 9. Cache Management Testing

### Clear Cache

**Via DevTools**:
1. DevTools > Application > Cache Storage
2. Right-click each cache → Delete

**Programmatically**:
```javascript
import { pwaInstaller } from './src/core/pwa-installer.js';

// Clear all caches
pwaInstaller.clearCache().then(success => {
  console.log('Cache cleared:', success);
});
```

### Precache URLs

```javascript
import { pwaInstaller } from './src/core/pwa-installer.js';

// Cache specific URLs
const urlsToCache = [
  '/src/core/audio-engine.js',
  '/src/core/change-ringing.js',
];

pwaInstaller.cacheUrls(urlsToCache).then(success => {
  console.log('URLs cached:', success);
});
```

---

## 10. Cross-Browser Testing Checklist

### Chrome/Edge (Chromium)
- [ ] Service worker registers successfully
- [ ] Install prompt appears
- [ ] Offline mode works
- [ ] Safety monitor functions correctly
- [ ] AudioWorklet support detected

### Firefox
- [ ] Service worker registers successfully
- [ ] Manifest recognized (check DevTools > Storage)
- [ ] Offline mode works
- [ ] Safety monitor functions correctly
- [ ] AudioWorklet support detected (Firefox 76+)

### Safari (macOS/iOS)
- [ ] Service worker registers successfully
- [ ] Add to Home Screen works (iOS)
- [ ] Offline mode works
- [ ] Safety monitor functions correctly
- [ ] AudioWorklet support detected (Safari 14.1+)
- [ ] webkit prefix warnings handled gracefully

---

## 11. Known Issues & Expected Warnings

### Expected Console Messages

**Normal Operation**:
```
[CompatCheck] Fully compatible
[PWA] Service worker registered: /
[BioSynCare] PWA & Safety systems initialized
```

**Expected Warnings**:
```
⚠️ manifest.json:14 No icon at /icons/icon-192x192.png
⚠️ manifest.json:15 No icon at /icons/icon-512x512.png
```
**Status**: Icons not yet generated (tracked in handoffs/web.md)

**Tailwind CSS Warning** (if using CDN):
```
⚠️ Using Tailwind via CDN
```
**Status**: Expected, not critical for functionality

### Not Yet Implemented
- 📋 PWA icon assets (72, 96, 128, 144, 152, 192, 384, 512px)
- 📋 UI integration for safety warnings (toast notifications)
- 📋 Enhanced offline fallback page
- 📋 Push notification handlers (stubs present)

---

## 12. Debugging Tips

### Service Worker Not Registering

**Check**:
1. Must be served over HTTPS or localhost
2. Check console for registration errors
3. Verify `sw.js` exists at root path

**Force Update**:
```javascript
navigator.serviceWorker.getRegistration().then(reg => {
  if (reg) reg.update();
});
```

### Cache Not Populating

**Check**:
1. Network requests are completing successfully
2. Service worker is activated (not just installed)
3. Request URLs match expected patterns

**Debug Fetch Events**:
```javascript
// In sw.js, add logging to fetch handler
self.addEventListener('fetch', (event) => {
  console.log('[SW] Fetch:', event.request.url);
  // ... existing code
});
```

### Safety Monitor Not Working

**Check**:
1. AudioEngine initialized with safety enabled
2. masterGain node exists
3. Audio context not suspended

**Debug**:
```javascript
const engine = window.audioEngine;
console.log('Safety monitor:', engine.safetyMonitor);
console.log('Safety enabled:', engine.safetyEnabled);
console.log('Master gain:', engine.masterGain);
```

---

## 13. Performance Metrics

### Lighthouse Audit

1. **Open DevTools > Lighthouse tab**
2. **Select "Progressive Web App"** category
3. **Click "Generate report"**

**Expected Scores**:
- PWA: 80+ (will improve to 100 when icons added)
- Performance: 90+
- Accessibility: 90+
- Best Practices: 90+

**Key PWA Criteria**:
- ✅ Registers a service worker
- ✅ Responds with 200 when offline
- ✅ Provides a valid manifest
- ⚠️ Has maskable icon (pending icon generation)
- ✅ Uses HTTPS (when deployed)

---

## Next Steps

After testing, consider:

1. **Generate PWA Icons**:
   ```bash
   # Use a tool like PWA Asset Generator
   npx @vite-pwa/assets-generator --preset minimal public/icon.svg
   ```

2. **Add UI Integration**:
   - Toast notifications for safety warnings
   - Install prompt button in UI
   - Offline indicator banner
   - Update available notification

3. **Enhanced Offline Experience**:
   - Custom offline fallback page
   - Cached audio preset data
   - Downloadable session presets

4. **Analytics**:
   - Track install rate
   - Monitor safety trigger frequency
   - Measure offline usage patterns

---

**Questions or Issues?**
Check [handoffs/web.md](../handoffs/web.md) for current status and next steps.
