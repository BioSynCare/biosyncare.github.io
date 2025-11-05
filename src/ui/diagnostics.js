import { getAllAudioTracks, getAllVisualTracks } from '../state/track-state.js';

/**
 * BioSynCare Lab - System Diagnostics Widget
 *
 * Floating widget that collects comprehensive system information:
 * - BSCLab engines (Tone.js, Three.js, etc.)
 * - Audio capabilities (sample rate, latency, devices)
 * - Display info (resolution, refresh rate, HDR, multi-monitor)
 * - Hardware (CPU, GPU, RAM, battery)
 * - Browser details
 *
 * Usage:
 *   import { initDiagnostics } from './src/ui/diagnostics.js';
 *   initDiagnostics();
 */

// ============================================================================
// Detection Functions
// ============================================================================

let selectedEnginesSnapshot = null;

export function setSelectedEngines(snapshot) {
  selectedEnginesSnapshot = snapshot;
}

export function isMobile() {
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = [
    'android',
    'iphone',
    'ipad',
    'ipod',
    'blackberry',
    'windows phone',
    'mobile',
  ];
  return (
    mobileKeywords.some((keyword) => userAgent.includes(keyword)) ||
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0
  );
}

export function hasGoodGPU() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase();

      const lowEndGPUs = ['intel', 'mali', 'adreno 3', 'adreno 4', 'powervr', 'vivante'];
      const isLowEnd = lowEndGPUs.some((gpu) => renderer.includes(gpu));
      if (isLowEnd) return false;
    }

    const vertices = new Float32Array([-1, -1, 1, -1, 0, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const startTime = performance.now();
    for (let i = 0; i < 1000; i++) {
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.finish();
    const renderTime = performance.now() - startTime;

    return renderTime < 16;
  } catch {
    return false;
  }
}

export function getGPUScore() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { score: 0, details: 'WebGL não suportado' };

    const tests = [];

    // Test 1: Basic rendering
    const vertices = new Float32Array([-1, -1, 1, -1, 0, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const startTime = performance.now();
    for (let i = 0; i < 5000; i++) {
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.finish();
    const renderTime = performance.now() - startTime;
    tests.push({ name: 'render', time: renderTime, weight: 0.4 });

    // Test 2: Texture operations
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const textureStart = performance.now();
    for (let i = 0; i < 100; i++) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        256,
        256,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
    }
    const textureTime = performance.now() - textureStart;
    tests.push({ name: 'texture', time: textureTime, weight: 0.3 });

    // Test 3: Shader compilation
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    const shaderStart = performance.now();
    gl.shaderSource(
      vertexShader,
      'attribute vec4 position; void main() { gl_Position = position; }'
    );
    gl.shaderSource(
      fragmentShader,
      'precision mediump float; void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }'
    );
    gl.compileShader(vertexShader);
    gl.compileShader(fragmentShader);
    const shaderTime = performance.now() - shaderStart;
    tests.push({ name: 'shader', time: shaderTime, weight: 0.3 });

    let totalScore = 0;
    let totalWeight = 0;

    tests.forEach((test) => {
      const normalizedScore = Math.max(0, 100 - test.time / 2);
      totalScore += normalizedScore * test.weight;
      totalWeight += test.weight;
    });

    const finalScore = Math.round(totalScore / totalWeight);

    return {
      score: Math.min(100, Math.max(0, finalScore)),
      details: `Render: ${renderTime.toFixed(1)}ms, Texture: ${textureTime.toFixed(1)}ms`,
    };
  } catch {
    return { score: 0, details: 'Erro na detecção' };
  }
}

export function getRAMInfo() {
  try {
    if ('memory' in performance) {
      const memory = performance.memory;
      const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
      const totalMB = Math.round(memory.totalJSHeapSize / 1024 / 1024);
      const limitMB = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);

      const availablePercent = Math.round(((limitMB - usedMB) / limitMB) * 100);

      return {
        used: usedMB,
        total: totalMB,
        limit: limitMB,
        available: limitMB - usedMB,
        availablePercent,
        details: `${usedMB}/${limitMB} MB`,
      };
    } else {
      const isMobileDevice = isMobile();
      const estimatedRAM = isMobileDevice
        ? { limit: 2048, used: 512, available: 1536 }
        : { limit: 8192, used: 1024, available: 7168 };

      return {
        ...estimatedRAM,
        availablePercent: Math.round((estimatedRAM.available / estimatedRAM.limit) * 100),
        details: `~${estimatedRAM.available} MB (estimado)`,
      };
    }
  } catch {
    return { availablePercent: 50, details: 'Não disponível' };
  }
}

export function getRefreshRate() {
  return new Promise((resolve) => {
    const startTime = performance.now();
    let frameCount = 0;

    function countFrames() {
      frameCount++;
      const elapsed = performance.now() - startTime;

      if (elapsed >= 1000) {
        const fps = Math.round((frameCount / elapsed) * 1000);
        resolve({ fps, refreshRate: fps, details: `${fps} Hz` });
      } else {
        requestAnimationFrame(countFrames);
      }
    }

    requestAnimationFrame(countFrames);

    setTimeout(() => {
      if (frameCount === 0) {
        resolve({ fps: 60, refreshRate: 60, details: '60 Hz (padrão)' });
      }
    }, 1500);
  });
}

export function getBrowserInfo() {
  const ua = navigator.userAgent;
  let browserName = 'Unknown';
  let browserVersion = 'Unknown';
  let engine = 'Unknown';

  if (ua.includes('Firefox/')) {
    browserName = 'Firefox';
    browserVersion = ua.match(/Firefox\/(\d+\.\d+)/)?.[1] || 'Unknown';
    engine = 'Gecko';
  } else if (ua.includes('Edg/')) {
    browserName = 'Edge';
    browserVersion = ua.match(/Edg\/(\d+\.\d+)/)?.[1] || 'Unknown';
    engine = 'Chromium';
  } else if (ua.includes('Chrome/')) {
    browserName = 'Chrome';
    browserVersion = ua.match(/Chrome\/(\d+\.\d+)/)?.[1] || 'Unknown';
    engine = 'Chromium';
  } else if (ua.includes('Safari/')) {
    browserName = 'Safari';
    browserVersion = ua.match(/Version\/(\d+\.\d+)/)?.[1] || 'Unknown';
    engine = 'WebKit';
  }

  // Device model detection
  let deviceModel = 'Unknown';
  if (ua.includes('iPhone')) {
    deviceModel = ua.match(/iPhone[^;)]+/)?.[0] || 'iPhone';
  } else if (ua.includes('iPad')) {
    deviceModel = ua.match(/iPad[^;)]+/)?.[0] || 'iPad';
  } else if (ua.includes('Macintosh')) {
    deviceModel = 'Mac';
    const macMatch = ua.match(/Mac OS X ([0-9_]+)/);
    if (macMatch) {
      deviceModel += ` (macOS ${macMatch[1].replace(/_/g, '.')})`;
    }
  } else if (ua.includes('Windows NT')) {
    deviceModel = 'Windows PC';
    const winMatch = ua.match(/Windows NT ([0-9.]+)/);
    if (winMatch) {
      const winVersion =
        {
          '10.0': '10/11',
          6.3: '8.1',
          6.2: '8',
          6.1: '7',
        }[winMatch[1]] || winMatch[1];
      deviceModel += ` (Windows ${winVersion})`;
    }
  } else if (ua.includes('Android')) {
    const androidMatch = ua.match(/Android ([0-9.]+)/);
    const modelMatch = ua.match(/;\s*([^;)]+)\s+Build/);
    deviceModel = modelMatch?.[1] || 'Android Device';
    if (androidMatch) {
      deviceModel += ` (Android ${androidMatch[1]})`;
    }
  } else if (ua.includes('Linux')) {
    deviceModel = 'Linux PC';
  }

  return {
    name: browserName,
    version: browserVersion,
    engine,
    userAgent: ua,
    deviceModel,
    language: navigator.language,
    languages: navigator.languages?.join(', ') || navigator.language,
    platform: navigator.platform,
    vendor: navigator.vendor || 'Unknown',
    cookieEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack || 'Not set',
  };
}

export function getOSInfo() {
  const ua = navigator.userAgent;
  const platform = navigator.platform;
  let osName = 'Unknown';

  if (ua.includes('Windows NT 10.0')) osName = 'Windows 10/11';
  else if (ua.includes('Windows NT')) osName = 'Windows';
  else if (ua.includes('Mac OS X')) {
    const version = ua.match(/Mac OS X (\d+[._]\d+)/)?.[1]?.replace('_', '.');
    osName = version ? `macOS ${version}` : 'macOS';
  } else if (ua.includes('Android')) {
    const version = ua.match(/Android (\d+\.\d+)/)?.[1];
    osName = version ? `Android ${version}` : 'Android';
  } else if (ua.includes('iPhone') || ua.includes('iPad')) {
    const version = ua.match(/OS (\d+[._]\d+)/)?.[1]?.replace('_', '.');
    osName = version ? `iOS ${version}` : 'iOS';
  } else if (ua.includes('Linux')) osName = 'Linux';

  // Architecture
  let arch = 'Unknown';
  if (
    platform.includes('Win64') ||
    platform.includes('x86_64') ||
    platform.includes('x64')
  ) {
    arch = 'x64';
  } else if (platform.includes('Win32') || platform.includes('x86')) {
    arch = 'x86';
  } else if (platform.includes('ARM') || ua.includes('ARM')) {
    arch = 'ARM';
  } else if (ua.includes('aarch64') || ua.includes('ARM64')) {
    arch = 'ARM64';
  }

  return { name: osName, platform, architecture: arch };
}

export async function getAudioInfo() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return { supported: false };
    }

    const ctx = new AudioContext();
    const info = {
      supported: true,
      sampleRate: ctx.sampleRate,
      maxChannels: ctx.destination.maxChannelCount,
      state: ctx.state,
      baseLatency: ctx.baseLatency ? (ctx.baseLatency * 1000).toFixed(2) : 'N/A',
      outputLatency: ctx.outputLatency ? (ctx.outputLatency * 1000).toFixed(2) : 'N/A',
    };

    info.headphonesLikely =
      ctx.destination.maxChannelCount >= 2 ? 'Possível' : 'Improvável';
    info.bitDepth = '32-bit float (estimado)';
    info.isPlaying = ctx.state === 'running' ? 'Sim' : 'Não';

    if (ctx.baseLatency !== undefined) {
      info.baseLatencyMs = (ctx.baseLatency * 1000).toFixed(2);
    }
    if (ctx.outputLatency !== undefined) {
      info.outputLatencyMs = (ctx.outputLatency * 1000).toFixed(2);
    }

    info.bufferSize = ctx.sampleRate ? Math.floor(ctx.sampleRate / 60) : 'N/A';

    // Enumerate devices
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((d) => d.kind === 'audioinput');
        const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
        info.inputDevices = audioInputs.length;
        info.outputDevices = audioOutputs.length;
        info.deviceList = {
          inputs: audioInputs.map((d) => d.label || 'Unnamed input'),
          outputs: audioOutputs.map((d) => d.label || 'Unnamed output'),
        };
      }
    } catch (error) {
      info.deviceEnumError = error.message;
    }

    ctx.close();
    return info;
  } catch (error) {
    return { supported: false, error: error.message };
  }
}

export function getSystemInfo() {
  const info = {
    cores: navigator.hardwareConcurrency || 'Unknown',
    screenResolution: `${screen.width}x${screen.height}`,
    pixelRatio: window.devicePixelRatio || 1,
    touchSupport:
      'ontouchstart' in window || navigator.maxTouchPoints > 0 ? 'Sim' : 'Não',
    online: navigator.onLine ? 'Sim' : 'Não',
    connection: navigator.connection?.effectiveType || 'Unknown',
    cookiesEnabled: navigator.cookieEnabled ? 'Sim' : 'Não',
    storageEnabled: typeof Storage !== 'undefined' ? 'Sim' : 'Não',
  };

  // Multi-monitor and display
  if (window.screen) {
    info.screenWidth = screen.width;
    info.screenHeight = screen.height;
    info.availWidth = screen.availWidth;
    info.availHeight = screen.availHeight;
    info.colorDepth = screen.colorDepth || 'Unknown';
    info.pixelDepth = screen.pixelDepth || 'Unknown';
    info.orientation = screen.orientation?.type || 'Unknown';
  }

  info.viewportWidth = window.innerWidth;
  info.viewportHeight = window.innerHeight;
  info.viewportRatio = (window.innerWidth / window.innerHeight).toFixed(2);
  info.possibleMultiMonitor =
    screen.availWidth < screen.width ? 'Possível' : 'Improvável';
  info.hdrSupport = window.matchMedia('(dynamic-range: high)').matches ? 'Sim' : 'Não';

  const dpi = window.devicePixelRatio * 96;
  info.dpi = Math.round(dpi);

  if (navigator.deviceMemory) {
    info.deviceMemoryGB = navigator.deviceMemory;
  }

  return info;
}

export function detectEngines() {
  const engines = {
    audio: { name: 'Nenhum', status: 'Não carregado', version: null },
    visual: { name: 'Nenhum', status: 'Não carregado', version: null },
    webAudio: { supported: false, version: null },
    haptics: { name: 'Desconhecido', status: 'Indisponível' },
  };

  // Check for Tone.js
  /* global Tone */
  if (typeof Tone !== 'undefined') {
    engines.audio.name = 'Tone.js';
    engines.audio.status = 'Carregado ✓';
    engines.audio.version = Tone.version || 'Unknown';
  } else {
    engines.audio.name = 'Web Audio API (nativo)';
    engines.audio.status = 'Disponível';
  }

  // Check for Three.js
  /* global THREE, PIXI, p5 */
  if (typeof THREE !== 'undefined') {
    engines.visual.name = 'Three.js';
    engines.visual.status = 'Carregado ✓';
    engines.visual.version = THREE.REVISION || 'Unknown';
  }
  // Check for Pixi.js
  else if (typeof PIXI !== 'undefined') {
    engines.visual.name = 'Pixi.js';
    engines.visual.status = 'Carregado ✓';
    engines.visual.version = PIXI.VERSION || 'Unknown';
  }
  // Check for p5.js
  else if (typeof p5 !== 'undefined') {
    engines.visual.name = 'p5.js';
    engines.visual.status = 'Carregado ✓';
    engines.visual.version = p5.VERSION || 'Unknown';
  } else {
    engines.visual.name = 'Canvas 2D (nativo)';
    engines.visual.status = 'Disponível';
  }

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (AudioContext) {
    engines.webAudio.supported = true;
    engines.webAudio.version = 'Standard API';
  }

  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    engines.haptics.name = 'Vibration API';
    engines.haptics.status = 'Disponível';
  } else {
    engines.haptics.name = 'Vibration API';
    engines.haptics.status = 'Não suportado';
  }

  return engines;
}

export async function getBatteryInfo() {
  try {
    if ('getBattery' in navigator) {
      const battery = await navigator.getBattery();
      return {
        supported: true,
        charging: battery.charging,
        level: Math.round(battery.level * 100),
        chargingTime: battery.chargingTime === Infinity ? 'N/A' : battery.chargingTime,
        dischargingTime:
          battery.dischargingTime === Infinity ? 'N/A' : battery.dischargingTime,
      };
    }
  } catch {
    // Battery API not supported
  }
  return { supported: false };
}

/**
 * Get current performance metrics
 */
export function getPerformanceMetrics() {
  const metrics = {
    memory: null,
    timing: null,
    fps: null,
  };

  // Memory info (Chrome/Edge only)
  if (performance.memory) {
    metrics.memory = {
      usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
      totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
      jsHeapSizeLimit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
      usagePercent: Math.round(
        (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100
      ),
    };
  }

  // Navigation timing
  if (performance.timing) {
    const timing = performance.timing;
    metrics.timing = {
      pageLoadTime: timing.loadEventEnd - timing.navigationStart,
      domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
      domInteractive: timing.domInteractive - timing.navigationStart,
      connectTime: timing.connectEnd - timing.connectStart,
      responseTime: timing.responseEnd - timing.requestStart,
    };
  }

  return metrics;
}

/**
 * Get active track information
 */
export function getActiveTracksInfo() {
  const audioEntries = getAllAudioTracks();
  const visualEntries = getAllVisualTracks();

  const serializeTrack = ([id, track = {}]) => ({
    id,
    label: track.label || track.presetKey || 'Unknown',
    detail: track.detail || '',
    startedAt: track.startedAt || null,
    finalized: Boolean(track.finalized),
    meta: track.meta || {},
  });

  return {
    audioTracksCount: audioEntries.length,
    visualTracksCount: visualEntries.length,
    totalTracks: audioEntries.length + visualEntries.length,
    audioTracks: audioEntries.map(serializeTrack),
    visualTracks: visualEntries.map(serializeTrack),
  };
}

/**
 * Assess overall system health and resources
 * Returns health status with color coding and descriptions
 */
export async function assessSystemHealth() {
  const browser = getBrowserInfo();
  const os = getOSInfo();
  const sys = getSystemInfo();
  const audio = await getAudioInfo();
  const battery = await getBatteryInfo();
  const perfMetrics = getPerformanceMetrics();
  const caps = window.deviceCapabilities || {};

  // ===== HEALTH ASSESSMENT =====
  let healthScore = 100;
  const healthIssues = [];

  // Audio health (30 points)
  if (!audio.supported) {
    healthScore -= 30;
    healthIssues.push('Audio API not supported');
  } else {
    if (audio.state !== 'running') {
      healthScore -= 10;
      healthIssues.push('Audio context not running');
    }
    if (audio.baseLatencyMs > 20) {
      healthScore -= 10;
      healthIssues.push('High audio latency');
    }
    if (audio.sampleRate < 44100) {
      healthScore -= 10;
      healthIssues.push('Low sample rate');
    }
  }

  // Memory health (20 points)
  if (perfMetrics.memory) {
    if (perfMetrics.memory.usagePercent > 80) {
      healthScore -= 20;
      healthIssues.push('Critical memory usage');
    } else if (perfMetrics.memory.usagePercent > 60) {
      healthScore -= 10;
      healthIssues.push('High memory usage');
    }
  }

  // GPU health (20 points)
  const gpuScore = caps.performance?.gpu?.score;
  if (typeof gpuScore === 'number') {
    if (gpuScore < 40) {
      healthScore -= 20;
      healthIssues.push('Weak GPU performance');
    } else if (gpuScore < 70) {
      healthScore -= 10;
      healthIssues.push('Moderate GPU performance');
    }
  }

  // Display health (15 points)
  const refreshRate = caps.performance?.refresh?.fps;
  if (refreshRate) {
    if (refreshRate < 30) {
      healthScore -= 15;
      healthIssues.push('Very low refresh rate');
    } else if (refreshRate < 60) {
      healthScore -= 8;
      healthIssues.push('Low refresh rate');
    }
  }

  // Battery health (15 points) - only if on battery
  if (battery.supported && !battery.charging) {
    if (battery.level < 20) {
      healthScore -= 15;
      healthIssues.push('Critical battery level');
    } else if (battery.level < 50) {
      healthScore -= 8;
      healthIssues.push('Low battery level');
    }
  }

  // Determine overall health status
  let healthStatus, healthColor, healthClass;
  if (healthScore >= 90) {
    healthStatus = 'Excellent';
    healthColor = '#16a34a'; // green-600
    healthClass = 'bg-green-600';
  } else if (healthScore >= 75) {
    healthStatus = 'Good';
    healthColor = '#22c55e'; // green-500
    healthClass = 'bg-green-500';
  } else if (healthScore >= 60) {
    healthStatus = 'Caution';
    healthColor = '#eab308'; // yellow-500
    healthClass = 'bg-yellow-500';
  } else if (healthScore >= 40) {
    healthStatus = 'Poor';
    healthColor = '#f97316'; // orange-500
    healthClass = 'bg-orange-500';
  } else {
    healthStatus = 'Critical';
    healthColor = '#ef4444'; // red-500
    healthClass = 'bg-red-500';
  }

  // ===== HARDWARE RESOURCES =====
  let hardwareLevel = 'Unknown';
  let hardwareScore = 0;

  if (sys.cores) hardwareScore += Math.min(sys.cores * 10, 40); // max 40
  if (sys.deviceMemoryGB) hardwareScore += Math.min(sys.deviceMemoryGB * 5, 30); // max 30
  if (typeof gpuScore === 'number') hardwareScore += Math.min(gpuScore * 0.3, 30); // max 30

  if (hardwareScore >= 80) hardwareLevel = 'Powerful';
  else if (hardwareScore >= 60) hardwareLevel = 'High';
  else if (hardwareScore >= 40) hardwareLevel = 'Moderate';
  else if (hardwareScore >= 20) hardwareLevel = 'Economic';
  else hardwareLevel = 'Limited';

  // ===== SOFTWARE RESOURCES =====
  let softwareLevel = 'Unknown';
  const browserVersionNum = parseInt(browser.version);

  // Check if browser is recent (very rough heuristic)
  const isModernBrowser =
    (browser.name === 'Chrome' && browserVersionNum >= 120) ||
    (browser.name === 'Firefox' && browserVersionNum >= 120) ||
    (browser.name === 'Safari' && browserVersionNum >= 17) ||
    (browser.name === 'Edge' && browserVersionNum >= 120);

  if (audio.supported && isModernBrowser) {
    softwareLevel = 'Bleeding Edge';
  } else if (audio.supported && browserVersionNum >= 100) {
    softwareLevel = 'Updated';
  } else if (audio.supported) {
    softwareLevel = 'Stable';
  } else {
    softwareLevel = 'Outdated';
  }

  // ===== MEMORY RESOURCES =====
  let memoryLevel = 'Unknown';
  if (perfMetrics.memory) {
    if (perfMetrics.memory.usagePercent < 40) {
      memoryLevel = 'Abundant';
    } else if (perfMetrics.memory.usagePercent < 60) {
      memoryLevel = 'Sufficient';
    } else if (perfMetrics.memory.usagePercent < 80) {
      memoryLevel = 'Limited';
    } else {
      memoryLevel = 'Scarce';
    }
  } else if (sys.deviceMemoryGB) {
    if (sys.deviceMemoryGB >= 16) memoryLevel = 'High';
    else if (sys.deviceMemoryGB >= 8) memoryLevel = 'Sufficient';
    else if (sys.deviceMemoryGB >= 4) memoryLevel = 'Moderate';
    else memoryLevel = 'Low';
  }

  // ===== NETWORK RESOURCES =====
  let networkLevel = 'Unknown';
  const connection = sys.connection;

  if (sys.online === 'Yes' || sys.online === true) {
    if (connection === '4g' || connection === 'wifi' || connection === 'ethernet') {
      networkLevel = 'Stable';
    } else if (connection === '3g' || connection === 'slow-2g' || connection === '2g') {
      networkLevel = 'Limited';
    } else {
      networkLevel = 'Connected';
    }
  } else {
    networkLevel = 'Offline';
  }

  return {
    health: {
      status: healthStatus,
      score: healthScore,
      color: healthColor,
      class: healthClass,
      issues: healthIssues,
    },
    hardware: {
      level: hardwareLevel,
      score: hardwareScore,
      cores: sys.cores,
      memory: sys.deviceMemoryGB,
      gpu: gpuScore,
    },
    software: {
      level: softwareLevel,
      browser: browser.name,
      version: browser.version,
      os: os.name,
    },
    memory: {
      level: memoryLevel,
      usage: perfMetrics.memory?.usagePercent,
      used: perfMetrics.memory?.usedJSHeapSize,
      limit: perfMetrics.memory?.jsHeapSizeLimit,
    },
    network: {
      level: networkLevel,
      online: sys.online,
      connection: connection,
    },
  };
}

// ============================================================================
// Main API
// ============================================================================

export async function gatherDiagnostics() {
  const browser = getBrowserInfo();
  const os = getOSInfo();
  const system = getSystemInfo();
  const audio = await getAudioInfo();
  const battery = await getBatteryInfo();
  const engines = detectEngines();
  const time = new Date();

  // GPU details
  const gpuDetails = {};
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        gpuDetails.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        gpuDetails.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
      }
      gpuDetails.version = gl.getParameter(gl.VERSION);
      gpuDetails.shadingLanguageVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
      gpuDetails.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      gpuDetails.maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
      gpuDetails.maxVertexAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    }
  } catch (error) {
    gpuDetails.error = error.message;
  }

  return {
    timestamp: time.toISOString(),
    locale: navigator.language,
    url: location.href,
    visibility: document.visibilityState,
    browser,
    os,
    system,
    audio,
    battery,
    engines,
    selectedEngines: selectedEnginesSnapshot,
    gpuDetails,
  };
}

/**
 * Initialize diagnostics widget
 * Call this after DOM is loaded
 */
export function initDiagnostics() {
  console.log('[BioSynCare] Diagnostics module loaded');
  // Widget UI is still in index.html for now
  // Future: could be extracted to a separate module
}
