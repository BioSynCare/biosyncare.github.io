# Firebase Preset Storage Plan

This document sketches how the Web Presets agent will persist shared presets in
Firestore without disrupting existing JSON-based workflows. It focuses on
schema, merge strategy, and API entry points; actual implementation will follow
in subsequent tasks.

## Goals

1. **Shared catalog**: keep the canonical preset catalogue in Firestore so all
   clients see the same definitions (with offline fallbacks to local JSON).
2. **Hierarchical organisation**: allow at least one level of folders/collections
   per preset.
3. **Rich metadata**: name, description, created-at, created-by, voices/tracks
   configuration, scheduling rules (single start, recurring descriptors).
4. **Session snapshots**: let a user press “save current session” to create a new
   preset document.
5. **URL compatibility**: existing `?preset=…` / `?session=…` parameters continue
   to work by referencing Firestore-backed IDs.
6. **Python parity**: make it possible to export Firestore presets to static JSON
   (for offline tooling) with the existing sync step.

## Firestore Layout

```
presets/
  audio/
    <folderId>/                 // e.g., "core", "beta", "community/<userId>"
      <presetId> {
        name: string,
        description: string,
        createdAt: timestamp,
        createdBy: userRef | null,
        visibility: 'public' | 'private' | 'shared',
        tags: string[],
        version: number,
        voices: [
          {
            presetId: string,        // matches audioPresets id
            label: string,
            parameters: map<string, any>,
            martigli: { ma, mp0, mp1, md, enabled },
            startOffsetSec: number,
            durationSec: number | null,
            gain: number | null
          }
        ],
        symmetryTrack: {
          enabled: bool,
          patternId: string | null,
          baseFrequency: number | null,
          division: number | null,
          scale: { system: string, degrees: number[] } | null,
          bellMapping: string | null,
          customFrequencies: number[] | null,
          gain: number | null,
          martigli: { ma, mp0, mp1, md, enabled }
        },
        scheduling: {
          type: 'one-shot' | 'recurring' | 'custom',
          startUtc: timestamp | null,
          recurrence: {
            frequency: 'daily' | 'weekly' | 'monthly' | 'yearly',
            interval: number,
            byDay: string[],           // e.g., ['MO', 'TH']
            byHour: number[],          // optional for multiple slots per day
            timezone: string           // Olson TZ name
          }
        }
      }

  sessions/
    <folderId>/
      <sessionPresetId> { ...same schema as above... }

  userSessions/
    <userId>/
      <sessionPresetId> { ...same schema, visibility defaults to private... }
```

Notes:
- Separate `audio/` and `sessions/` collections so we can query smaller docs
  when only audio presets are needed.
- Folder IDs are arbitrary strings; we can encode nested levels with `/`
  semantics (`community/<userId>`). A helper will transform these into UI trees.
- `version` increments on change to support migrations.

## Security / Access

Firestore rules (pseudo):
```javascript
match /presets/{type}/{folder}/{presetId} {
  allow read: if isPublic() || owns(folder);
  allow write: if owns(folder) || hasRole('admin');
  allow delete: if owns(folder) || hasRole('admin');
}
```
`owns(folder)` checks if folder starts with `community/<userId>` or
`userSessions/<userId>`. Public folders (`core`, `lab`) are read-only except for
admins.

## Client API Outline

New module `src/presets/firebase-adapter.js`:

```js
import { collection, doc, getDocs, addDoc, updateDoc } from 'firebase/firestore';

export async function listPresetFolders(type = 'sessions') { ... }
export async function listPresets(type, folderId) { ... }
export async function fetchPreset(type, folderId, presetId) { ... }
export async function savePreset(type, folderId, presetData) { ... } // creates or updates
export async function deletePreset(type, folderId, presetId) { ... }
export async function snapshotCurrentSession({ name, description, folderId }) { ... }
```

Additional helpers:
- `normalisePreset(presetDoc)` – align Firestore doc with runtime structure.
- `mergeWithLocalCatalog()` – combine Firestore results with static JSON
  (local JSON acts as default “core” folder).

## UI integration roadmap

1. **Preset browser panel**
   - Folder tree (Core, Lab, Community, My Presets).
   - List view with search/filter.
   - “Load” button -> uses existing `scheduleSessionPlayback`.

2. **Save current session**
   - Button near the track list.
   - Opens modal (name, folder, visibility, description, scheduling options).
   - Calls `snapshotCurrentSession`.

3. **Presets finder in header / command palette**
   - Quick fuzzy search across names + tags.

4. **URL linking**
   - Query `?session=folder/presetId` for Firestore backed records.
   - Backwards compatible with legacy `sessionId`.

5. **Offline**
   - On load, fetch Firestore. If offline, fall back to bundled JSON (local).
   - When coming back online, refresh catalog.

## Data migration

1. Seed `presets/audio/core` and `presets/sessions/core` with the current JSON
   (one-time script).
2. Update `scripts/music/presets/load_presets.py` to optionally fetch from
   Firestore (or use exported JSON snapshot).

## Next implementation steps

1. Scaffold `firebase-adapter.js` with read/write functions + whitelist docs in
   `firebase.rules`.
2. Extend `catalog.js` so `loadPresetCatalog()` merges Firestore documents and
   updates the shared maps.
3. Build the preset browser UI and save dialog.

This document will serve as the reference for those follow-up tasks.
