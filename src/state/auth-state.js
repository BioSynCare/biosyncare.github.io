/**
 * Authentication State Management
 * Manages user authentication state and related data
 */

export const authState = {
  currentUser: null,
  unsubscribe: null,
};

/**
 * Update the current user in auth state
 */
export function setCurrentUser(user) {
  authState.currentUser = user;
}

/**
 * Set the auth state unsubscribe function
 */
export function setAuthUnsubscribe(unsubscribeFn) {
  authState.unsubscribe = unsubscribeFn;
}

/**
 * Clear auth state
 */
export function clearAuthState() {
  authState.currentUser = null;
  if (typeof authState.unsubscribe === 'function') {
    authState.unsubscribe();
    authState.unsubscribe = null;
  }
}

/**
 * Get current user
 */
export function getCurrentAuthUser() {
  return authState.currentUser;
}
