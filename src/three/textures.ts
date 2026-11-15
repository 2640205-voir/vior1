import * as THREE from 'three';

function hash2D(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const a = hash2D(xi, yi);
  const b = hash2D(xi + 1, yi);
  const c = hash2D(xi, yi + 1);
  const d = hash2D(xi + 1, yi + 1);

  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, octaves = 4): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * valueNoise(x * freq, y * freq);
    freq *= 2.02;
    amp *= 0.5;
  }
  return value;
}

export function createEarthTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  cloudsMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const w = 1024;
  const h = 512;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = w;
  colorCanvas.height = h;
  const cCtx = colorCanvas.getContext('2d')!;
  const imgData = cCtx.createImageData(w, h);

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = w;
  bumpCanvas.height = h;
  const bCtx = bumpCanvas.getContext('2d')!;
  const bumpData = bCtx.createImageData(w, h);

  for (let y = 0; y < h; y++) {
    const lat = Math.abs((y / h) * 2 - 1);
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const nx = (x / w) * 6.5;
      const ny = (y / h) * 3.5;
      const elevation = fbm(nx + 3.2, ny + 1.7, 5);
      const moisture = fbm(nx + 12.4, ny + 8.1, 4);

      let r = 10;
      let g = 45;
      let b = 110;
      let bumpVal = 40;

      if (lat > 0.84 - elevation * 0.12) {
        // Polar ice caps
        r = 232;
        g = 242;
        b = 252;
        bumpVal = 175;
      } else if (elevation > 0.51) {
        // Landmasses
        const landHeight = (elevation - 0.51) / 0.49;
        bumpVal = Math.min(255, Math.floor(110 + landHeight * 145));
        if (landHeight > 0.58) {
          // Mountain peaks
          r = 148;
          g = 144;
          b = 136;
        } else if (moisture < 0.44) {
          // Arid desert / savanna
          r = 178;
          g = 152;
          b = 104;
        } else {
          // Lush green forests
          r = 46 + Math.floor(moisture * 40);
          g = 105 + Math.floor(moisture * 45);
          b = 54;
        }
      } else {
        // Deep ocean to shallow coastal shelf
        const depth = elevation / 0.51;
        r = Math.floor(8 + depth * 18);
        g = Math.floor(38 + depth * 56);
        b = Math.floor(96 + depth * 72);
        bumpVal = 30;
      }

      imgData.data[idx] = r;
      imgData.data[idx + 1] = g;
      imgData.data[idx + 2] = b;
      imgData.data[idx + 3] = 255;

      bumpData.data[idx] = bumpVal;
      bumpData.data[idx + 1] = bumpVal;
      bumpData.data[idx + 2] = bumpVal;
      bumpData.data[idx + 3] = 255;
    }
  }
  cCtx.putImageData(imgData, 0, 0);
  bCtx.putImageData(bumpData, 0, 0);

  // Clouds layer
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = w;
  cloudCanvas.height = h;
  const clCtx = cloudCanvas.getContext('2d')!;
  const clData = clCtx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const n = fbm((x / w) * 9.0 + 21.3, (y / h) * 5.0 + 4.9, 5);
      const alpha = n > 0.53 ? Math.min(240, Math.floor(((n - 0.53) / 0.35) * 230)) : 0;
      clData.data[idx] = 245;
      clData.data[idx + 1] = 250;
      clData.data[idx + 2] = 255;
      clData.data[idx + 3] = alpha;
    }
  }
  clCtx.putImageData(clData, 0, 0);

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;

  const cloudsMap = new THREE.CanvasTexture(cloudCanvas);
  cloudsMap.colorSpace = THREE.SRGBColorSpace;
  cloudsMap.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;

  return { map, cloudsMap, bumpMap };
}

export function createMoonTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  // Base regolith noise
  const cImg = ctx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const n = fbm((x / size) * 8, (y / size) * 8, 5);
      const mare = fbm((x / size) * 2.5 + 4, (y / size) * 2.5 + 9, 3);
      const base = Math.floor(110 + n * 70 - (mare > 0.54 ? 32 : 0));
      cImg.data[idx] = base;
      cImg.data[idx + 1] = base;
      cImg.data[idx + 2] = Math.min(255, base + 4);
      cImg.data[idx + 3] = 255;

      const bVal = Math.floor(100 + n * 95);
      bImg.data[idx] = bVal;
      bImg.data[idx + 1] = bVal;
      bImg.data[idx + 2] = bVal;
      bImg.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(cImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);

  // Stamp crisp craters onto both albedo and bump
  for (let i = 0; i < 95; i++) {
    const cx = hash2D(i, 1.3) * size;
    const cy = hash2D(i, 7.9) * size;
    const r = 4 + hash2D(i, 15.1) * 26;

    const grad = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
    grad.addColorStop(0, 'rgba(72, 74, 80, 0.52)');
    grad.addColorStop(0.76, 'rgba(92, 95, 102, 0.35)');
    grad.addColorStop(0.9, 'rgba(205, 208, 214, 0.42)');
    grad.addColorStop(1, 'rgba(140, 142, 148, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    const bGrad = bCtx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
    bGrad.addColorStop(0, 'rgba(30, 30, 30, 0.65)');
    bGrad.addColorStop(0.75, 'rgba(70, 70, 70, 0.4)');
    bGrad.addColorStop(0.92, 'rgba(235, 235, 235, 0.55)');
    bGrad.addColorStop(1, 'rgba(128, 128, 128, 0)');
    bCtx.fillStyle = bGrad;
    bCtx.beginPath();
    bCtx.arc(cx, cy, r, 0, Math.PI * 2);
    bCtx.fill();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.MirroredRepeatWrapping;
  map.wrapT = THREE.MirroredRepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.wrapS = THREE.MirroredRepeatWrapping;
  bumpMap.wrapT = THREE.MirroredRepeatWrapping;

  return { map, bumpMap };
}

export function createBrushedMetalTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#909090';
  ctx.fillRect(0, 0, size, size);

  // Subtle brushed aerospace panel lines and grain
  for (let y = 0; y < size; y += 2) {
    const v = 132 + Math.floor(hash2D(y, 4.2) * 32);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, y, size, 1);
  }

  ctx.strokeStyle = 'rgba(40,40,40,0.45)';
  ctx.lineWidth = 1;
  for (let i = 0; i < size; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

export function createThermalTileTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#14171d';
  ctx.fillRect(0, 0, size, size);

  const step = 16;
  for (let y = 0; y < size; y += step) {
    const offset = (y / step) % 2 === 0 ? 0 : step / 2;
    for (let x = -step; x < size; x += step) {
      const shade = 20 + Math.floor(hash2D(x + offset, y) * 18);
      ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 6})`;
      ctx.fillRect(x + offset + 1, y + 1, step - 2, step - 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 6);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createAsteroidTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 256;
  const cCanvas = document.createElement('canvas');
  cCanvas.width = size;
  cCanvas.height = size;
  const cCtx = cCanvas.getContext('2d')!;
  const cImg = cCtx.createImageData(size, size);

  const bCanvas = document.createElement('canvas');
  bCanvas.width = size;
  bCanvas.height = size;
  const bCtx = bCanvas.getContext('2d')!;
  const bImg = bCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const n = fbm((x / size) * 7, (y / size) * 7, 4);
      const streak = fbm((x / size) * 16, (y / size) * 3, 2);
      const base = Math.floor(72 + n * 75 + streak * 20);
      cImg.data[idx] = Math.min(255, base + 12);
      cImg.data[idx + 1] = base + 4;
      cImg.data[idx + 2] = Math.max(0, base - 6);
      cImg.data[idx + 3] = 255;

      const bVal = Math.floor(40 + n * 200);
      bImg.data[idx] = bVal;
      bImg.data[idx + 1] = bVal;
      bImg.data[idx + 2] = bVal;
      bImg.data[idx + 3] = 255;
    }
  }
  cCtx.putImageData(cImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);

  const map = new THREE.CanvasTexture(cCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;

  return { map, bumpMap };
}

export function createParticleTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.32, 'rgba(255, 255, 255, 0.8)');
  grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.22)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.42)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createPlanetaryRegolithTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const cCanvas = document.createElement('canvas');
  cCanvas.width = size;
  cCanvas.height = size;
  const cCtx = cCanvas.getContext('2d')!;
  const cImg = cCtx.createImageData(size, size);

  const bCanvas = document.createElement('canvas');
  bCanvas.width = size;
  bCanvas.height = size;
  const bCtx = bCanvas.getContext('2d')!;
  const bImg = bCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const u = x / size;
      const v = y / size;
      const n = fbm(u * 10, v * 10, 4);
      const ridge = Math.abs(fbm(u * 20 + 4.2, v * 20 + 1.9, 3) - 0.5) * 2;
      const grit = hash2D(x, y) * 0.12;
      const base = Math.max(40, Math.min(255, Math.floor(155 + n * 75 - ridge * 32 + grit * 40)));
      cImg.data[idx] = base;
      cImg.data[idx + 1] = base;
      cImg.data[idx + 2] = base;
      cImg.data[idx + 3] = 255;

      const bVal = Math.max(0, Math.min(255, Math.floor(85 + n * 110 + ridge * 65)));
      bImg.data[idx] = bVal;
      bImg.data[idx + 1] = bVal;
      bImg.data[idx + 2] = bVal;
      bImg.data[idx + 3] = 255;
    }
  }
  cCtx.putImageData(cImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);

  for (let i = 0; i < 36; i++) {
    const cx = hash2D(i, 2.1) * size;
    const cy = hash2D(i, 9.7) * size;
    const r = 6 + hash2D(i, 4.4) * 20;

    const cg = cCtx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    cg.addColorStop(0, 'rgba(110,112,120,0.38)');
    cg.addColorStop(0.82, 'rgba(225,228,235,0.22)');
    cg.addColorStop(1, 'rgba(180,180,180,0)');
    cCtx.fillStyle = cg;
    cCtx.beginPath();
    cCtx.arc(cx, cy, r, 0, Math.PI * 2);
    cCtx.fill();

    const bg = bCtx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    bg.addColorStop(0, 'rgba(40,40,40,0.55)');
    bg.addColorStop(0.86, 'rgba(230,230,230,0.45)');
    bg.addColorStop(1, 'rgba(128,128,128,0)');
    bCtx.fillStyle = bg;
    bCtx.beginPath();
    bCtx.arc(cx, cy, r, 0, Math.PI * 2);
    bCtx.fill();
  }

  const map = new THREE.CanvasTexture(cCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.MirroredRepeatWrapping;
  map.wrapT = THREE.MirroredRepeatWrapping;
  map.repeat.set(9, 9);
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.wrapS = THREE.MirroredRepeatWrapping;
  bumpMap.wrapT = THREE.MirroredRepeatWrapping;
  bumpMap.repeat.set(9, 9);

  return { map, bumpMap };
}

