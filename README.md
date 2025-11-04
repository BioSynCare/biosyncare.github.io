# biosyncare.github.io

This repo holds a client-side webpage for neurosensory stimulation.

## System diagnostics widget

A collapsible floating widget (bottom-left) lets users view comprehensive system state and send detailed reports.

### Informações capturadas

#### 🎵🎨 Engines BSCLab
- **Engine de Áudio**: Detecta Tone.js ou Web Audio API nativo
- **Engine Visual**: Detecta Three.js, Pixi.js, p5.js ou Canvas 2D nativo
- **Status e Versões**: Mostra se as engines estão carregadas e suas versões

#### 🔊 Áudio Detalhado
- Web Audio API suporte e estado
- Taxa de amostragem (sample rate)
- Bit depth (32-bit float estimado)
- Canais máximos disponíveis
- Estado do contexto de áudio (running, suspended, closed)
- Se há áudio tocando no momento
- Latência base e output em milissegundos
- Buffer size estimado
- Detecção heurística de fones de ouvido
- Número de dispositivos de entrada/saída de áudio
- Lista de dispositivos (quando permissões são concedidas)

#### 🖥️ Display & Visual
- Resolução da tela completa
- Área disponível (sem barras do sistema)
- Viewport (janela do navegador)
- Aspect ratio calculado
- Pixel ratio (densidade de pixels)
- DPI calculado
- Profundidade de cor (color depth)
- Suporte a HDR
- Orientação da tela
- Detecção heurística de múltiplos monitores
- Taxa de atualização (refresh rate) medida

#### 💻 Hardware & Sistema
- Modelo do dispositivo detectado
- Sistema operacional e versão
- Arquitetura (x64, ARM, ARM64, etc.)
- Plataforma
- Número de núcleos de CPU
- RAM do dispositivo (quando disponível)
- Modelo da GPU (renderer)
- GPU performance score (0-100)
- Versão WebGL
- Suporte a touch
- Status da bateria (nível, carregando)
- Tempo de carga/descarga estimado

#### 🌐 Navegador
- Nome e versão do navegador
- Engine de renderização (Chromium, Gecko, WebKit)
- Vendor
- Idioma principal e idiomas aceitos
- Status online/offline
- Tipo de conexão (4g, wifi, etc.)
- Cookies habilitados
- Local Storage disponível
- Do Not Track status

### Data storage & reporting

- **Local storage**: reports são salvos em `localStorage` sob a chave `biosyncare_reports`
- **Export**: cada relatório enviado é também baixado como arquivo JSON (timestamped)
- **Optional endpoint**: se configurado, o widget tentará POST do relatório via HTTPS

### Configuração de endpoint (opcional)

1) Via meta tag no `<head>` de `index.html`:

```html
<meta name="report-endpoint" content="https://example.org/api/report" />
```

2) Ou via variável global (antes do script do módulo):

```html
<script>window.BioSynCareReportEndpoint = 'https://example.org/api/report';</script>
```

O widget primeiro tenta `navigator.sendBeacon`; se indisponível ou falhar, usa `fetch`. Se nenhum endpoint estiver configurado ou a requisição falhar, o relatório permanece local e o JSON é baixado para compartilhamento manual (ex: via email ou GitHub issues).

### Privacidade

Diagnósticos são computados client-side e só saem do dispositivo se um endpoint for configurado e alcançável. Não inclua informações pessoais no campo de mensagem opcional a menos que seja intencional.
