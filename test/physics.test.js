import { describe, expect, it } from 'vitest';
import {
  cloneBodies,
  computeAccelerations,
  createSimulation,
  makeCircularBinary,
  sanitizeParams,
  totalEnergy,
} from '../src/physics.js';

function separation(a, b) {
  return Math.hypot(
    a.position[0] - b.position[0],
    a.position[1] - b.position[1],
    a.position[2] - b.position[2],
  );
}

describe('N-body physics engine', () => {
  it('keeps pairwise forces symmetric', () => {
    const params = sanitizeParams({ gravity: 2, softening: 0.1 });
    const bodies = [
      {
        id: 'a',
        mass: 2,
        colorPhase: 0,
        position: [-3, 1, 0.5],
        velocity: [0, 0, 0],
        acceleration: [0, 0, 0],
      },
      {
        id: 'b',
        mass: 5,
        colorPhase: 0,
        position: [4, -2, -1],
        velocity: [0, 0, 0],
        acceleration: [0, 0, 0],
      },
    ];

    computeAccelerations(bodies, params);
    const forceA = bodies[0].acceleration.map((axis) => axis * bodies[0].mass);
    const forceB = bodies[1].acceleration.map((axis) => axis * bodies[1].mass);

    expect(forceA[0] + forceB[0]).toBeCloseTo(0, 12);
    expect(forceA[1] + forceB[1]).toBeCloseTo(0, 12);
    expect(forceA[2] + forceB[2]).toBeCloseTo(0, 12);
  });

  it('increases target acceleration when source mass increases', () => {
    const base = [
      {
        id: 'target',
        mass: 1,
        colorPhase: 0,
        position: [0, 0, 0],
        velocity: [0, 0, 0],
        acceleration: [0, 0, 0],
      },
      {
        id: 'source',
        mass: 2,
        colorPhase: 0,
        position: [8, 0, 0],
        velocity: [0, 0, 0],
        acceleration: [0, 0, 0],
      },
    ];
    const doubled = cloneBodies(base);
    doubled[1].mass = 4;

    computeAccelerations(base, { gravity: 1, softening: 0.2 });
    computeAccelerations(doubled, { gravity: 1, softening: 0.2 });

    expect(doubled[0].acceleration[0] / base[0].acceleration[0]).toBeCloseTo(2, 8);
  });

  it('keeps softened near-collisions finite', () => {
    const bodies = [
      {
        id: 'a',
        mass: 1,
        colorPhase: 0,
        position: [0, 0, 0],
        velocity: [0, 0, 0],
        acceleration: [0, 0, 0],
      },
      {
        id: 'b',
        mass: 1,
        colorPhase: 0,
        position: [1e-8, 0, 0],
        velocity: [0, 0, 0],
        acceleration: [0, 0, 0],
      },
    ];

    computeAccelerations(bodies, { gravity: 1, softening: 0.5 });

    expect(Number.isFinite(bodies[0].acceleration[0])).toBe(true);
    expect(Math.abs(bodies[0].acceleration[0])).toBeLessThan(0.001);
  });

  it('replays deterministic systems for the same seed and params', () => {
    const params = {
      bodyCount: 7,
      gravity: 1.2,
      softening: 0.45,
      timeStep: 0.012,
      massMax: 3.5,
      velocityScale: 0.95,
    };
    const a = createSimulation({ seed: 'same-sky', params });
    const b = createSimulation({ seed: 'same-sky', params });

    for (let index = 0; index < 480; index += 1) {
      a.step();
      b.step();
    }

    const stateA = a.getState();
    const stateB = b.getState();

    expect(stateA.energy.total).toBeCloseTo(stateB.energy.total, 12);
    stateA.bodies.forEach((body, index) => {
      expect(body.position[0]).toBeCloseTo(stateB.bodies[index].position[0], 12);
      expect(body.position[1]).toBeCloseTo(stateB.bodies[index].position[1], 12);
      expect(body.position[2]).toBeCloseTo(stateB.bodies[index].position[2], 12);
    });
  });

  it('keeps a two-body circular orbit visually stable', () => {
    const params = sanitizeParams({
      gravity: 1,
      softening: 0.02,
      timeStep: 0.006,
      massMin: 8,
      massMax: 8,
    });
    const bodies = makeCircularBinary({
      separation: 14,
      mass: 8,
      gravity: params.gravity,
      softening: params.softening,
      timeStep: params.timeStep,
    });
    const simulation = createSimulation({ seed: 'binary', params, bodies });
    const initialSeparation = separation(simulation.bodies[0], simulation.bodies[1]);
    const initialEnergy = totalEnergy(simulation.bodies, params).total;

    for (let index = 0; index < 5000; index += 1) {
      simulation.step();
    }

    const finalSeparation = separation(simulation.bodies[0], simulation.bodies[1]);
    const finalEnergy = totalEnergy(simulation.bodies, params).total;
    const separationDrift = Math.abs(finalSeparation - initialSeparation) / initialSeparation;
    const energyDrift = Math.abs(finalEnergy - initialEnergy) / Math.abs(initialEnergy);

    expect(separationDrift).toBeLessThan(0.015);
    expect(energyDrift).toBeLessThan(0.002);
  });
});
