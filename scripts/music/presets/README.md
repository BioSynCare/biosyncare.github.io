# BioSynCare Preset Template

The preset format below is intended for sharing session definitions between
Python tooling and the web engine. A preset can represent a single voice (one
audio source) or a multi-voice session that coordinates several sounds and
timings.

```json
{
  "id": "session_alpha_001",
  "label": "Alpha Relaxation (15 min)",
  "presetType": "session",          // 'voice' or 'session'
  "totalDurationSec": 900,
  "startUtc": "2025-11-08T20:00:00Z",
  "loop": false,

  "voices": [
    {
      "preset": "binaural",
      "label": "Alpha driver",
      "startOffsetSec": 0,
      "durationSec": 900,
      "gain": 0.25,
      "params": {
        "base": 200,
        "beat": 10,
        "pan": 0,
        "martigli": {
          "enabled": false,
          "ma": 0.0,         // amplitude (depth) in Hz
          "mp0": 12.0,       // starting Martigli period (seconds)
          "mp1": 8.0,        // ending Martigli period
          "md": 120.0        // transition duration between mp0 and mp1
        }
      }
    },
    {
      "preset": "martigli",
      "label": "Harmonic texture",
      "startOffsetSec": 60,
      "durationSec": 780,
      "gain": 0.14,
      "params": {
        "fundamental": 220,
        "harmonics": [1, 1.5, 2, 3, 5, 8, 13],
        "martigli": {
          "enabled": true,
          "ma": 0.35,
          "mp0": 15.0,
          "mp1": 6.0,
          "md": 180.0
        }
      }
    }
  ],

  "symmetryTrack": {
    "enabled": true,
    "pattern": "plain_changes_5",       // change-ringing library id
    "baseFrequency": 110,
    "division": 8,                      // divide the octave into N equal parts
    "scale": {
      "system": "equal_tempered",       // or 'just', 'indian_thaat', etc.
      "degrees": [0, 2, 4, 7, 9]        // semitone offsets or ratios
    },
    "bellMapping": "octave",            // 'octave', 'fifths', 'custom'
    "customFrequencies": null,          // optional explicit array of Hz values
    "gain": 0.18,
    "martigli": {
      "enabled": false,
      "ma": 0.0,
      "mp0": 10.0,
      "mp1": 10.0,
      "md": 0.0
    }
  },

  "metadata": {
    "createdBy": "music-agent",
    "version": 1,
    "notes": "Synchronised launch for breathing cohort"
  }
}
```

### Field reference

- `voices`: ordered list of sound sources; each voice maps to a web preset key
  (`sine`, `binaural`, `isochronic`, `noise-white`, etc.). Optional Martigli
  parameters (`ma`, `mp0`, `mp1`, `md`) enable slow modulation of frequency,
  gain, or pan in line with the existing AudioEngine interface.
- `symmetryTrack`: optional companion track that maps change-ringing patterns
  onto tuned notes. Frequencies can be derived by:
  - evenly dividing the octave: `f = baseFrequency * 2 ** (i / division)`
  - sampling from a named scale (Western modes, Indian thaats, custom ratios)
  - supplying an explicit `customFrequencies` array
- `startUtc`: ISO timestamp (UTC) for synchronised starts across clients.
- `totalDurationSec`: handy for scheduling and analytics.

This template is intentionally JSON-friendly so it can be shared with the
frontend or persisted in Firestore. Feel free to evolve the schema, but keep
`voices` and `symmetryTrack` stable so both Python and web agents can cooperate.
