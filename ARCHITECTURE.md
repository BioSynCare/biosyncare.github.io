# BioSynCare Lab - Arquitetura Client-Side

## Decisões arquiteturais

### 1. Backend: **Nenhum** ✓

- Tudo roda no navegador (Web Audio API + Canvas/WebGL)
- Deploy: GitHub Pages
- Custo: $0
- Latência áudio: ~3-10ms (local)

### 2. Banco de dados: **Firebase** (opcional)

- Firestore para relatórios de diagnóstico
- Realtime Database para sessões colaborativas (futuro)
- Storage para exports de sessões
- **Credenciais públicas** com Security Rules

### 3. Estrutura de pastas (modular)

```
biosyncare/
├── index.html                 # Landing page
├── lab.html                   # App principal (futuro)
├── README.md
├── ARCHITECTURE.md
│
├── assets/
│   ├── favicon.ico
│   ├── og-image.png
│   └── logos/
│
├── src/
│   ├── core/
│   │   ├── audio-engine.js    # Web Audio primitives
│   │   ├── visual-engine.js   # Canvas/WebGL manager
│   │   └── scheduler.js       # Timing & sync
│   │
│   ├── protocols/
│   │   ├── binaural.js        # Batidas binaurais
│   │   ├── monaural.js        # Batidas monourais
│   │   ├── isochronic.js      # Tons isócronos
│   │   └── breath-sync.js     # Sincronização respiratória
│   │
│   ├── ui/
│   │   ├── diagnostics.js     # Widget de diagnóstico (extraído)
│   │   ├── controls.js        # Play/pause/volume
│   │   └── visualizer.js      # Spectro/waveform
│   │
│   ├── utils/
│   │   ├── db.js              # Firebase wrapper (opcional)
│   │   ├── storage.js         # localStorage abstraction
│   │   └── export.js          # JSON/CSV/WAV export
│   │
│   └── presets/
│       ├── relax.json         # Configurações prontas
│       ├── focus.json
│       └── sleep.json
│
├── lib/                       # Vendors (se necessário)
│   ├── tone.min.js           # Opcional: Tone.js
│   └── three.min.js          # Opcional: Three.js
│
└── firebase.json              # Config do Firebase (se usado)
```

## Migração incremental

### Fase 1 (Agora): Extrair diagnóstico

- Mover widget de diagnóstico para `src/ui/diagnostics.js`
- Manter compatibilidade com HTML atual

### Fase 2: Modularizar engines

- `src/core/audio-engine.js` com Web Audio encapsulado
- `src/protocols/binaural.js` usando o engine

### Fase 3: UI components

- Extrair controles para módulos reutilizáveis
- Sistema de eventos customizado

### Fase 4 (Opcional): Firebase

- `src/utils/db.js` com Firestore
- Apenas se quiser persistir sessões/relatórios

## Firebase Setup (opcional)

```javascript
// src/utils/db.js
const firebaseConfig = {
  apiKey: 'AIza...', // OK ser público
  authDomain: 'biosyncare.firebaseapp.com',
  projectId: 'biosyncare',
  storageBucket: 'biosyncare.appspot.com',
  messagingSenderId: '123...',
  appId: '1:123...',
};

// Lazy load Firebase apenas quando necessário
export async function initFirebase() {
  if (!window.firebase) {
    await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');
    await import(
      'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js'
    );
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  return firebase.firestore();
}

// Enviar relatório (anônimo, write-only)
export async function sendReport(diagnostics, message) {
  const db = await initFirebase();
  return db.collection('diagnostic_reports').add({
    ...diagnostics,
    message,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    userId: null, // anônimo
  });
}
```

## Por que NÃO usar backend tradicional

| Aspecto        | Client-only    | Com Backend         |
| -------------- | -------------- | ------------------- |
| Latência áudio | 3-10ms         | 50-200ms            |
| Privacidade    | Dados locais   | Upload necessário   |
| Custo          | $0             | $5-50/mês           |
| Offline        | ✓ PWA          | ✗                   |
| Deploy         | `git push`     | CI/CD complexo      |
| Escalabilidade | Infinita (CDN) | Limitada (servidor) |

## Próximos passos sugeridos

1. ✅ Migrar diagnóstico para `src/ui/diagnostics.js`
2. ✅ Criar `src/core/audio-engine.js` básico
3. ⏸️ Firebase apenas se quiser analytics/reports
4. ⏸️ PWA manifest para offline
