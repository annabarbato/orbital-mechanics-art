import './styles.css';
import { DEFAULT_PHYSICS_PARAMS } from './physics.js';
import { createControls, DEFAULT_UI_SETTINGS } from './controls.js';
import { exportHighRes } from './exporter.js';
import { createOrbitalRenderer, PALETTES } from './renderer.js';

const canvas = document.getElementById('scene-canvas');
const visualizer = createOrbitalRenderer({
  canvas,
  paletteKey: DEFAULT_UI_SETTINGS.palette,
  trailLength: DEFAULT_UI_SETTINGS.trailLength,
  bloomStrength: DEFAULT_UI_SETTINGS.bloomStrength,
});

const worker = new Worker(new URL('./physics.worker.js', import.meta.url), { type: 'module' });
let latestState = null;
let paused = false;
let pendingStep = false;
let requestId = 0;
let fps = 0;
let frameCount = 0;
let lastFpsSample = performance.now();
let stepAccumulator = 0;

const controls = createControls({
  palettes: PALETTES,
  initialSettings: DEFAULT_UI_SETTINGS,
  onLiveChange(settings) {
    applyLiveSettings(settings);
  },
  onRegenerate(settings) {
    resetSimulation(settings, settings.seed);
  },
  onGenerateNew(settings) {
    resetSimulation(settings, settings.seed);
  },
  onPauseToggle() {
    send(paused ? 'resume' : 'pause');
  },
  onResetCamera() {
    visualizer.resetCamera();
  },
  async onExport(settings) {
    await exportCurrentFrame(settings);
  },
});

worker.addEventListener('message', (event) => {
  const message = event.data ?? {};

  if (message.type === 'error') {
    pendingStep = false;
    controls.setStatus(message.message || 'Simulation worker error.');
    console.error(message.message);
    return;
  }

  if (message.state) {
    latestState = message.state;
    paused = Boolean(message.paused);
    pendingStep = false;
    controls.setPaused(paused);
    controls.setSeed(latestState.seed);
    visualizer.updateState(latestState);
    controls.updateStats(latestState, fps);
  }
});

window.addEventListener('resize', () => visualizer.resize());

send('init', {
  params: physicsParamsFromSettings(DEFAULT_UI_SETTINGS),
  seed: DEFAULT_UI_SETTINGS.seed,
});
requestAnimationFrame(animate);

function animate(now) {
  requestAnimationFrame(animate);
  visualizer.render();
  updateFps(now);

  if (latestState && !paused && !pendingStep) {
    const settings = controls.getSettings();
    stepAccumulator += Number(settings.simulationSpeed);
    const steps = Math.floor(stepAccumulator);

    if (steps > 0) {
      stepAccumulator -= steps;
      pendingStep = true;
      send('step', { steps });
    }
  }
}

function applyLiveSettings(settings) {
  visualizer.setPalette(settings.palette);
  visualizer.setTrailLength(settings.trailLength);
  visualizer.setBloomStrength(settings.bloomStrength);
  send('setParams', {
    params: physicsParamsFromSettings(settings),
  });
}

function resetSimulation(settings, seed) {
  controls.setStatus('');
  visualizer.setPalette(settings.palette);
  visualizer.setTrailLength(settings.trailLength);
  visualizer.setBloomStrength(settings.bloomStrength);
  stepAccumulator = 0;
  pendingStep = true;
  send('reset', {
    seed,
    params: physicsParamsFromSettings(settings),
  });
}

async function exportCurrentFrame(settings) {
  if (!latestState) return;

  controls.setExporting(true);
  controls.setStatus('Rendering 4096 x 4096 PNG...');

  try {
    const result = await exportHighRes(visualizer, latestState, settings);
    controls.setStatus(`Saved ${result.filename}`);
  } catch (error) {
    controls.setStatus(error instanceof Error ? error.message : 'Export failed.');
  } finally {
    controls.setExporting(false);
    window.setTimeout(() => controls.setStatus(''), 4200);
  }
}

function send(type, payload = {}) {
  worker.postMessage({
    type,
    requestId: requestId += 1,
    ...payload,
  });
}

function physicsParamsFromSettings(settings) {
  const massMax = Number(settings.massMax);

  return {
    ...DEFAULT_PHYSICS_PARAMS,
    bodyCount: Number(settings.bodyCount),
    massMin: Math.max(0.16, massMax * 0.12),
    massMax,
    velocityScale: Number(settings.velocityScale),
    gravity: Number(settings.gravity),
    softening: Number(settings.softening),
    timeStep: Number(settings.timeStep),
  };
}

function updateFps(now) {
  frameCount += 1;

  if (now - lastFpsSample >= 500) {
    fps = (frameCount * 1000) / (now - lastFpsSample);
    frameCount = 0;
    lastFpsSample = now;
    controls.updateStats(latestState, fps);
  }
}
