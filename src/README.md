# BioSynCare Lab - Módulos

Código modular 100% client-side para GitHub Pages.

## Uso básico

### 1. Audio Engine

```javascript
import { AudioEngine } from './src/core/audio-engine.js';

const engine = new AudioEngine();

// Inicializar em resposta a interação do usuário
document.querySelector('#start-btn').addEventListener('click', async () => {
  await engine.init();

  // Tocar binaural beat
  engine.playBinaural({
    base: 300, // Hz (frequência portadora)
    beat: 8, // Hz (batida binaural - theta)
    duration: 60, // segundos (0 = infinito)
    gain: 0.4, // volume 0-1
  });
});

// Parar tudo
document.querySelector('#stop-btn').addEventListener('click', () => {
  engine.stopAll();
});

// Ver estatísticas
console.log(engine.getStats());
// {
//   state: "running",
//   sampleRate: 48000,
//   activeSounds: 1,
//   baseLatency: 0.005,
//   ...
// }
```

### 2. Diagnóstico do sistema

```javascript
import { gatherDiagnostics } from './src/ui/diagnostics.js';

// Coletar todas as informações
const diagnostics = await gatherDiagnostics();

console.log(diagnostics);
// {
//   timestamp: "2025-11-04T...",
//   browser: { name: "Chrome", version: "130.0", ... },
//   os: { name: "macOS 14.0", architecture: "ARM64", ... },
//   system: { cores: 10, screenWidth: 3024, ... },
//   audio: { sampleRate: 48000, bitDepth: "32-bit float", ... },
//   engines: { audio: { name: "Tone.js", status: "Carregado ✓" }, ... },
//   ...
// }

// Baixar como JSON
const blob = new Blob([JSON.stringify(diagnostics, null, 2)], {
  type: 'application/json',
});
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `diagnostics-${new Date().toISOString()}.json`;
a.click();
```

### 3. Firebase (opcional)

```javascript
import {
  sendReport,
  signInWithGoogle,
  signInWithGitHub,
  signInWithEmail,
  registerWithEmail,
  onAuthChanged,
  writeUsageEvent,
  fetchUserEvents,
  fetchPublicEvents,
  fetchUserSettings,
  saveUserSettings,
  getDefaultPrivacySettings,
  getCurrentUser,
} from './src/utils/firebase.js';

// Enviar relatório para Firestore
const result = await sendReport(
  diagnostics,
  'áudio chiando na frequência 440Hz'
);

if (result.success) {
  console.log('Relatório enviado:', result.id);
} else {
  console.error('Falha:', result.error);
  // Fallback: salvar localmente
  localStorage.setItem('pending_report', JSON.stringify(diagnostics));
}

// Autenticação (Google, GitHub ou email/senha)
await signInWithGoogle(); // popup
await signInWithGitHub(); // popup
await registerWithEmail('user@example.com', 'senhaSecreta', 'BioSync User');
await signInWithEmail('user@example.com', 'senhaSecreta');

const unsubscribe = await onAuthChanged((user) => {
  console.log('Usuário atual:', user);
});

// Preferências de privacidade e registros de uso
const user = await getCurrentUser();
const settings = await fetchUserSettings(user.uid);
console.log('Preferências atuais:', settings);

await saveUserSettings(user.uid, {
  ...getDefaultPrivacySettings(),
  collectData: true,
  shareAnonymized: true,
});

await writeUsageEvent({
  user,
  sessionId: 'session-123',
  eventType: 'audio_add',
  payload: {
    label: 'Binaural Alpha 10Hz',
    presetKey: 'binaural',
    meta: { base: 200, beat: 10 },
  },
  settings: settings,
});

const myEvents = await fetchUserEvents(user.uid);
const publicEvents = await fetchPublicEvents();
console.log('Eventos pessoais:', myEvents.length);
console.log('Eventos públicos:', publicEvents.length);
```

## Estrutura de arquivos

```
src/
├── core/
│   └── audio-engine.js      # Web Audio API wrapper
├── ui/
│   └── diagnostics.js       # System detection
└── utils/
    └── firebase.js          # Cloud storage (opcional)
```

## Sem build step necessário

Tudo funciona com ES6 modules nativos:

```html
<script type="module">
  import { AudioEngine } from './src/core/audio-engine.js';
  // ...
</script>
```

## Deploy

```bash
git add .
git commit -m "feat: modular architecture"
git push origin main
```

GitHub Pages atualiza automaticamente em ~30 segundos.

## Roadmap

- [ ] `src/protocols/binaural.js` - Presets prontos
- [ ] `src/protocols/breath-sync.js` - Respiração guiada
- [ ] `src/ui/visualizer.js` - Spectrograma/waveform
- [ ] `src/utils/export.js` - Exportar sessões WAV
- [ ] PWA manifest para offline
