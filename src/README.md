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
import { sendReport } from './src/utils/firebase.js';

// Enviar relatório para Firestore
const result = await sendReport(diagnostics, 'áudio chiando na frequência 440Hz');

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

{
"timestamp": "2025-11-04T01:03:56.104Z",
"locale": "it-IT",
"url": "http://localhost:3000/",
"visibility": "visible",
"browser": {
"name": "Chrome",
"version": "141.0",
"engine": "Chromium",
"userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
"deviceModel": "Mac (macOS 10.15.7)",
"language": "it-IT",
"languages": "it-IT, pt-BR, en-US, pt, en, it",
"platform": "MacIntel",
"vendor": "Google Inc.",
"cookieEnabled": true,
"doNotTrack": "Not set"
},
"os": {
"name": "macOS 10.15",
"platform": "MacIntel",
"architecture": "Unknown"
},
"system": {
"cores": 10,
"screenResolution": "1728x1117",
"pixelRatio": 2,
"touchSupport": "Não",
"online": "Sim",
"connection": "4g",
"cookiesEnabled": "Sim",
"storageEnabled": "Sim",
"screenWidth": 1728,
"screenHeight": 1117,
"availWidth": 1728,
"availHeight": 1079,
"colorDepth": 30,
"pixelDepth": 30,
"orientation": "landscape-primary",
"viewportWidth": 1728,
"viewportHeight": 958,
"viewportRatio": "1.80",
"possibleMultiMonitor": "Improvável",
"hdrSupport": "Sim",
"dpi": 192,
"deviceMemoryGB": 8
},
"audio": {
"supported": true,
"sampleRate": 48000,
"maxChannels": 2,
"state": "running",
"baseLatency": "5.33",
"outputLatency": "N/A",
"headphonesLikely": "Possível",
"bitDepth": "32-bit float (estimado)",
"isPlaying": "Sim",
"baseLatencyMs": "5.33",
"outputLatencyMs": "0.00",
"bufferSize": 800,
"inputDevices": 1,
"outputDevices": 1,
"deviceList": {
"inputs": [
"Unnamed input"
],
"outputs": [
"Unnamed output"
]
}
},
"battery": {
"supported": true,
"charging": true,
"level": 80,
"chargingTime": "N/A",
"dischargingTime": "N/A"
},
"engines": {
"audio": {
"name": "Web Audio API (nativo)",
"status": "Disponível",
"version": null
},
"visual": {
"name": "Canvas 2D (nativo)",
"status": "Disponível",
"version": null
},
"webAudio": {
"supported": true,
"version": "Standard API"
}
},
"gpuDetails": {
"renderer": "ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)",
"vendor": "Google Inc. (Apple)",
"version": "WebGL 2.0 (OpenGL ES 3.0 Chromium)",
"shadingLanguageVersion": "WebGL GLSL ES 3.00 (OpenGL ES GLSL ES 3.0 Chromium)",
"maxTextureSize": 16384,
"maxRenderbufferSize": 16384,
"maxVertexAttribs": 16
}
}
