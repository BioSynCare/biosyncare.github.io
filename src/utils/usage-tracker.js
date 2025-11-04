/**
 * Usage Analytics Module
 *
 * Tracks user sessions, protocol usage, and generates statistics
 * Stores data locally (localStorage) and optionally syncs to Firebase
 *
 * Usage:
 *   import { UsageTracker } from './src/utils/usage-tracker.js';
 *   const tracker = new UsageTracker();
 *   tracker.startSession({ protocol: 'binaural_alpha', duration: 600 });
 *   tracker.endSession();
 */

export class UsageTracker {
  constructor() {
    this.storageKey = 'biosyncare_usage';
    this.currentSession = null;
  }

  /**
   * Start tracking a new session
   * @param {Object} opts - { protocol: string, duration: number, settings: object }
   */
  startSession(opts = {}) {
    const session = {
      id: this._generateId(),
      startTime: Date.now(),
      endTime: null,
      protocol: opts.protocol || 'unknown',
      plannedDuration: opts.duration || null,
      actualDuration: null,
      settings: opts.settings || {},
      completed: false,
      device: this._getDeviceInfo(),
    };

    this.currentSession = session;
    this._saveSession(session);

    console.log('[UsageTracker] Session started:', session.id);
    return session.id;
  }

  /**
   * End current session
   */
  endSession(completed = true) {
    if (!this.currentSession) {
      console.warn('[UsageTracker] No active session to end');
      return null;
    }

    const now = Date.now();
    this.currentSession.endTime = now;
    this.currentSession.actualDuration = Math.round(
      (now - this.currentSession.startTime) / 1000
    );
    this.currentSession.completed = completed;

    this._saveSession(this.currentSession);

    const sessionId = this.currentSession.id;
    this.currentSession = null;

    console.log('[UsageTracker] Session ended:', sessionId);
    return sessionId;
  }

  /**
   * Log an event during session
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  logEvent(event, data = {}) {
    if (!this.currentSession) {
      console.warn('[UsageTracker] No active session for event');
      return;
    }

    if (!this.currentSession.events) {
      this.currentSession.events = [];
    }

    this.currentSession.events.push({
      timestamp: Date.now(),
      event,
      data,
    });

    this._saveSession(this.currentSession);
  }

  /**
   * Get all sessions
   */
  getAllSessions() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('[UsageTracker] Failed to load sessions:', e);
      return [];
    }
  }

  /**
   * Get usage statistics
   */
  getStats() {
    const sessions = this.getAllSessions();

    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        completedSessions: 0,
        totalDuration: 0,
        averageDuration: 0,
        protocolBreakdown: {},
        lastSession: null,
      };
    }

    const completed = sessions.filter((s) => s.completed);
    const totalDuration = sessions.reduce((sum, s) => sum + (s.actualDuration || 0), 0);

    // Protocol breakdown
    const protocolBreakdown = {};
    sessions.forEach((s) => {
      if (!protocolBreakdown[s.protocol]) {
        protocolBreakdown[s.protocol] = {
          count: 0,
          totalDuration: 0,
        };
      }
      protocolBreakdown[s.protocol].count++;
      protocolBreakdown[s.protocol].totalDuration += s.actualDuration || 0;
    });

    return {
      totalSessions: sessions.length,
      completedSessions: completed.length,
      totalDuration, // seconds
      averageDuration: Math.round(totalDuration / sessions.length),
      protocolBreakdown,
      lastSession: sessions[sessions.length - 1],
      firstSession: sessions[0],
    };
  }

  /**
   * Get sessions by date range
   */
  getSessionsByDateRange(startDate, endDate) {
    const sessions = this.getAllSessions();
    return sessions.filter((s) => {
      return s.startTime >= startDate.getTime() && s.startTime <= endDate.getTime();
    });
  }

  /**
   * Clear all usage data
   */
  clearAll() {
    localStorage.removeItem(this.storageKey);
    this.currentSession = null;
    console.log('[UsageTracker] All data cleared');
  }

  /**
   * Export data as JSON
   */
  exportData() {
    const sessions = this.getAllSessions();
    const stats = this.getStats();

    return {
      exportDate: new Date().toISOString(),
      stats,
      sessions,
    };
  }

  // Private methods

  _saveSession(session) {
    try {
      const sessions = this.getAllSessions();
      const index = sessions.findIndex((s) => s.id === session.id);

      if (index >= 0) {
        sessions[index] = session;
      } else {
        sessions.push(session);
      }

      localStorage.setItem(this.storageKey, JSON.stringify(sessions));
    } catch (e) {
      console.error('[UsageTracker] Failed to save session:', e);
    }
  }

  _generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  _getDeviceInfo() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenResolution: `${screen.width}x${screen.height}`,
    };
  }
}

// Singleton instance
export const usageTracker = new UsageTracker();
