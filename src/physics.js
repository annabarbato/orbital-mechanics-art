import {
  TAU,
  clamp,
  createRng,
  createSeed,
  magnitude3,
  randomBetween,
  randomSign,
} from './utils.js';

export const DEFAULT_PHYSICS_PARAMS = Object.freeze({
  bodyCount: 9,
  gravity: 1.35,
  softening: 0.55,
  timeStep: 0.016,
  massMin: 0.45,
  massMax: 4.2,
  spawnRadius: 24,
  velocityScale: 1.0,
  centralMassFactor: 7.5,
  verticalSpread: 0.32,
});

export function sanitizeParams(params = {}) {
  const merged = { ...DEFAULT_PHYSICS_PARAMS, ...params };

  return {
    bodyCount: Math.round(clamp(Number(merged.bodyCount), 2, 64)),
    gravity: clamp(Number(merged.gravity), 0.001, 20),
    softening: clamp(Number(merged.softening), 0.001, 10),
    timeStep: clamp(Number(merged.timeStep), 0.0001, 0.2),
    massMin: clamp(Number(merged.massMin), 0.01, 100),
    massMax: clamp(Number(merged.massMax), 0.02, 200),
    spawnRadius: clamp(Number(merged.spawnRadius), 1, 500),
    velocityScale: clamp(Number(merged.velocityScale), 0, 5),
    centralMassFactor: clamp(Number(merged.centralMassFactor), 0, 100),
    verticalSpread: clamp(Number(merged.verticalSpread), 0, 3),
  };
}

export function cloneBody(body) {
  return {
    id: body.id,
    mass: body.mass,
    colorPhase: body.colorPhase ?? 0,
    position: [...body.position],
    velocity: [...body.velocity],
    acceleration: [...(body.acceleration ?? [0, 0, 0])],
  };
}

export function cloneBodies(bodies) {
  return bodies.map(cloneBody);
}

export function generateBodies(params = DEFAULT_PHYSICS_PARAMS, seed = createSeed()) {
  const config = sanitizeParams(params);
  const rng = createRng(seed);
  const bodies = [];
  const centralMass = Math.max(
    config.massMax * config.centralMassFactor,
    config.massMax + config.bodyCount * 0.8,
  );

  bodies.push({
    id: 'body-0',
    mass: centralMass,
    colorPhase: rng(),
    position: [0, 0, 0],
    velocity: [
      randomBetween(rng, -0.018, 0.018),
      randomBetween(rng, -0.018, 0.018),
      randomBetween(rng, -0.018, 0.018),
    ],
    acceleration: [0, 0, 0],
  });

  for (let index = 1; index < config.bodyCount; index += 1) {
    const angle = rng() * TAU;
    const radius = config.spawnRadius * randomBetween(rng, 0.18, 1.0) ** 0.72;
    const height = randomBetween(
      rng,
      -config.spawnRadius * config.verticalSpread,
      config.spawnRadius * config.verticalSpread,
    );
    const radialNoise = randomBetween(rng, -0.85, 0.85);
    const x = Math.cos(angle) * (radius + radialNoise);
    const z = Math.sin(angle) * (radius - radialNoise);
    const y = height * (0.3 + rng() * 0.7);
    const tangent = [-Math.sin(angle), randomBetween(rng, -0.22, 0.22), Math.cos(angle)];
    const tangentialSpeed = circularSpeed(radius, centralMass, config);
    const direction = randomSign(rng, 0.86);
    const speedJitter = randomBetween(rng, 0.72, 1.28);
    const curl = tangentialSpeed * config.velocityScale * speedJitter * direction;
    const radialKick = randomBetween(rng, -0.08, 0.08) * config.velocityScale;

    bodies.push({
      id: `body-${index}`,
      mass: randomBetween(rng, config.massMin, Math.max(config.massMin, config.massMax)),
      colorPhase: rng(),
      position: [x, y, z],
      velocity: [
        tangent[0] * curl + Math.cos(angle) * radialKick,
        tangent[1] * curl + randomBetween(rng, -0.035, 0.035),
        tangent[2] * curl + Math.sin(angle) * radialKick,
      ],
      acceleration: [0, 0, 0],
    });
  }

  removeCenterOfMassDrift(bodies);
  computeAccelerations(bodies, config);
  return bodies;
}

export function circularSpeed(radius, sourceMass, params = DEFAULT_PHYSICS_PARAMS) {
  const config = sanitizeParams(params);
  const softenedRadiusSquared = radius * radius + config.softening * config.softening;
  return Math.sqrt(
    (config.gravity * sourceMass * radius * radius) /
      Math.max(softenedRadiusSquared ** 1.5, 1e-12),
  );
}

export function computeAccelerations(bodies, params = DEFAULT_PHYSICS_PARAMS) {
  const config = sanitizeParams(params);
  const softeningSquared = config.softening * config.softening;

  for (const body of bodies) {
    body.acceleration[0] = 0;
    body.acceleration[1] = 0;
    body.acceleration[2] = 0;
  }

  for (let i = 0; i < bodies.length - 1; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      const dx = b.position[0] - a.position[0];
      const dy = b.position[1] - a.position[1];
      const dz = b.position[2] - a.position[2];
      const softenedDistanceSquared = dx * dx + dy * dy + dz * dz + softeningSquared;
      const invDistance = 1 / Math.sqrt(softenedDistanceSquared);
      const invDistanceCubed = invDistance * invDistance * invDistance;
      const aScale = config.gravity * b.mass * invDistanceCubed;
      const bScale = config.gravity * a.mass * invDistanceCubed;

      a.acceleration[0] += dx * aScale;
      a.acceleration[1] += dy * aScale;
      a.acceleration[2] += dz * aScale;
      b.acceleration[0] -= dx * bScale;
      b.acceleration[1] -= dy * bScale;
      b.acceleration[2] -= dz * bScale;
    }
  }

  return bodies;
}

export function stepBodies(bodies, params = DEFAULT_PHYSICS_PARAMS, steps = 1) {
  const config = sanitizeParams(params);
  const totalSteps = Math.max(1, Math.floor(steps));

  for (let step = 0; step < totalSteps; step += 1) {
    for (const body of bodies) {
      body.velocity[0] += body.acceleration[0] * config.timeStep * 0.5;
      body.velocity[1] += body.acceleration[1] * config.timeStep * 0.5;
      body.velocity[2] += body.acceleration[2] * config.timeStep * 0.5;

      body.position[0] += body.velocity[0] * config.timeStep;
      body.position[1] += body.velocity[1] * config.timeStep;
      body.position[2] += body.velocity[2] * config.timeStep;
    }

    computeAccelerations(bodies, config);

    for (const body of bodies) {
      body.velocity[0] += body.acceleration[0] * config.timeStep * 0.5;
      body.velocity[1] += body.acceleration[1] * config.timeStep * 0.5;
      body.velocity[2] += body.acceleration[2] * config.timeStep * 0.5;
    }
  }

  return bodies;
}

export function totalEnergy(bodies, params = DEFAULT_PHYSICS_PARAMS) {
  const config = sanitizeParams(params);
  const softeningSquared = config.softening * config.softening;
  let kinetic = 0;
  let potential = 0;

  for (let i = 0; i < bodies.length; i += 1) {
    const body = bodies[i];
    const speed = magnitude3(body.velocity);
    kinetic += 0.5 * body.mass * speed * speed;

    for (let j = i + 1; j < bodies.length; j += 1) {
      const other = bodies[j];
      const dx = other.position[0] - body.position[0];
      const dy = other.position[1] - body.position[1];
      const dz = other.position[2] - body.position[2];
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz + softeningSquared);
      potential -= (config.gravity * body.mass * other.mass) / distance;
    }
  }

  return { kinetic, potential, total: kinetic + potential };
}

export function centerOfMass(bodies) {
  const center = [0, 0, 0];
  let totalMass = 0;

  for (const body of bodies) {
    totalMass += body.mass;
    center[0] += body.position[0] * body.mass;
    center[1] += body.position[1] * body.mass;
    center[2] += body.position[2] * body.mass;
  }

  if (totalMass > 0) {
    center[0] /= totalMass;
    center[1] /= totalMass;
    center[2] /= totalMass;
  }

  return center;
}

export function removeCenterOfMassDrift(bodies) {
  const positionCenter = centerOfMass(bodies);
  const velocityCenter = [0, 0, 0];
  let totalMass = 0;

  for (const body of bodies) {
    totalMass += body.mass;
    velocityCenter[0] += body.velocity[0] * body.mass;
    velocityCenter[1] += body.velocity[1] * body.mass;
    velocityCenter[2] += body.velocity[2] * body.mass;
  }

  if (totalMass > 0) {
    velocityCenter[0] /= totalMass;
    velocityCenter[1] /= totalMass;
    velocityCenter[2] /= totalMass;
  }

  for (const body of bodies) {
    body.position[0] -= positionCenter[0];
    body.position[1] -= positionCenter[1];
    body.position[2] -= positionCenter[2];
    body.velocity[0] -= velocityCenter[0];
    body.velocity[1] -= velocityCenter[1];
    body.velocity[2] -= velocityCenter[2];
  }

  return bodies;
}

export function makeCircularBinary({
  separation = 12,
  mass = 10,
  gravity = 1,
  softening = 0.01,
  timeStep = 0.01,
} = {}) {
  const params = sanitizeParams({
    bodyCount: 2,
    gravity,
    softening,
    timeStep,
    massMin: mass,
    massMax: mass,
  });
  const denominator = Math.max((separation * separation + softening * softening) ** 1.5, 1e-12);
  const speed = Math.sqrt((gravity * mass * separation * separation) / (2 * denominator));
  const bodies = [
    {
      id: 'binary-a',
      mass,
      colorPhase: 0,
      position: [-separation / 2, 0, 0],
      velocity: [0, -speed, 0],
      acceleration: [0, 0, 0],
    },
    {
      id: 'binary-b',
      mass,
      colorPhase: 0.5,
      position: [separation / 2, 0, 0],
      velocity: [0, speed, 0],
      acceleration: [0, 0, 0],
    },
  ];

  computeAccelerations(bodies, params);
  return bodies;
}

export function createSimulation({ seed = createSeed(), params = {}, bodies = null } = {}) {
  let currentSeed = String(seed);
  let currentParams = sanitizeParams(params);
  let currentBodies = bodies ? cloneBodies(bodies) : generateBodies(currentParams, currentSeed);
  let time = 0;
  let stepCount = 0;
  let generation = 0;

  computeAccelerations(currentBodies, currentParams);

  function reset({ seed: nextSeed = currentSeed, params: nextParams = currentParams, bodies: nextBodies = null } = {}) {
    currentSeed = String(nextSeed);
    currentParams = sanitizeParams({ ...currentParams, ...nextParams });
    currentBodies = nextBodies ? cloneBodies(nextBodies) : generateBodies(currentParams, currentSeed);
    time = 0;
    stepCount = 0;
    generation += 1;
    computeAccelerations(currentBodies, currentParams);
  }

  function setParams(nextParams = {}) {
    currentParams = sanitizeParams({ ...currentParams, ...nextParams });
    computeAccelerations(currentBodies, currentParams);
  }

  function step(steps = 1) {
    const boundedSteps = Math.max(1, Math.min(80, Math.floor(steps)));
    stepBodies(currentBodies, currentParams, boundedSteps);
    time += currentParams.timeStep * boundedSteps;
    stepCount += boundedSteps;
  }

  function getState() {
    const speeds = currentBodies.map((body) => magnitude3(body.velocity));
    const speedMin = speeds.length ? Math.min(...speeds) : 0;
    const speedMax = speeds.length ? Math.max(...speeds) : 0;

    return {
      seed: currentSeed,
      params: { ...currentParams },
      generation,
      time,
      stepCount,
      energy: totalEnergy(currentBodies, currentParams),
      speedRange: { min: speedMin, max: speedMax },
      centerOfMass: centerOfMass(currentBodies),
      bodies: currentBodies.map((body, index) => ({
        id: body.id,
        index,
        mass: body.mass,
        colorPhase: body.colorPhase,
        position: [...body.position],
        velocity: [...body.velocity],
        acceleration: [...body.acceleration],
        speed: speeds[index],
      })),
    };
  }

  return {
    reset,
    setParams,
    step,
    getState,
    get bodies() {
      return currentBodies;
    },
    get params() {
      return currentParams;
    },
    get seed() {
      return currentSeed;
    },
  };
}
