/**
 * BioSynCare Lab - Firebase Integration (Optional)
 *
 * Provides optional cloud storage for:
 * - Diagnostic reports
 * - User sessions (future)
 * - Protocol exports (future)
 *
 * IMPORTANT: Credentials are public, but protected by Security Rules
 *
 * Usage:
 *   import { sendReport } from './src/utils/firebase.js';
 *   await sendReport(diagnostics, 'áudio chiando');
 */

// Firebase config - OK to be public (protected by Security Rules)
const firebaseConfig = {
  apiKey: 'AIzaSyAWcLkLlzmwlGJAb-CSkue78rnTUEhfAo8',
  authDomain: 'biosyncarelab.firebaseapp.com',
  projectId: 'biosyncarelab',
  storageBucket: 'biosyncarelab.firebasestorage.app',
  messagingSenderId: '831255166249',
  appId: '1:831255166249:web:708133d374e80af9d48b38',
  measurementId: 'G-K4X7HXKQ2C',
};

const FIREBASE_VERSION = '10.7.0';
const FIREBASE_BASE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
const FIREBASE_APP_URL = `${FIREBASE_BASE_URL}/firebase-app.js`;
const FIREBASE_ANALYTICS_URL = `${FIREBASE_BASE_URL}/firebase-analytics.js`;
const FIREBASE_FIRESTORE_URL = `${FIREBASE_BASE_URL}/firebase-firestore.js`;
const FIREBASE_AUTH_URL = `${FIREBASE_BASE_URL}/firebase-auth.js`;

// Lazy loaded Firebase singletons
let firebaseApp = null;
let firestore = null;
let auth = null;

// Cached module references so we do not re-import on every call
let firestoreModule = null;
let authModule = null;
let authProviders = null;

const DEFAULT_PRIVACY_SETTINGS = Object.freeze({
  collectData: true,
  shareAnonymized: true,
  includeInCommunity: true,
  anonymizedLabel: null,
});

async function initFirebase() {
  if (firebaseApp) return firestore;

  // Dynamic import to avoid loading Firebase if not needed
  const appModule = await import(FIREBASE_APP_URL);
  const analyticsImport = await import(FIREBASE_ANALYTICS_URL);
  firestoreModule = await import(FIREBASE_FIRESTORE_URL);

  firebaseApp = appModule.initializeApp(firebaseConfig);
  firestore = firestoreModule.getFirestore(firebaseApp);

  try {
    analyticsImport.getAnalytics(firebaseApp);
  } catch (error) {
    console.info('[Firebase] Analytics unavailable in this environment:', error);
  }

  console.log('[Firebase] Initialized');
  return firestore;
}

async function ensureFirestoreModule() {
  if (!firestoreModule) {
    firestoreModule = await import(FIREBASE_FIRESTORE_URL);
  }
  return firestoreModule;
}

export async function getFirestoreInstance() {
  const db = await initFirebase();
  return db;
}

export async function getFirestoreHelpers() {
  const module = await ensureFirestoreModule();
  return {
    collection: module.collection,
    doc: module.doc,
    setDoc: module.setDoc,
    getDoc: module.getDoc,
    updateDoc: module.updateDoc,
    addDoc: module.addDoc,
    deleteDoc: module.deleteDoc,
    getDocs: module.getDocs,
    query: module.query,
    where: module.where,
    orderBy: module.orderBy,
    limit: module.limit,
    serverTimestamp: module.serverTimestamp,
  };
}

async function ensureAuthModule() {
  if (auth && authModule) {
    return { auth, authModule, providers: authProviders };
  }

  if (!firebaseApp) {
    await initFirebase();
  }

  authModule = await import(FIREBASE_AUTH_URL);
  const { getAuth, GoogleAuthProvider, GithubAuthProvider, EmailAuthProvider } =
    authModule;

  auth = getAuth(firebaseApp);
  if (typeof auth.useDeviceLanguage === 'function') {
    auth.useDeviceLanguage();
  }

  authProviders = {
    google: new GoogleAuthProvider(),
    github: new GithubAuthProvider(),
    email: EmailAuthProvider,
  };

  return { auth, authModule, providers: authProviders };
}

function serializeUser(user) {
  if (!user) return null;

  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
    isAnonymous: user.isAnonymous,
    emailVerified: user.emailVerified,
    phoneNumber: user.phoneNumber ?? null,
    providerIds: user.providerData?.map((p) => p.providerId) ?? [],
    metadata: user.metadata
      ? {
          creationTime: user.metadata.creationTime,
          lastSignInTime: user.metadata.lastSignInTime,
        }
      : null,
  };
}

function normalizeAuthResult(userCredential, override = {}) {
  if (!userCredential) return null;
  const { additionalUserInfo, credential, operationType, user } = userCredential;

  return {
    user: serializeUser(user),
    credential: credential ?? null,
    providerId:
      additionalUserInfo?.providerId ??
      credential?.providerId ??
      override.providerId ??
      null,
    isNewUser: additionalUserInfo?.isNewUser ?? false,
    operationType: operationType ?? null,
    profile: additionalUserInfo?.profile ?? null,
  };
}

/**
 * Send diagnostic report to Firestore
 * Write-only, anonymous
 */
export async function sendReport(diagnostics, message = '') {
  try {
    const db = await initFirebase();
    const { collection, addDoc, serverTimestamp } = await ensureFirestoreModule();

    const reportData = {
      ...diagnostics,
      message,
      timestamp: serverTimestamp(),
      userId: null, // Anonymous
      version: '1.0.0',
    };

    const docRef = await addDoc(collection(db, 'diagnostic_reports'), reportData);
    console.log('[Firebase] Report sent:', docRef.id);
    return { success: true, id: docRef.id };
  } catch (error) {
    console.error('[Firebase] Failed to send report:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get public protocols (read-only)
 * Future: load curated protocols from Firestore
 */
export async function getProtocols() {
  try {
    const db = await initFirebase();
    const { collection, getDocs } = await ensureFirestoreModule();

    const querySnapshot = await getDocs(collection(db, 'protocols'));
    const protocols = [];
    querySnapshot.forEach((doc) => {
      protocols.push({ id: doc.id, ...doc.data() });
    });

    return protocols;
  } catch (error) {
    console.error('[Firebase] Failed to get protocols:', error);
    return [];
  }
}

/**
 * Expose raw auth instance (lazy-loaded)
 */
export async function getAuthInstance() {
  const { auth: authInstance } = await ensureAuthModule();
  return authInstance;
}

/**
 * Listen to auth changes
 * @returns unsubscribe callback
 */
export async function onAuthChanged(callback) {
  if (typeof callback !== 'function') {
    throw new Error('onAuthChanged callback must be a function');
  }

  const { auth: authInstance, authModule } = await ensureAuthModule();
  const handler = (firebaseUser) => callback(serializeUser(firebaseUser));
  return authModule.onAuthStateChanged(authInstance, handler);
}

/**
 * Current user snapshot (serialized)
 */
export async function getCurrentUser() {
  const { auth: authInstance } = await ensureAuthModule();
  return serializeUser(authInstance.currentUser);
}

async function authenticateWithProvider(providerKey, { link = false } = {}) {
  const { auth: authInstance, authModule, providers } = await ensureAuthModule();

  const provider = providers[providerKey];
  if (!provider) {
    throw new Error(`Auth provider "${providerKey}" is not configured`);
  }

  if (link && !authInstance.currentUser) {
    throw new Error('No active Firebase user to link OAuth provider with.');
  }

  try {
    const userCredential = link
      ? await authModule.linkWithPopup(authInstance.currentUser, provider)
      : await authModule.signInWithPopup(authInstance, provider);

    return normalizeAuthResult(userCredential, { providerId: provider.providerId });
  } catch (error) {
    console.error(`[Firebase] ${providerKey} auth failed:`, error);
    throw error;
  }
}

export function isAnonymousUser(user) {
  if (!user) return false;
  return Boolean(user.isAnonymous);
}

/**
 * Google sign-in (popup)
 */
export function signInWithGoogle(options = {}) {
  return authenticateWithProvider('google', options);
}

/**
 * GitHub sign-in (popup)
 */
export function signInWithGitHub(options = {}) {
  return authenticateWithProvider('github', options);
}

/**
 * Email/password sign-in
 */
export async function signInWithEmail(email, password) {
  const { auth: authInstance, authModule } = await ensureAuthModule();
  const credential = await authModule.signInWithEmailAndPassword(
    authInstance,
    email,
    password
  );
  return normalizeAuthResult(credential, { providerId: 'password' });
}

/**
 * Create account with email/password
 */
export async function registerWithEmail(email, password, displayName) {
  const { auth: authInstance, authModule } = await ensureAuthModule();
  const credential = await authModule.createUserWithEmailAndPassword(
    authInstance,
    email,
    password
  );

  if (displayName) {
    await authModule.updateProfile(credential.user, { displayName });
  }

  return normalizeAuthResult(credential, { providerId: 'password' });
}

/**
 * Link current (possibly anonymous) user with an email credential
 */
export async function linkEmailCredential(email, password) {
  const { auth: authInstance, authModule, providers } = await ensureAuthModule();

  if (!authInstance.currentUser) {
    throw new Error('No active Firebase user to link credentials with.');
  }

  const credential = providers.email.credential(email, password);
  const result = await authModule.linkWithCredential(
    authInstance.currentUser,
    credential
  );

  return normalizeAuthResult(result, { providerId: 'password' });
}

/**
 * Sign out
 */
export async function signOutUser() {
  const { auth: authInstance, authModule } = await ensureAuthModule();
  await authModule.signOut(authInstance);
}

/**
 * Obtain ID token for authenticated calls
 */
export async function getIdToken(forceRefresh = false) {
  const { auth: authInstance, authModule } = await ensureAuthModule();
  if (!authInstance.currentUser) return null;
  return authModule.getIdToken(authInstance.currentUser, forceRefresh);
}

/**
 * Ensure an anonymous session exists (used before prompting user to upgrade)
 */
export async function ensureAnonymousUser() {
  const { auth: authInstance, authModule } = await ensureAuthModule();
  if (authInstance.currentUser) {
    return serializeUser(authInstance.currentUser);
  }

  try {
    const credential = await authModule.signInAnonymously(authInstance);
    return normalizeAuthResult(credential, { providerId: 'anonymous' });
  } catch (error) {
    if (error?.code === 'auth/admin-restricted-operation') {
      console.warn(
        '[Firebase] Anonymous auth is disabled for this project. Proceeding without auto sign-in.'
      );
      return null;
    }
    throw error;
  }
}

function cloneSettings(settings = {}) {
  return {
    collectData:
      settings.collectData === false ? false : DEFAULT_PRIVACY_SETTINGS.collectData,
    shareAnonymized:
      settings.shareAnonymized === false
        ? false
        : DEFAULT_PRIVACY_SETTINGS.shareAnonymized,
    includeInCommunity:
      settings.includeInCommunity === false
        ? false
        : DEFAULT_PRIVACY_SETTINGS.includeInCommunity,
    anonymizedLabel:
      typeof settings.anonymizedLabel === 'string'
        ? settings.anonymizedLabel
        : DEFAULT_PRIVACY_SETTINGS.anonymizedLabel,
  };
}

const PUBLIC_PAYLOAD_FIELDS = ['label', 'presetKey', 'category', 'durationMs', 'count'];

function summarizeMeta(meta = {}) {
  if (!meta || typeof meta !== 'object') return undefined;
  const summary = {};

  [
    'carrier',
    'modulator',
    'base',
    'beat',
    'freq',
    'pulseFreq',
    'pattern',
    'color',
  ].forEach((key) => {
    if (meta[key] !== undefined && meta[key] !== null) {
      summary[key] = meta[key];
    }
  });

  if (Array.isArray(meta.components) && meta.components.length > 0) {
    summary.components = meta.components.slice(0, 8);
  }

  if (Array.isArray(meta.harmonics) && meta.harmonics.length > 0) {
    summary.harmonics = meta.harmonics.slice(0, 12);
  }

  if (Object.keys(summary).length === 0) {
    return undefined;
  }

  return summary;
}

function sanitizePublicPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return {};
  const clean = {};

  PUBLIC_PAYLOAD_FIELDS.forEach((field) => {
    if (payload[field] !== undefined && payload[field] !== null) {
      clean[field] = payload[field];
    }
  });

  const metaSummary = summarizeMeta(payload.meta);
  if (metaSummary) {
    clean.meta = metaSummary;
  }

  return clean;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  return null;
}

export function getDefaultPrivacySettings() {
  return cloneSettings();
}

export async function fetchUserSettings(userId) {
  if (!userId) {
    return cloneSettings();
  }

  const db = await initFirebase();
  const { doc, getDoc } = await getFirestoreHelpers();

  try {
    const ref = doc(db, 'user_settings', userId);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return cloneSettings();
    }

    const data = snapshot.data();
    return cloneSettings(data);
  } catch (error) {
    console.error('[Firebase] Failed to fetch user settings:', error);
    return cloneSettings();
  }
}

export async function saveUserSettings(userId, settings = {}) {
  if (!userId) return { success: false, error: 'missing-user' };

  const db = await initFirebase();
  const { doc, setDoc, serverTimestamp } = await getFirestoreHelpers();

  try {
    const ref = doc(db, 'user_settings', userId);
    const cleanSettings = cloneSettings(settings);

    await setDoc(
      ref,
      {
        ...cleanSettings,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return { success: true };
  } catch (error) {
    console.error('[Firebase] Failed to save user settings:', error);
    return { success: false, error: error.message };
  }
}

export async function writeUsageEvent({
  user,
  sessionId,
  eventType,
  payload = {},
  settings = {},
}) {
  if (!user || !user.uid) {
    console.warn('[Firebase] Cannot write usage event without user context');
    return null;
  }

  const effectiveSettings = cloneSettings(settings);
  if (!effectiveSettings.collectData) {
    return null;
  }

  const db = await initFirebase();
  const { collection, addDoc, serverTimestamp } = await getFirestoreHelpers();

  const createdAt = serverTimestamp();
  const visibility = effectiveSettings.shareAnonymized ? 'anonymized' : 'private';
  const includeInCommunity = effectiveSettings.includeInCommunity !== false;
  const isAnonymous = Boolean(user.isAnonymous);

  const eventDoc = {
    userId: user.uid,
    sessionId: sessionId || null,
    eventType,
    payload,
    visibility,
    includeInCommunity,
    anonymous: isAnonymous,
    createdAt,
  };

  let publicEntry = null;

  try {
    await addDoc(collection(db, 'usage_events'), eventDoc);

    if (effectiveSettings.shareAnonymized) {
      const publicLabel =
        effectiveSettings.anonymizedLabel ||
        (user.displayName ? 'Member' : `Anonymous #${user.uid.slice(-6)}`);

      publicEntry = {
        userLabel: publicLabel,
        eventType,
        payload: sanitizePublicPayload(payload),
        createdAt,
        includeInCommunity,
      };

      try {
        await addDoc(collection(db, 'usage_events_public'), publicEntry);
      } catch (publicError) {
        console.warn('[Firebase] Failed to publish public usage event:', publicError);
      }
    }

    return {
      success: true,
      event: {
        eventType,
        payload,
        timestamp: Date.now(),
        visibility,
        includeInCommunity,
      },
      publicEvent: publicEntry
        ? {
            ...publicEntry,
            timestamp: Date.now(),
          }
        : null,
    };
  } catch (error) {
    console.error('[Firebase] Failed to write usage event:', error);
    return { success: false, error: error.message };
  }
}

export async function fetchUserEvents(userId, { pageSize = 100 } = {}) {
  if (!userId) return [];

  const db = await initFirebase();
  const { collection, query, where, orderBy, limit, getDocs } =
    await getFirestoreHelpers();

  try {
    const eventsQuery = query(
      collection(db, 'usage_events'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );

    const snapshot = await getDocs(eventsQuery);
    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        eventType: data.eventType,
        payload: data.payload || {},
        timestamp: normalizeTimestamp(data.createdAt) || Date.now(),
        visibility: data.visibility || 'private',
        includeInCommunity:
          data.includeInCommunity !== undefined ? Boolean(data.includeInCommunity) : true,
      };
    });
  } catch (error) {
    console.error('[Firebase] Failed to fetch user events:', error);
    return [];
  }
}

export async function fetchPublicEvents({ pageSize = 50 } = {}) {
  const db = await initFirebase();
  const { collection, query, orderBy, limit, getDocs } = await getFirestoreHelpers();

  try {
    const publicQuery = query(
      collection(db, 'usage_events_public'),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );

    const snapshot = await getDocs(publicQuery);
    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        eventType: data.eventType,
        payload: data.payload || {},
        userLabel: data.userLabel || 'Anonymous member',
        timestamp: normalizeTimestamp(data.createdAt) || Date.now(),
        includeInCommunity:
          data.includeInCommunity !== undefined ? Boolean(data.includeInCommunity) : true,
      };
    });
  } catch (error) {
    console.error('[Firebase] Failed to fetch public events:', error);
    return [];
  }
}
