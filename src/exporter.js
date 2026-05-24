import { roundForDisplay } from './utils.js';

export async function exportHighRes(renderer, state, settings, options = {}) {
  const width = options.width ?? 4096;
  const height = options.height ?? 4096;
  const filename = buildExportFilename(state, settings);
  const blob = await renderer.capturePngBlob({ width, height });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);

  return { filename, blob };
}

export function buildExportFilename(state, settings) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const params = state?.params ?? {};
  const seed = safePart(state?.seed ?? settings?.seed ?? 'orbit').slice(0, 48);
  const palette = safePart(settings?.palette ?? 'palette');
  const bodyCount = params.bodyCount ?? settings?.bodyCount ?? 'n';
  const gravity = roundForDisplay(params.gravity ?? settings?.gravity ?? 0, 2).replace('.', 'p');
  const softening = roundForDisplay(params.softening ?? settings?.softening ?? 0, 2).replace('.', 'p');
  const timeStep = roundForDisplay(params.timeStep ?? settings?.timeStep ?? 0, 3).replace('.', 'p');

  return `orbit-${timestamp}-${seed}-${palette}-b${bodyCount}-g${gravity}-s${softening}-dt${timeStep}.png`;
}

function safePart(value) {
  return String(value)
    .trim()
    .replace(/[^a-z0-9_.-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
