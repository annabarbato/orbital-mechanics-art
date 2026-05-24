import { DEFAULT_PHYSICS_PARAMS, createSimulation } from './physics.js';
import { createSeed } from './utils.js';

let simulation = createSimulation({
  seed: createSeed(),
  params: DEFAULT_PHYSICS_PARAMS,
});
let paused = false;

function postState(type = 'state', requestId = null) {
  self.postMessage({
    type,
    requestId,
    paused,
    state: simulation.getState(),
  });
}

self.onmessage = (event) => {
  const message = event.data ?? {};

  try {
    switch (message.type) {
      case 'init':
        simulation = createSimulation({
          seed: message.seed ?? createSeed(),
          params: message.params ?? DEFAULT_PHYSICS_PARAMS,
        });
        paused = false;
        postState('state', message.requestId);
        break;

      case 'reset':
        simulation.reset({
          seed: message.seed ?? simulation.seed,
          params: message.params ?? simulation.params,
        });
        paused = false;
        postState('state', message.requestId);
        break;

      case 'setParams':
        simulation.setParams(message.params ?? {});
        postState('state', message.requestId);
        break;

      case 'pause':
        paused = true;
        postState('state', message.requestId);
        break;

      case 'resume':
        paused = false;
        postState('state', message.requestId);
        break;

      case 'step':
        if (!paused) {
          simulation.step(message.steps ?? 1);
        }
        postState('state', message.requestId);
        break;

      default:
        postState('state', message.requestId);
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId: message.requestId ?? null,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
