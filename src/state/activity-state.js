/**
 * Activity State Management
 * Manages activity feed state (user events, public events)
 */

export const activityState = {
  myEvents: [],
  publicEvents: [],
  activeTab: 'mine',
  fetchingUser: false,
  fetchingPublic: false,
  lastFetchedUserId: null,
  lastPublicFetch: 0,
};

export let pendingUserEventsRefresh = false;
export let pendingPublicEventsRefresh = false;

/**
 * Set user events
 */
export function setMyEvents(events) {
  activityState.myEvents = events;
}

/**
 * Set public events
 */
export function setPublicEvents(events) {
  activityState.publicEvents = events;
}

/**
 * Set active tab
 */
export function setActiveTab(tab) {
  activityState.activeTab = tab;
}

/**
 * Set fetching states
 */
export function setFetchingUser(fetching) {
  activityState.fetchingUser = fetching;
}

export function setFetchingPublic(fetching) {
  activityState.fetchingPublic = fetching;
}

/**
 * Set last fetched user ID
 */
export function setLastFetchedUserId(userId) {
  activityState.lastFetchedUserId = userId;
}

/**
 * Set last public fetch timestamp
 */
export function setLastPublicFetch(timestamp) {
  activityState.lastPublicFetch = timestamp;
}

/**
 * Set pending refresh flags
 */
export function setPendingUserEventsRefresh(pending) {
  pendingUserEventsRefresh = pending;
}

export function setPendingPublicEventsRefresh(pending) {
  pendingPublicEventsRefresh = pending;
}
