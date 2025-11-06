# PWA Install Button - Usage Guide

Custom install button component for BioSynCare Lab PWA.

## Features

- ✅ **Auto-show/hide** - Only appears when app can be installed
- ✅ **Cross-browser** - Works on all platforms (Chrome, Safari, Firefox, Edge)
- ✅ **Mobile-friendly** - Optimized for touch interfaces
- ✅ **Customizable** - Flexible positioning and styling
- ✅ **Persistent dismissal** - Remembers if user dismissed it
- ✅ **Standalone detection** - Hides when app is already installed

## Quick Start

### Option 1: Auto-append (Floating Button)

Add to your main.js or index.html:

```javascript
import { createInstallButton } from './src/ui/pwa-install-button.js';

// Creates and auto-appends a floating button (bottom-right by default)
createInstallButton();
```

### Option 2: Custom Position

```javascript
import { createInstallButton } from './src/ui/pwa-install-button.js';

createInstallButton({
  position: 'top-right', // 'bottom-right', 'top-right', 'bottom-left', 'top-left', 'inline'
  text: 'Install BioSynCare',
});
```

### Option 3: Inline (Manual Placement)

```javascript
import { PWAInstallButton } from './src/ui/pwa-install-button.js';

const button = new PWAInstallButton({
  position: 'inline',
  showDismiss: false, // No dismiss button for inline
});

// Manually append wherever you want
document.querySelector('#install-container').appendChild(button.element);
```

### Option 4: Custom Styling

```javascript
import { PWAInstallButton } from './src/ui/pwa-install-button.js';

const button = new PWAInstallButton({
  text: 'Get the App',
  buttonClass: 'my-custom-button', // Use your own CSS class
  containerClass: 'my-custom-container',
  position: 'bottom-right',
});

document.body.appendChild(button.element);
```

Then in your CSS:

```css
.my-custom-button {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 16px 32px;
  border-radius: 12px;
  border: none;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}

.my-custom-button:hover {
  transform: translateY(-4px);
}
```

## API Reference

### Constructor Options

```javascript
new PWAInstallButton({
  // Button text
  text: 'Install App', // default

  // CSS classes
  containerClass: 'pwa-install-container', // default
  buttonClass: 'pwa-install-button', // default (uses built-in styles)

  // Positioning
  position: 'bottom-right', // 'bottom-right', 'top-right', 'bottom-left', 'top-left', 'inline'

  // Behavior
  hideWhenInstalled: true, // default - hide button when app is installed
  showDismiss: true, // default - show dismiss (×) button

  // Callbacks
  onInstalled: () => {
    console.log('User installed the app!');
    // Show success message, confetti, etc.
  },
});
```

### Methods

```javascript
const button = new PWAInstallButton();

// Trigger install prompt programmatically
await button.install(); // Returns true if user accepted

// Show/hide button manually
button.show();
button.hide();

// Dismiss button (saves to localStorage)
button.dismiss();

// Reset dismissal (show button again)
button.resetDismissal();

// Check visibility
console.log(button.visible); // true/false

// Clean up
button.destroy();
```

## Examples

### Example 1: Simple Floating Button

```javascript
// In your main.js or at the end of index.html
import { createInstallButton } from './src/ui/pwa-install-button.js';

createInstallButton({
  text: 'Install App',
  position: 'bottom-right',
});
```

### Example 2: Header Install Button

```html
<!-- In your HTML -->
<header>
  <h1>BioSynCare Lab</h1>
  <div id="install-btn-container"></div>
</header>
```

```javascript
// In your JS
import { PWAInstallButton } from './src/ui/pwa-install-button.js';

const button = new PWAInstallButton({
  position: 'inline',
  text: 'Install',
  showDismiss: false,
  buttonClass: 'header-install-btn',
});

document.getElementById('install-btn-container').appendChild(button.element);
```

### Example 3: With Success Notification

```javascript
import { PWAInstallButton } from './src/ui/pwa-install-button.js';

const button = new PWAInstallButton({
  onInstalled: () => {
    // Show success message
    const toast = document.createElement('div');
    toast.textContent = '✅ App installed successfully!';
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #10b981;
      color: white;
      padding: 16px 32px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
    `;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  },
});

document.body.appendChild(button.element);
```

### Example 4: Conditional Display (Only on Homepage)

```javascript
import { PWAInstallButton } from './src/ui/pwa-install-button.js';

// Only show install button on homepage
if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
  const button = new PWAInstallButton({
    position: 'bottom-right',
  });
  document.body.appendChild(button.element);
}
```

### Example 5: In Settings Panel

```html
<div class="settings-panel">
  <h3>App Settings</h3>
  <div class="setting-item">
    <label>Install as App</label>
    <div id="install-setting"></div>
  </div>
</div>
```

```javascript
import { PWAInstallButton } from './src/ui/pwa-install-button.js';

const button = new PWAInstallButton({
  position: 'inline',
  text: 'Install',
  showDismiss: false,
});

document.getElementById('install-setting').appendChild(button.element);
```

## Browser Support

| Browser | Desktop | Mobile | Notes |
|---------|---------|--------|-------|
| Chrome | ✅ | ✅ | Full support |
| Edge | ✅ | ✅ | Full support |
| Firefox | ✅ | ✅ | Full support |
| Safari | ⚠️ | ✅ | Button works, but iOS uses "Add to Home Screen" flow |
| Opera | ✅ | ✅ | Full support |
| Samsung Internet | - | ✅ | Full support |

**Note:** On iOS Safari, the button will trigger `promptInstall()`, but the browser doesn't support programmatic install prompts. Users must use the Share → "Add to Home Screen" flow. The button can still be used to show instructions.

## Handling iOS Safari

For iOS Safari users, you can detect and show custom instructions:

```javascript
import { PWAInstallButton } from './src/ui/pwa-install-button.js';
import { pwaInstaller } from './src/core/pwa-installer.js';

const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const isSafari = /Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent);

const button = new PWAInstallButton({
  text: isIOS && isSafari ? 'Add to Home Screen' : 'Install App',
  onInstalled: () => {
    if (isIOS && isSafari) {
      // Show iOS-specific instructions
      showIOSInstructions();
    }
  },
});

function showIOSInstructions() {
  alert('To install:\n1. Tap the Share button\n2. Scroll and tap "Add to Home Screen"\n3. Tap "Add"');
}

document.body.appendChild(button.element);
```

## Styling Tips

The default button uses these styles (which you can override):

```css
/* Default button styles (built-in) */
.pwa-install-button {
  background-color: #6366f1; /* Indigo */
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.pwa-install-button:hover {
  background-color: #4f46e5;
  transform: translateY(-2px);
  box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1);
}
```

To match your app's design system, use the `buttonClass` option with your own CSS.

## Testing

```javascript
// Test button visibility
console.log('Install available:', pwaInstaller.canInstall());
console.log('Already installed:', pwaInstaller.isInstalled());
console.log('Button visible:', button.visible);

// Force show button (for testing)
button.show();

// Reset dismissal (for testing)
button.resetDismissal();

// Test install flow
await button.install();
```

## Troubleshooting

### Button doesn't appear

**Check:**
1. PWA requirements met (service worker, manifest, icons)
2. App not already installed
3. User hasn't dismissed button (check localStorage: `pwa-install-dismissed`)
4. Browser supports install prompt (Chrome/Edge/Firefox)

**Debug:**
```javascript
import { pwaInstaller } from './src/core/pwa-installer.js';

console.log('PWA Status:', pwaInstaller.getStatus());
// { canInstall, isInstalled, isOnline, updateAvailable, swRegistered }
```

### Button shows but install doesn't work

**Possible causes:**
- iOS Safari (doesn't support programmatic prompts)
- User previously dismissed prompt (Chrome shows it only once per session)
- HTTPS not enabled (except localhost)

### Button won't hide after install

**Fix:**
```javascript
// Make sure hideWhenInstalled is true (default)
const button = new PWAInstallButton({
  hideWhenInstalled: true, // default
});

// Or manually hide
button.hide();
```

## Next Steps

1. Add the button to your app (main.js or index.html)
2. Customize positioning and styling
3. Test on different browsers/devices
4. Consider showing install instructions for iOS Safari users

---

**Created:** 2025-11-06
**Component:** [src/ui/pwa-install-button.js](../src/ui/pwa-install-button.js)
**Status:** ✅ Ready to use
