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
    console.log('[PWAInstallButton] Initializing button...', this.options);

    // Create button element
    this.element = this._createElement();
    console.log('[PWAInstallButton] Element created:', this.element);

    // Check initial state
    console.log('[PWAInstallButton] Checking initial visibility...');
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
      // Cannot install and not installed
      // TEMPORARY: Show button anyway for debugging
      console.log('[PWAInstallButton] TEMP: Showing button for debugging (normally would hide)');
      this.show();

      // Update button to show "Waiting for install prompt..." state
      const btn = this.element?.querySelector('button');
      if (btn && !this.options.hideWhenInstalled) {
        const span = btn.querySelector('span');
        if (span) {
          span.textContent = 'Install App (preparing...)';
        }
        btn.style.backgroundColor = '#9ca3af'; // Gray to indicate waiting
      }
    }
  }

  /**
   * Trigger PWA install prompt
   * @returns {Promise<boolean>} true if user accepted
   */
  async install() {
    // Check if install prompt is available
    if (!pwaInstaller.canInstall()) {
      console.log('[PWAInstallButton] Install prompt not available, showing instructions');
      this._showInstallInstructions();
      return false;
    }

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
   * Show platform-specific install instructions when prompt not available
   */
  _showInstallInstructions() {
    const isFirefox = navigator.userAgent.includes('Firefox');
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isSafari = /Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent);

    let instructions = '';

    if (isIOS && isSafari) {
      instructions = `To install this app on iOS:\n\n1. Tap the Share button (□ with arrow)\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add"`;
    } else if (isFirefox) {
      instructions = `To install this app in Firefox:\n\n1. Click the menu (☰) in the top-right\n2. Select "Install [app name]" or "Add to Home Screen"\n\nAlternatively, use Chrome or Edge for easier installation.`;
    } else {
      instructions = `To install this app:\n\n1. Look for the install icon (⊕) in the address bar\n2. Click it and confirm installation\n\nOr try:\n- Browser menu → "Install app"\n- Use Chrome or Edge for best experience`;
    }

    // Show instructions in a styled modal
    this._showInstructionsModal(instructions);
  }

  /**
   * Show instructions modal
   */
  _showInstructionsModal(instructions) {
    // Create overlay
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      zIndex: '10000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    });

    // Create modal
    const modal = document.createElement('div');
    Object.assign(modal.style, {
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '24px',
      maxWidth: '400px',
      width: '100%',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    });

    modal.innerHTML = `
      <h3 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #1f2937;">
        📱 Install Instructions
      </h3>
      <p style="margin: 0 0 20px 0; white-space: pre-line; color: #4b5563; line-height: 1.6; font-size: 14px;">
        ${instructions}
      </p>
      <button id="close-instructions" style="
        width: 100%;
        padding: 12px;
        background-color: #6366f1;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.2s ease;
      ">Got it</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close button handler
    const closeBtn = modal.querySelector('#close-instructions');
    closeBtn.onmouseenter = () => {
      closeBtn.style.backgroundColor = '#4f46e5';
    };
    closeBtn.onmouseleave = () => {
      closeBtn.style.backgroundColor = '#6366f1';
    };
    closeBtn.onclick = () => {
      overlay.remove();
    };

    // Close on overlay click
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    };
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
  console.log('[createInstallButton] Creating button with options:', options);
  const button = new PWAInstallButton(options);

  // Auto-append to body unless position is 'inline'
  if (options.position !== 'inline') {
    console.log('[createInstallButton] Position is not inline, will append to body');
    console.log('[createInstallButton] document.readyState:', document.readyState);

    // Check if DOM is already loaded (module scripts load after DOM)
    if (document.readyState === 'loading') {
      console.log('[createInstallButton] DOM still loading, waiting for DOMContentLoaded');
      document.addEventListener('DOMContentLoaded', () => {
        console.log('[createInstallButton] DOMContentLoaded fired, appending button');
        document.body.appendChild(button.element);
        console.log('[createInstallButton] Button appended to body');
      });
    } else {
      // DOM already loaded, append immediately
      console.log('[createInstallButton] DOM already loaded, appending immediately');
      document.body.appendChild(button.element);
      console.log('[createInstallButton] Button appended to body, children count:', document.body.children.length);
    }
  } else {
    console.log('[createInstallButton] Position is inline, not auto-appending');
  }

  return button;
}
