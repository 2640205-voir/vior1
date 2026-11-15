import * as THREE from 'three';

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  startSize: number;
  endSize: number;
  r: number;
  g: number;
  b: number;
  drag: number;
  gravityY: number;
}

export class PooledParticleSystem {
  public readonly points: THREE.Points;
  private readonly capacity: number;
  private readonly slots: ParticleSlot[];
  private cursor = 0;

  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;

  private readonly posAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;
  private readonly sizeAttr: THREE.BufferAttribute;
  private readonly alphaAttr: THREE.BufferAttribute;

  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  constructor(particleTexture: THREE.Texture, capacity = 900) {
    this.capacity = capacity;
    this.slots = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.slots[i] = {
        active: false,
        x: 0,
        y: -9999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        startSize: 1,
        endSize: 1,
        r: 1,
        g: 1,
        b: 1,
        drag: 0,
        gravityY: 0,
      };
    }

    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);

    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.colAttr = new THREE.BufferAttribute(this.colors, 3);
    this.sizeAttr = new THREE.BufferAttribute(this.sizes, 1);
    this.alphaAttr = new THREE.BufferAttribute(this.alphas, 1);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', this.posAttr);
    this.geometry.setAttribute('aColor', this.colAttr);
    this.geometry.setAttribute('aSize', this.sizeAttr);
    this.geometry.setAttribute('aAlpha', this.alphaAttr);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: particleTexture },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        varying float vAlpha;
        varying vec3 vColor;
        uniform float uPixelRatio;

        void main() {
          vAlpha = aAlpha;
          vColor = aColor;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (260.0 / max(1.0, -mvPosition.z));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying float vAlpha;
        varying vec3 vColor;

        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          float alpha = tex.a * vAlpha;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(vColor * tex.rgb, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  public clear(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.slots[i].active = false;
      this.alphas[i] = 0;
      this.sizes[i] = 0;
    }
    this.alphaAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }

  public spawn(opts: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    maxLife: number;
    startSize: number;
    endSize: number;
    r: number;
    g: number;
    b: number;
    drag?: number;
    gravityY?: number;
  }): void {
    const slot = this.slots[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;

    slot.active = true;
    slot.x = opts.x;
    slot.y = opts.y;
    slot.z = opts.z;
    slot.vx = opts.vx;
    slot.vy = opts.vy;
    slot.vz = opts.vz;
    slot.life = 0;
    slot.maxLife = opts.maxLife;
    slot.startSize = opts.startSize;
    slot.endSize = opts.endSize;
    slot.r = opts.r;
    slot.g = opts.g;
    slot.b = opts.b;
    slot.drag = opts.drag ?? 0.5;
    slot.gravityY = opts.gravityY ?? 0;
  }

  public update(dt: number): void {
    const clampedDt = Math.min(dt, 0.05);
    for (let i = 0; i < this.capacity; i++) {
      const s = this.slots[i];
      if (!s.active) {
        this.alphas[i] = 0;
        continue;
      }

      s.life += clampedDt;
      if (s.life >= s.maxLife) {
        s.active = false;
        this.alphas[i] = 0;
        continue;
      }

      const t = s.life / s.maxLife;
      const damp = Math.exp(-s.drag * clampedDt);
      s.vx *= damp;
      s.vy = s.vy * damp + s.gravityY * clampedDt;
      s.vz *= damp;

      s.x += s.vx * clampedDt;
      s.y += s.vy * clampedDt;
      s.z += s.vz * clampedDt;

      const idx3 = i * 3;
      this.positions[idx3] = s.x;
      this.positions[idx3 + 1] = s.y;
      this.positions[idx3 + 2] = s.z;

      this.colors[idx3] = s.r;
      this.colors[idx3 + 1] = s.g;
      this.colors[idx3 + 2] = s.b;

      this.sizes[i] = s.startSize + (s.endSize - s.startSize) * t;
      // Smooth fade in and fade out
      const fadeIn = Math.min(1, t * 5);
      const fadeOut = 1 - t * t;
      this.alphas[i] = fadeIn * fadeOut * 0.85;
    }

    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
