/**
 * PWA Install Button Component
 *
 * Provides a custom install button that triggers the PWA install prompt.
 * Automatically shows/hides based on install availability.
 *
 * Usage:
 *   import { PWAInstallButton } from './ui/pwa-install-button.js';
 *   const button = new PWAInstallButton();
 *   document.body.appendChild(button.element);
 */

import { pwaInstaller } from '../core/pwa-installer.js';

export class PWAInstallButton {
  constructor(options = {}) {
    this.options = {
      text: options.text || 'Install App',
      containerClass: options.containerClass || 'pwa-install-container',
      buttonClass: options.buttonClass || 'pwa-install-button',
      hideWhenInstalled: options.hideWhenInstalled !== false, // default true
      position: options.position || 'bottom-right', // 'bottom-right', 'top-right', 'bottom-left', 'top-left', 'inline'
      showDismiss: options.showDismiss !== false, // default true
      ...options,
    };

    this.element = null;
    this.isVisible = false;
    this._dismissed = localStorage.getItem('pwa-install-dismissed') === 'true';

    this._init();
  }

  _init() {
    // Create button element
    this.element = this._createElement();

    // Check initial state
    this._updateVisibility();

    // Listen for install availability
    pwaInstaller.onInstallable = () => {
      this._updateVisibility();
    };

    // Listen for successful install
    pwaInstaller.onInstalled = () => {
      this._onInstalled();
    };

    // Check if already installed
    if (pwaInstaller.isInstalled() && this.options.hideWhenInstalled) {
      this.hide();
    }
  }

  _createElement() {
    const container = document.createElement('div');
    container.className = this.options.containerClass;

    // Apply positioning styles
    if (this.options.position !== 'inline') {
      Object.assign(container.style, this._getPositionStyles());
    }

    // Create install button
    const button = document.createElement('button');
    button.className = this.options.buttonClass;
    button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>${this.options.text}</span>
    `;
    button.onclick = () => this.install();

    // Apply default button styles if no custom class
    if (!this.options.buttonClass || this.options.buttonClass === 'pwa-install-button') {
      this._applyDefaultButtonStyles(button);
    }

    container.appendChild(button);

    // Add dismiss button
    if (this.options.showDismiss && this.options.position !== 'inline') {
      const dismissBtn = document.createElement('button');
      dismissBtn.innerHTML = '×';
      dismissBtn.className = 'pwa-install-dismiss';
      dismissBtn.onclick = () => this.dismiss();
      this._applyDismissStyles(dismissBtn);
      container.appendChild(dismissBtn);
    }

    return container;
  }

  _getPositionStyles() {
    const base = {
      position: 'fixed',
      zIndex: '9999',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    };

    switch (this.options.position) {
      case 'bottom-right':
        return { ...base, bottom: '20px', right: '20px' };
      case 'bottom-left':
        return { ...base, bottom: '20px', left: '20px' };
      case 'top-right':
        return { ...base, top: '20px', right: '20px' };
      case 'top-left':
        return { ...base, top: '20px', left: '20px' };
      default:
        return base;
    }
  }

  _applyDefaultButtonStyles(button) {
    Object.assign(button.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px 24px',
      backgroundColor: '#6366f1',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      transition: 'all 0.2s ease',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    });

    // Hover effect
    button.onmouseenter = () => {
      button.style.backgroundColor = '#4f46e5';
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
    };

    button.onmouseleave = () => {
      button.style.backgroundColor = '#6366f1';
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
    };

    // Active effect
    button.onmousedown = () => {
      button.style.transform = 'translateY(0)';
    };
  }

  _applyDismissStyles(dismissBtn) {
    Object.assign(dismissBtn.style, {
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      border: 'none',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      color: 'white',
      fontSize: '20px',
      fontWeight: 'bold',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background-color 0.2s ease',
    });

    dismissBtn.onmouseenter = () => {
      dismissBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    };

    dismissBtn.onmouseleave = () => {
      dismissBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    };
  }

  _updateVisibility() {
    const canInstall = pwaInstaller.canInstall();
    const isInstalled = pwaInstaller.isInstalled();

    console.log('[PWAInstallButton] Visibility check:', {
      canInstall,
      isInstalled,
      dismissed: this._dismissed,
      hideWhenInstalled: this.options.hideWhenInstalled,
    });

    if (this._dismissed) {
      console.log('[PWAInstallButton] Hiding: dismissed by user');
      this.hide();
      return;
    }

    if (canInstall && !isInstalled) {
      // Can install and not installed yet - show button
      console.log('[PWAInstallButton] Showing: can install');
      this.show();
    } else if (isInstalled) {
      // Already installed - show or hide based on option
      if (this.options.hideWhenInstalled) {
        console.log('[PWAInstallButton] Hiding: installed and hideWhenInstalled=true');
        this.hide();
      } else {
        console.log('[PWAInstallButton] Showing: installed status indicator');
        this.show(); // Show to indicate installed status
      }
    } else if (!canInstall && !isInstalled) {
      // Cannot install and not installed - hide button
      console.log('[PWAInstallButton] Hiding: cannot install and not installed');
      this.hide();
    }
  }

  /**
   * Trigger PWA install prompt
   * @returns {Promise<boolean>} true if user accepted
   */
  async install() {
    const accepted = await pwaInstaller.promptInstall();

    if (accepted) {
      console.log('[PWAInstallButton] User accepted install');
      this.hide();
    } else {
      console.log('[PWAInstallButton] User dismissed install');
    }

    return accepted;
  }

  /**
   * Dismiss the install button (saves to localStorage)
   */
  dismiss() {
    this._dismissed = true;
    localStorage.setItem('pwa-install-dismissed', 'true');
    this.hide();
  }

  /**
   * Reset dismissal (show button again)
   */
  resetDismissal() {
    this._dismissed = false;
    localStorage.removeItem('pwa-install-dismissed');
    this._updateVisibility();
  }

  /**
   * Show the install button
   */
  show() {
    if (this.element) {
      this.element.style.display = 'flex';
      this.isVisible = true;
    }
  }

  /**
   * Hide the install button
   */
  hide() {
    if (this.element) {
      this.element.style.display = 'none';
      this.isVisible = false;
    }
  }

  /**
   * Handle successful installation
   */
  _onInstalled() {
    console.log('[PWAInstallButton] App installed successfully');

    if (this.options.hideWhenInstalled) {
      this.hide();
    }

    // Show success message (optional)
    if (this.options.onInstalled) {
      this.options.onInstalled();
    }
  }

  /**
   * Check if button is currently visible
   * @returns {boolean}
   */
  get visible() {
    return this.isVisible;
  }

  /**
   * Destroy the button and clean up
   */
  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
  }
}

/**
 * Create and auto-append an install button
 * @param {Object} options - Configuration options
 * @returns {PWAInstallButton} Button instance
 */
export function createInstallButton(options = {}) {
  const button = new PWAInstallButton(options);

  // Auto-append to body unless position is 'inline'
  if (options.position !== 'inline') {
    // Check if DOM is already loaded (module scripts load after DOM)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(button.element);
      });
    } else {
      // DOM already loaded, append immediately
      document.body.appendChild(button.element);
    }
  }

  return button;
}
