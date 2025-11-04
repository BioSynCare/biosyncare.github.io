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
  // Replace with your Firebase project config
  apiKey: 'AIza...YOUR_KEY_HERE',
  authDomain: 'biosyncare.firebaseapp.com',
  projectId: 'biosyncare',
  storageBucket: 'biosyncare.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abc123',
};

// Lazy load Firebase only when needed
let firebaseApp = null;
let firestore = null;

async function initFirebase() {
  if (firebaseApp) return firestore;

  // Dynamic import to avoid loading Firebase if not needed
  const { initializeApp } = await import(
    'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js'
  );
  const { getFirestore, collection, addDoc, serverTimestamp } = await import(
    'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js'
  );

  firebaseApp = initializeApp(firebaseConfig);
  firestore = getFirestore(firebaseApp);

  console.log('[Firebase] Initialized');
  return firestore;
}

/**
 * Send diagnostic report to Firestore
 * Write-only, anonymous
 */
export async function sendReport(diagnostics, message = '') {
  try {
    const db = await initFirebase();
    const { collection, addDoc, serverTimestamp } = await import(
      'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js'
    );

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
    const { collection, getDocs } = await import(
      'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js'
    );

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
