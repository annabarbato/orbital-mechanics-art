import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { clamp, lerp } from './utils.js';

export const PALETTES = Object.freeze({
  aurora: {
    label: 'Aurora',
    background: '#03070b',
    fog: '#09141b',
    stars: ['#bffcff', '#ffec9a', '#ff9bea'],
    colors: ['#2ff3ff', '#fbff5a', '#ff4ed2', '#7dff77', '#ff8a5b'],
  },
  prism: {
    label: 'Prism',
    background: '#050509',
    fog: '#111018',
    stars: ['#ffffff', '#aee8ff', '#ffe1a8'],
    colors: ['#00e6a8', '#ffcf33', '#ff3b6b', '#5f7cff', '#f6f7ff'],
  },
  ember: {
    label: 'Ember',
    background: '#070504',
    fog: '#160d09',
    stars: ['#ffe1a8', '#ffc06a', '#d8f7ff'],
    colors: ['#ffdd66', '#ff7043', '#eb2f6b', '#38e8c6', '#7aa7ff'],
  },
  opal: {
    label: 'Opal',
    background: '#03080a',
    fog: '#0a1512',
    stars: ['#f4fff8', '#d1f5ff', '#ffe3f1'],
    colors: ['#b7ffcf', '#7ce7ff', '#ffe66d', '#ff8fd6', '#d9f1ff'],
  },
  nocturne: {
    label: 'Nocturne',
    background: '#020407',
    fog: '#070d13',
    stars: ['#dcecff', '#fff3c5', '#ffc7df'],
    colors: ['#4be1ff', '#ffcf4a', '#ff5b8f', '#98ff6a', '#cab2ff'],
  },
});

const BODY_GEOMETRY = new THREE.IcosahedronGeometry(1, 2);
let glowTexture = null;

export function createOrbitalRenderer(options) {
  return new OrbitalRenderer(options);
}

class OrbitalRenderer {
  constructor({
    canvas,
    paletteKey = 'aurora',
    trailLength = 1200,
    bloomStrength = 1.35,
  }) {
    this.canvas = canvas;
    this.paletteKey = paletteKey;
    this.palette = PALETTES[paletteKey] ?? PALETTES.aurora;
    this.trailLength = trailLength;
    this.bodyObjects = new Map();
    this.trails = new Map();
    this.lastGeneration = null;
    this.lastState = null;
    this.frameIndex = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.palette.background);
    this.scene.fog = new THREE.FogExp2(this.palette.fog, 0.008);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 3000);
    this.defaultCameraPosition = new THREE.Vector3(0, 30, 68);
    this.camera.position.copy(this.defaultCameraPosition);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 260;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.18;

    this.trailGroup = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.starGroup = new THREE.Group();
    this.scene.add(this.starGroup, this.trailGroup, this.bodyGroup);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.28));
    const keyLight = new THREE.PointLight(0xeffaff, 1.8, 260);
    keyLight.position.set(22, 38, 28);
    this.scene.add(keyLight);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), bloomStrength, 0.58, 0.12);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.composer.addPass(this.bloomPass);

    this.createStarfield();
    this.resize();
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
  }

  updateState(state) {
    if (!state?.bodies?.length) return;

    const bodyCountChanged = state.bodies.length !== this.bodyObjects.size;
    if (state.generation !== this.lastGeneration || bodyCountChanged) {
      this.rebuildBodies(state);
      this.lastGeneration = state.generation;
    }

    this.lastState = state;
    this.canvas.dataset.bodyCount = String(state.bodies.length);
    this.canvas.dataset.stepCount = String(state.stepCount);
    const speedMax = Math.max(state.speedRange?.max ?? 1, 0.000001);

    for (const body of state.bodies) {
      const object = this.bodyObjects.get(body.id);
      const trail = this.trails.get(body.id);
      if (!object || !trail) continue;

      const [x, y, z] = body.position;
      object.core.position.set(x, y, z);
      object.glow.position.set(x, y, z);

      const scale = clamp(Math.cbrt(body.mass) * 0.28, 0.28, 2.35);
      object.core.scale.setScalar(scale);
      object.glow.scale.setScalar(scale * lerp(4.2, 6.8, clamp(body.speed / speedMax, 0, 1)));

      const color = this.bodyColor(body, body.index, clamp(body.speed / speedMax, 0, 1), 1);
      object.core.material.color.copy(color);
      object.glow.material.color.copy(color);

      this.appendTrailPoint(trail, body, state.speedRange);
    }

    this.canvas.dataset.trailVertices = String(
      [...this.trails.values()].reduce((total, trail) => total + trail.count, 0),
    );
  }

  render() {
    this.controls.update();
    this.composer.render();
    this.frameIndex += 1;

    if (this.frameIndex % 30 === 0) {
      this.updateRenderSignal();
    }
  }

  setTrailLength(length) {
    const nextLength = Math.round(clamp(Number(length), 32, 6000));
    if (nextLength === this.trailLength) return;

    this.trailLength = nextLength;
    for (const trail of this.trails.values()) {
      const keep = Math.min(trail.count, nextLength);
      const nextPositions = new Float32Array(nextLength * 3);
      const nextColors = new Float32Array(nextLength * 3);
      const sourceStart = Math.max(0, trail.count - keep) * 3;
      nextPositions.set(trail.positions.subarray(sourceStart, trail.count * 3));
      nextColors.set(trail.colors.subarray(sourceStart, trail.count * 3));
      trail.positions = nextPositions;
      trail.colors = nextColors;
      trail.count = keep;
      trail.geometry.setAttribute('position', new THREE.BufferAttribute(nextPositions, 3));
      trail.geometry.setAttribute('color', new THREE.BufferAttribute(nextColors, 3));
      trail.geometry.setDrawRange(0, keep);
    }
  }

  setBloomStrength(strength) {
    this.bloomPass.strength = clamp(Number(strength), 0, 4);
  }

  setPalette(paletteKey) {
    const nextPalette = PALETTES[paletteKey] ?? PALETTES.aurora;
    if (nextPalette === this.palette) return;

    this.paletteKey = paletteKey;
    this.palette = nextPalette;
    this.scene.background = new THREE.Color(nextPalette.background);
    this.scene.fog = new THREE.FogExp2(nextPalette.fog, 0.008);
    this.createStarfield();

    if (this.lastState) {
      for (const trail of this.trails.values()) {
        trail.count = 0;
        trail.geometry.setDrawRange(0, 0);
      }
      this.updateState(this.lastState);
    }
  }

  resetCamera() {
    this.camera.position.copy(this.defaultCameraPosition);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  async capturePngBlob({ width = 4096, height = 4096 } = {}) {
    const previousPixelRatio = this.renderer.getPixelRatio();
    const previousSize = this.renderer.getSize(new THREE.Vector2());
    const previousAspect = this.camera.aspect;

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.composer.render();

    const blob = await new Promise((resolve) => {
      this.renderer.domElement.toBlob(resolve, 'image/png', 1);
    });

    this.renderer.setPixelRatio(previousPixelRatio);
    this.renderer.setSize(previousSize.x, previousSize.y, false);
    this.composer.setSize(previousSize.x, previousSize.y);
    this.camera.aspect = previousAspect;
    this.camera.updateProjectionMatrix();
    this.composer.render();

    if (!blob) {
      throw new Error('PNG export failed.');
    }

    return blob;
  }

  rebuildBodies(state) {
    this.clearGroup(this.bodyGroup);
    this.clearGroup(this.trailGroup);
    this.bodyObjects.clear();
    this.trails.clear();

    for (const body of state.bodies) {
      const color = this.bodyColor(body, body.index, 0.5, 1);
      const core = new THREE.Mesh(
        BODY_GEOMETRY,
        new THREE.MeshBasicMaterial({ color, toneMapped: false }),
      );
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getGlowTexture(),
          color,
          transparent: true,
          opacity: body.index === 0 ? 0.82 : 0.58,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );

      core.frustumCulled = false;
      glow.frustumCulled = false;
      this.bodyGroup.add(glow, core);
      this.bodyObjects.set(body.id, { core, glow });

      const positions = new Float32Array(this.trailLength * 3);
      const colors = new Float32Array(this.trailLength * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.setDrawRange(0, 0);

      const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: body.index === 0 ? 0.28 : 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;
      this.trailGroup.add(line);
      this.trails.set(body.id, {
        bodyIndex: body.index,
        phase: body.colorPhase,
        positions,
        colors,
        geometry,
        material,
        line,
        count: 0,
      });
    }
  }

  appendTrailPoint(trail, body, speedRange = { min: 0, max: 1 }) {
    let writeIndex = trail.count;

    if (trail.count >= this.trailLength) {
      trail.positions.copyWithin(0, 3);
      trail.colors.copyWithin(0, 3);
      writeIndex = this.trailLength - 1;
    } else {
      trail.count += 1;
    }

    const offset = writeIndex * 3;
    trail.positions[offset] = body.position[0];
    trail.positions[offset + 1] = body.position[1];
    trail.positions[offset + 2] = body.position[2];

    this.updateTrailColors(trail, body, speedRange);
    trail.geometry.attributes.position.needsUpdate = true;
    trail.geometry.attributes.color.needsUpdate = true;
    trail.geometry.setDrawRange(0, trail.count);
  }

  updateTrailColors(trail, body, speedRange) {
    const range = Math.max((speedRange.max ?? 1) - (speedRange.min ?? 0), 0.000001);
    const normalizedSpeed = clamp((body.speed - (speedRange.min ?? 0)) / range, 0, 1);

    for (let index = 0; index < trail.count; index += 1) {
      const age = trail.count <= 1 ? 1 : index / (trail.count - 1);
      const color = this.bodyColor(body, trail.bodyIndex, normalizedSpeed, age);
      const offset = index * 3;
      trail.colors[offset] = color.r;
      trail.colors[offset + 1] = color.g;
      trail.colors[offset + 2] = color.b;
    }
  }

  bodyColor(body, index, normalizedSpeed, age) {
    const colorStops = this.palette.colors;
    const position = (index * 0.73 + (body.colorPhase ?? 0)) % colorStops.length;
    const baseIndex = Math.floor(position);
    const nextIndex = (baseIndex + 1) % colorStops.length;
    const color = new THREE.Color(colorStops[baseIndex]).lerp(
      new THREE.Color(colorStops[nextIndex]),
      position - baseIndex,
    );
    const hsl = {};
    color.getHSL(hsl);
    const lightness = clamp(lerp(0.08, 0.76, age) + normalizedSpeed * 0.2, 0.03, 0.92);
    color.setHSL(hsl.h, clamp(hsl.s * 1.08, 0, 1), lightness);
    return color;
  }

  createStarfield() {
    this.clearGroup(this.starGroup);

    const colors = this.palette.stars.map((color) => new THREE.Color(color));
    const count = 1800;
    const positions = new Float32Array(count * 3);
    const starColors = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
      const radius = lerp(160, 520, Math.random());
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const offset = index * 3;
      positions[offset] = radius * Math.sin(phi) * Math.cos(theta);
      positions[offset + 1] = radius * Math.cos(phi);
      positions[offset + 2] = radius * Math.sin(phi) * Math.sin(theta);

      const color = colors[index % colors.length].clone().multiplyScalar(lerp(0.35, 1.0, Math.random()));
      starColors[offset] = color.r;
      starColors[offset + 1] = color.g;
      starColors[offset + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.55,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });

    const stars = new THREE.Points(geometry, material);
    stars.frustumCulled = false;
    this.starGroup.add(stars);
  }

  clearGroup(group) {
    while (group.children.length > 0) {
      const child = group.children[group.children.length - 1];
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
  }

  updateRenderSignal() {
    try {
      const gl = this.renderer.getContext();
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const pixel = new Uint8Array(4);
      const samples = [
        [0.5, 0.5],
        [0.33, 0.4],
        [0.67, 0.6],
        [0.25, 0.72],
        [0.75, 0.28],
      ];
      let signal = 0;

      for (const [xRatio, yRatio] of samples) {
        const x = Math.floor(width * xRatio);
        const y = Math.floor(height * yRatio);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        signal += pixel[0] + pixel[1] + pixel[2];
      }

      this.canvas.dataset.renderSignal = String(signal);
      this.canvas.dataset.renderHealth = signal > 8 ? 'lit' : 'dim';
    } catch (error) {
      this.canvas.dataset.renderHealth = 'unknown';
    }
  }
}

function getGlowTexture() {
  if (glowTexture) return glowTexture;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.82)');
  gradient.addColorStop(0.48, 'rgba(255,255,255,0.22)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}
