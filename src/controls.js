import { DEFAULT_PHYSICS_PARAMS } from './physics.js';
import { createSeed, roundForDisplay } from './utils.js';

export const DEFAULT_UI_SETTINGS = Object.freeze({
  bodyCount: DEFAULT_PHYSICS_PARAMS.bodyCount,
  massMax: DEFAULT_PHYSICS_PARAMS.massMax,
  velocityScale: DEFAULT_PHYSICS_PARAMS.velocityScale,
  gravity: DEFAULT_PHYSICS_PARAMS.gravity,
  softening: DEFAULT_PHYSICS_PARAMS.softening,
  timeStep: DEFAULT_PHYSICS_PARAMS.timeStep,
  simulationSpeed: 2,
  trailLength: 1280,
  bloomStrength: 1.35,
  palette: 'aurora',
  seed: createSeed('atelier'),
});

const NUMBER_FIELDS = [
  'bodyCount',
  'massMax',
  'velocityScale',
  'gravity',
  'softening',
  'timeStep',
  'simulationSpeed',
  'trailLength',
  'bloomStrength',
];

const REGENERATE_FIELDS = ['bodyCount', 'massMax', 'velocityScale'];
const LIVE_FIELDS = ['gravity', 'softening', 'timeStep', 'simulationSpeed', 'trailLength', 'bloomStrength'];

export function createControls({
  palettes,
  initialSettings = DEFAULT_UI_SETTINGS,
  onLiveChange,
  onRegenerate,
  onGenerateNew,
  onPauseToggle,
  onResetCamera,
  onExport,
}) {
  const elements = getElements();
  const state = { ...DEFAULT_UI_SETTINGS, ...initialSettings };
  let paused = false;

  for (const [key, palette] of Object.entries(palettes)) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = palette.label;
    elements.palette.append(option);
  }

  writeSettingsToDom(state, elements);
  updateLabels(state, elements);

  for (const key of NUMBER_FIELDS) {
    elements[key].addEventListener('input', () => {
      state[key] = readNumber(elements[key]);
      updateLabels(state, elements);

      if (LIVE_FIELDS.includes(key)) {
        onLiveChange?.(getSettings());
      }
    });
  }

  for (const key of REGENERATE_FIELDS) {
    elements[key].addEventListener('change', () => {
      state[key] = readNumber(elements[key]);
      updateLabels(state, elements);
      onRegenerate?.(getSettings());
    });
  }

  elements.palette.addEventListener('change', () => {
    state.palette = elements.palette.value;
    onLiveChange?.(getSettings());
  });

  elements.seedInput.addEventListener('change', () => {
    state.seed = elements.seedInput.value.trim() || createSeed('atelier');
    elements.seedInput.value = state.seed;
    onRegenerate?.(getSettings());
  });

  elements.generateButton.addEventListener('click', () => {
    state.seed = createSeed('atelier');
    elements.seedInput.value = state.seed;
    onGenerateNew?.(getSettings());
  });

  elements.pauseButton.addEventListener('click', () => onPauseToggle?.());
  elements.resetCameraButton.addEventListener('click', () => onResetCamera?.());
  elements.exportButton.addEventListener('click', () => onExport?.(getSettings()));

  function getSettings() {
    return { ...state };
  }

  return {
    getSettings,
    setSeed(seed) {
      state.seed = String(seed);
      if (document.activeElement !== elements.seedInput) {
        elements.seedInput.value = state.seed;
      }
      elements.seedStat.textContent = state.seed;
    },
    setPaused(nextPaused) {
      paused = Boolean(nextPaused);
      elements.pauseButton.textContent = paused ? 'Resume' : 'Pause';
      elements.pauseButton.classList.toggle('is-active', paused);
      elements.statePill.textContent = paused ? 'Paused' : 'Live';
      elements.statePill.classList.toggle('is-paused', paused);
    },
    setExporting(isExporting) {
      elements.exportButton.disabled = Boolean(isExporting);
      elements.exportButton.textContent = isExporting ? 'Rendering...' : 'Export PNG';
    },
    setStatus(message) {
      elements.exportStatus.textContent = message ?? '';
      elements.exportStatus.classList.toggle('is-visible', Boolean(message));
    },
    updateStats(simulationState, fps) {
      if (!simulationState) return;
      elements.timeStat.textContent = `${roundForDisplay(simulationState.time, 2)} t`;
      elements.energyStat.textContent = `${roundForDisplay(simulationState.energy?.total ?? 0, 2)} E`;
      elements.fpsStat.textContent = `${Math.round(fps ?? 0)} fps`;
      elements.seedStat.textContent = simulationState.seed;
    },
  };
}

function getElements() {
  const ids = [
    'bodyCount',
    'bodyCountValue',
    'massMax',
    'massMaxValue',
    'velocityScale',
    'velocityScaleValue',
    'gravity',
    'gravityValue',
    'softening',
    'softeningValue',
    'timeStep',
    'timeStepValue',
    'simulationSpeed',
    'simulationSpeedValue',
    'trailLength',
    'trailLengthValue',
    'bloomStrength',
    'bloomStrengthValue',
    'palette',
    'seedInput',
    'generateButton',
    'pauseButton',
    'resetCameraButton',
    'exportButton',
    'statePill',
    'timeStat',
    'energyStat',
    'fpsStat',
    'seedStat',
    'exportStatus',
  ];

  return Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
}

function writeSettingsToDom(settings, elements) {
  for (const key of NUMBER_FIELDS) {
    elements[key].value = settings[key];
  }

  elements.palette.value = settings.palette;
  elements.seedInput.value = settings.seed;
  elements.seedStat.textContent = settings.seed;
}

function updateLabels(settings, elements) {
  elements.bodyCountValue.textContent = `${Math.round(settings.bodyCount)} bodies`;
  elements.massMaxValue.textContent = `${roundForDisplay(settings.massMax, 1)} m.u.`;
  elements.velocityScaleValue.textContent = `${roundForDisplay(settings.velocityScale, 2)} v0`;
  elements.gravityValue.textContent = `${roundForDisplay(settings.gravity, 2)} G`;
  elements.softeningValue.textContent = `${roundForDisplay(settings.softening, 2)} r`;
  elements.timeStepValue.textContent = `${roundForDisplay(settings.timeStep, 3)} dt`;
  elements.simulationSpeedValue.textContent = `${roundForDisplay(settings.simulationSpeed, 2)}x`;
  elements.trailLengthValue.textContent = `${Math.round(settings.trailLength)} pts`;
  elements.bloomStrengthValue.textContent = `${roundForDisplay(settings.bloomStrength, 2)} gain`;
}

function readNumber(element) {
  const number = Number(element.value);
  return Number.isFinite(number) ? number : 0;
}
