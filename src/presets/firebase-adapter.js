import { getFirestoreInstance, getFirestoreHelpers, getCurrentUser } from '../utils/firebase.js';

const COLLECTIONS = {
  audio: 'presets_audio',
  sessions: 'presets_sessions',
};

const DEFAULT_PRESET_META = Object.freeze({
  folderId: 'community',
  visibility: 'public',
  tags: [],
});

function normalizeToken(value) {
  if (!value) return null;
  return String(value).trim().toLowerCase();
}

function toDateISOString(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof value.seconds === 'number') {
    const millis = value.seconds * 1000 + (value.nanoseconds || 0) / 1e6;
    return new Date(millis).toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return date.toISOString();
}

function resolveOwnerFields(source = {}) {
  const metadata = source.metadata || {};
  const ownerLabel =
    source.ownerLabel ||
    source.createdByLabel ||
    metadata.ownerLabel ||
    metadata.owner ||
    metadata.ownerName ||
    null;
  const ownerEmail =
    source.ownerEmail || metadata.ownerEmail || metadata.ownerMail || null;
  return {
    ownerLabel: ownerLabel || null,
    ownerEmail: ownerEmail || null,
  };
}

function describeOwnerLabel(user) {
  if (!user) return 'Anonymous';
  if (user.displayName) return user.displayName;
  if (user.email) return user.email;
  if (user.uid) return `User ${user.uid.slice(-6)}`;
  return 'Anonymous';
}

function buildOwnerSearchTokens({ ownerLabel, ownerEmail, createdBy }) {
  const tokens = [];
  const normalizedEmail = normalizeToken(ownerEmail);
  const normalizedLabel = normalizeToken(ownerLabel);
  if (normalizedEmail) {
    tokens.push(normalizedEmail, `email:${normalizedEmail}`);
  }
  if (normalizedLabel) {
    tokens.push(normalizedLabel, `owner:${normalizedLabel}`);
  }
  if (createdBy) {
    tokens.push(`uid:${createdBy}`);
  }
  return tokens;
}

function getCollectionName(type) {
  return COLLECTIONS[type] || COLLECTIONS.sessions;
}

function normalizeFolder(folder) {
  if (!folder) return DEFAULT_PRESET_META.folderId;
  return folder.replace(/^\s+|\s+$/g, '');
}

function normalizeAudioPreset(docId, data = {}) {
  const { ownerLabel, ownerEmail } = resolveOwnerFields(data);
  const createdAtIso = toDateISOString(data.createdAt || data.metadata?.createdAt);
  const updatedAtIso = toDateISOString(data.updatedAt || data.metadata?.updatedAt);
  const basePresetId =
    data.basePresetId ||
    data.metadata?.presetKey ||
    data.presetKey ||
    data.category ||
    null;
  return {
    id: docId || data.id,
    label: data.label || data.name || 'Untitled preset',
    description: data.description || '',
    category: data.category || data.folderId || 'community',
    folderId: normalizeFolder(data.folderId || data.folder || data.category),
    createdAt: createdAtIso || data.createdAt || null,
    createdBy: data.createdBy || null,
    ownerLabel,
    ownerEmail,
    updatedAt: updatedAtIso || data.updatedAt || null,
    tags: data.tags || [],
    version: data.version || 1,
    defaults: data.defaults || {},
    metadata: data.metadata || {},
    visibility: data.visibility || DEFAULT_PRESET_META.visibility,
    basePresetId,
    searchTokens: Array.isArray(data.searchTokens) ? data.searchTokens : [],
  };
}

function normalizeSessionPreset(docId, data = {}) {
  const { ownerLabel, ownerEmail } = resolveOwnerFields(data);
  const createdAtIso = toDateISOString(data.createdAt || data.metadata?.createdAt);
  const updatedAtIso = toDateISOString(data.updatedAt || data.metadata?.updatedAt);
  return {
    id: docId || data.id,
    label: data.label || data.name || 'Untitled session',
    description: data.description || '',
    folderId: normalizeFolder(data.folderId || data.folder || 'community'),
    createdAt: createdAtIso || data.createdAt || null,
    createdBy: data.createdBy || null,
    ownerLabel,
    ownerEmail,
    updatedAt: updatedAtIso || data.updatedAt || null,
    tags: data.tags || [],
    version: data.version || 1,
    voices: Array.isArray(data.voices) ? data.voices : [],
    symmetryTrack: data.symmetryTrack || {
      enabled: false,
    },
    scheduling: data.scheduling || {
      type: 'one-shot',
      startUtc: data.startUtc || null,
    },
    metadata: data.metadata || {},
    visibility: data.visibility || DEFAULT_PRESET_META.visibility,
    searchTokens: Array.isArray(data.searchTokens) ? data.searchTokens : [],
  };
}

export async function fetchFirebasePresets(type = 'sessions') {
  try {
    const db = await getFirestoreInstance();
    if (!db) return [];
    const { collection, getDocs, orderBy, query } = await getFirestoreHelpers();
    const collectionName = getCollectionName(type);
    const colRef = collection(db, collectionName);
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const items = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (type === 'audio') {
        items.push(normalizeAudioPreset(docSnap.id, data));
      } else {
        items.push(normalizeSessionPreset(docSnap.id, data));
      }
    });
    return items;
  } catch (error) {
    console.warn('[Firebase] Unable to fetch presets', type, error);
    return [];
  }
}

function buildPresetPayload(type, preset, folderId) {
  const metadata = { ...(preset.metadata || {}) };
  const ownerMeta = resolveOwnerFields({ ...preset, metadata });
  if (ownerMeta.ownerLabel) {
    metadata.ownerLabel = metadata.ownerLabel || ownerMeta.ownerLabel;
  }
  if (ownerMeta.ownerEmail) {
    metadata.ownerEmail = metadata.ownerEmail || ownerMeta.ownerEmail;
  }

  const baseMeta = {
    label: preset.label,
    name: preset.label,
    description: preset.description || '',
    folderId: normalizeFolder(folderId || preset.folderId),
    createdAt: preset.createdAt || null,
    createdBy: preset.createdBy || null,
    tags: preset.tags || [],
    version: preset.version || 1,
    visibility: preset.visibility || DEFAULT_PRESET_META.visibility,
    ownerLabel: ownerMeta.ownerLabel || null,
    ownerEmail: ownerMeta.ownerEmail || null,
    metadata,
  };
  const searchTokenSet = new Set([
    ...(preset.searchTokens || []),
    ...buildOwnerSearchTokens({
      ownerLabel: baseMeta.ownerLabel,
      ownerEmail: baseMeta.ownerEmail,
      createdBy: baseMeta.createdBy,
    }),
  ]);
  baseMeta.searchTokens = Array.from(searchTokenSet);

  if (type === 'audio') {
    return {
      ...baseMeta,
      defaults: preset.defaults || {},
      category: preset.category || baseMeta.folderId,
      basePresetId: preset.basePresetId || preset.presetKey || null,
    };
  }

  return {
    ...baseMeta,
    voices: Array.isArray(preset.voices) ? preset.voices : [],
    symmetryTrack: preset.symmetryTrack || { enabled: false },
    scheduling: preset.scheduling || {
      type: 'one-shot',
      startUtc: preset.startUtc || null,
    },
  };
}

export async function saveFirebasePreset(type, preset, { folderId, presetId } = {}) {
  const db = await getFirestoreInstance();
  if (!db) return { success: false, error: 'firebase_not_initialized' };
  const {
    collection,
    doc,
    setDoc,
    updateDoc,
    serverTimestamp,
  } = await getFirestoreHelpers();

  const collectionName = getCollectionName(type);
  const colRef = collection(db, collectionName);
  const payload = buildPresetPayload(type, preset, folderId);
  payload.updatedAt = serverTimestamp();

  let docRef;
  if (presetId || preset.id) {
    docRef = doc(colRef, presetId || preset.id);
    await updateDoc(docRef, payload);
  } else {
    payload.createdAt = serverTimestamp();
    docRef = doc(colRef);
    await setDoc(docRef, payload);
  }

  return { success: true, id: docRef.id };
}

export async function deleteFirebasePreset(type, presetId) {
  if (!presetId) return { success: false, error: 'missing_id' };
  const db = await getFirestoreInstance();
  if (!db) return { success: false, error: 'firebase_not_initialized' };
  const { collection, doc, deleteDoc } = await getFirestoreHelpers();
  const colRef = collection(db, getCollectionName(type));
  const docRef = doc(colRef, presetId);
  await deleteDoc(docRef);
  return { success: true };
}

export async function snapshotCurrentSessionPreset(sessionSnapshot, options = {}) {
  const user = (await getCurrentUser()) || null;
  const ownerLabel = describeOwnerLabel(user);
  const ownerEmail = user?.email || null;
  const preset = {
    label: options.label || sessionSnapshot.label || 'Untitled session',
    description: options.description || sessionSnapshot.description || '',
    folderId: options.folderId || sessionSnapshot.folderId || 'community',
    tags: options.tags || sessionSnapshot.tags || [],
    voices: sessionSnapshot.voices || [],
    symmetryTrack: sessionSnapshot.symmetryTrack || { enabled: false },
    scheduling: sessionSnapshot.scheduling || {
      type: 'one-shot',
      startUtc: null,
    },
    createdAt: sessionSnapshot.createdAt || null,
    ownerLabel,
    ownerEmail,
    createdBy: user?.uid || null,
    visibility: options.visibility || 'private',
    metadata: {
      ...sessionSnapshot.metadata,
      ownerLabel,
      ownerEmail,
      source: 'client_snapshot',
    },
  };
  return saveFirebasePreset('sessions', preset, { folderId: preset.folderId });
}

export async function saveAudioPresetSnapshot(trackSnapshot, options = {}) {
  const user = (await getCurrentUser()) || null;
  const ownerLabel = describeOwnerLabel(user);
  const ownerEmail = user?.email || null;
  const preset = {
    label: trackSnapshot.label || 'Custom track preset',
    description: trackSnapshot.description || '',
    defaults: trackSnapshot.defaults || {},
    category: trackSnapshot.category || trackSnapshot.presetKey || 'custom',
    folderId: options.folderId || trackSnapshot.folderId || 'community',
    tags: options.tags || trackSnapshot.tags || [],
    ownerLabel,
    ownerEmail,
    createdBy: user?.uid || null,
    visibility: options.visibility || 'private',
    basePresetId: trackSnapshot.presetKey,
    presetKey: trackSnapshot.presetKey,
    metadata: {
      ...(trackSnapshot.metadata || {}),
      ownerLabel,
      ownerEmail,
      source: 'track_snapshot',
      presetKey: trackSnapshot.presetKey,
    },
  };
  return saveFirebasePreset('audio', preset, { folderId: preset.folderId });
}
