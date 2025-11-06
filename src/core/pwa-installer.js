/**
 * PWA Installer & Update Manager
 *
 * Handles:
 * - Service worker registration
 * - Install prompt management
 * - Update notifications
 * - Offline detection
 */

export class PWAInstaller {
  constructor() {
    this.deferredPrompt = null;
    this.swRegistration = null;
    this.isOnline = navigator.onLine;
    this.updateAvailable = false;

    // Callbacks
    this.onInstallable = null;
    this.onInstalled = null;
    this.onUpdateAvailable = null;
    this.onOffline = null;
    this.onOnline = null;

    this._init();
  }

  _init() {
    // Listen for install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      console.log('[PWA] Install prompt available');

      if (this.onInstallable) {
        this.onInstallable();
      }
    });

    // Listen for successful installation
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App installed successfully');
      this.deferredPrompt = null;

      if (this.onInstalled) {
        this.onInstalled();
      }
    });

    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('[PWA] Connection restored');

      if (this.onOnline) {
        this.onOnline();
      }
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('[PWA] Connection lost');

      if (this.onOffline) {
        this.onOffline();
      }
    });
  }

  /**
   * Register service worker
   * @returns {Promise<ServiceWorkerRegistration|null>}
   */
  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[PWA] Service workers not supported');
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      this.swRegistration = registration;

      console.log('[PWA] Service worker registered:', registration.scope);

      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker available
            this.updateAvailable = true;
            console.log('[PWA] Update available');

            if (this.onUpdateAvailable) {
              this.onUpdateAvailable(newWorker);
            }
          }
        });
      });

      // Check for updates every hour
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);

      return registration;
    } catch (error) {
      console.error('[PWA] Service worker registration failed:', error);
      return null;
    }
  }

  /**
   * Show install prompt to user
   * @returns {Promise<boolean>} true if user accepted
   */
  async promptInstall() {
    if (!this.deferredPrompt) {
      console.warn('[PWA] Install prompt not available');
      return false;
    }

    try {
      this.deferredPrompt.prompt();

      const { outcome } = await this.deferredPrompt.userChoice;

      console.log('[PWA] Install prompt result:', outcome);

      this.deferredPrompt = null;

      return outcome === 'accepted';
    } catch (error) {
      console.error('[PWA] Install prompt failed:', error);
      return false;
    }
  }

  /**
   * Check if app can be installed
   * @returns {boolean}
   */
  canInstall() {
    return this.deferredPrompt !== null;
  }

  /**
   * Check if app is already installed
   * @returns {boolean}
   */
  isInstalled() {
    // Check if running in standalone mode
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  /**
   * Activate waiting service worker
   */
  activateUpdate() {
    if (!this.swRegistration || !this.swRegistration.waiting) {
      return;
    }

    // Tell the waiting service worker to take over
    this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });

    // Reload page when new service worker activates
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }

  /**
   * Clear all caches
   * @returns {Promise<boolean>}
   */
  async clearCache() {
    if (!this.swRegistration) {
      return false;
    }

    try {
      const messageChannel = new MessageChannel();

      const promise = new Promise((resolve) => {
        messageChannel.port1.onmessage = (event) => {
          resolve(event.data.success);
        };
      });

      this.swRegistration.active.postMessage(
        { type: 'CLEAR_CACHE' },
        [messageChannel.port2]
      );

      return await promise;
    } catch (error) {
      console.error('[PWA] Clear cache failed:', error);
      return false;
    }
  }

  /**
   * Precache specific URLs
   * @param {string[]} urls
   * @returns {Promise<boolean>}
   */
  async cacheUrls(urls) {
    if (!this.swRegistration || !Array.isArray(urls)) {
      return false;
    }

    try {
      const messageChannel = new MessageChannel();

      const promise = new Promise((resolve) => {
        messageChannel.port1.onmessage = (event) => {
          resolve(event.data.success);
        };
      });

      this.swRegistration.active.postMessage(
        { type: 'CACHE_URLS', payload: { urls } },
        [messageChannel.port2]
      );

      return await promise;
    } catch (error) {
      console.error('[PWA] Cache URLs failed:', error);
      return false;
    }
  }

  /**
   * Get installation status
   * @returns {Object}
   */
  getStatus() {
    return {
      canInstall: this.canInstall(),
      isInstalled: this.isInstalled(),
      isOnline: this.isOnline,
      updateAvailable: this.updateAvailable,
      swRegistered: this.swRegistration !== null,
    };
  }
}

// Singleton instance
export const pwaInstaller = new PWAInstaller();
