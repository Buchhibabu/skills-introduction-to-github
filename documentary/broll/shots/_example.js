// Minimal example shot: a slow orbit around glowing pillars (template for real shots).
import { THREE, register, keys, rng, glowTexture } from '../kit.js';

register('_example', (opts) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070b);
  scene.fog = new THREE.FogExp2(0x05070b, 0.06);
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 200);
  const R = rng(7);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1b2633, metalness: 0.7, roughness: 0.35 });
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1 + R() * 4, 0.6), mat);
    m.position.set((R() - 0.5) * 20, 0, (R() - 0.5) * 20);
    scene.add(m);
  }
  scene.add(new THREE.AmbientLight(0x405060, 0.6));
  const key = new THREE.PointLight(0xf0a63a, 60, 40); key.position.set(0, 4, 0); scene.add(key);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(240,166,58,1)'), blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(3, 3, 1); glow.position.copy(key.position); scene.add(glow);
  return {
    scene, camera, bloom: { strength: 0.9, radius: 0.6, threshold: 0.15 },
    update(lt, { k }) {
      const a = keys(k, [[0, 0], [1, 0.9]]);
      camera.position.set(Math.cos(a) * 12, 3, Math.sin(a) * 12);
      camera.lookAt(0, 1.5, 0);
    },
  };
});
