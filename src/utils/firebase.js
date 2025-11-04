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
let analytics = null;
let auth = null;

// Cached module references so we do not re-import on every call
let firestoreModule = null;
let authModule = null;
let authProviders = null;

async function initFirebase() {
  if (firebaseApp) return firestore;

  // Dynamic import to avoid loading Firebase if not needed
  const appModule = await import(FIREBASE_APP_URL);
  const analyticsImport = await import(FIREBASE_ANALYTICS_URL);
  firestoreModule = await import(FIREBASE_FIRESTORE_URL);

  firebaseApp = appModule.initializeApp(firebaseConfig);
  firestore = firestoreModule.getFirestore(firebaseApp);

  try {
    analytics = analyticsImport.getAnalytics(firebaseApp);
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

async function ensureAuthModule() {
  if (auth && authModule) {
    return { auth, authModule, providers: authProviders };
  }

  if (!firebaseApp) {
    await initFirebase();
  }

  authModule = await import(FIREBASE_AUTH_URL);
  const {
    getAuth,
    GoogleAuthProvider,
    GithubAuthProvider,
    EmailAuthProvider,
  } = authModule;

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
  const { additionalUserInfo, credential, operationType, user } =
    userCredential;

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

    const docRef = await addDoc(
      collection(db, 'diagnostic_reports'),
      reportData
    );
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
  const { auth: authInstance, authModule, providers } =
    await ensureAuthModule();

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
export async function signInWithGoogle(options = {}) {
  return authenticateWithProvider('google', options);
}

/**
 * GitHub sign-in (popup)
 */
export async function signInWithGitHub(options = {}) {
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
  const { auth: authInstance, authModule, providers } =
    await ensureAuthModule();

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
