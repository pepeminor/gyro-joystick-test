import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/** Tạo renderer + scene + camera + player + môi trường; trả cleanup() */
export function createScene(mount: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x0d0f13, 1);

  // iOS-friendly
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.style.userSelect = "none";
  (renderer.domElement.style as any).webkitUserSelect = "none";
  renderer.domElement.style.setProperty("-webkit-touch-callout", "none");

  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 500);
  camera.position.set(0, 1.6, 6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(8, 12, 6);
  scene.add(dir);

  // Ground + grid
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x0f1115, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const grid = new THREE.GridHelper(400, 80, 0x445566, 0x222a33);
  (grid.material as THREE.LineBasicMaterial).transparent = true;
  (grid.material as THREE.LineBasicMaterial).opacity = 0.7;
  scene.add(grid);

  // Player (cube)
  const player = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
    new THREE.MeshStandardMaterial({ color: 0xff2d2d, metalness: 0.1, roughness: 0.5 })
  );
  player.position.set(0, 0.6, 0);
  scene.add(player);

  // props random
  for (let i = 0; i < 40; i++) {
    const s = 0.3 + Math.random() * 0.8;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(s, s, s),
      new THREE.MeshStandardMaterial({ color: 0x68d391 })
    );
    const r = 40 + Math.random() * 80;
    const t = Math.random() * Math.PI * 2;
    m.position.set(Math.cos(t) * r, s / 2, Math.sin(t) * r);
    scene.add(m);
  }

  const cleanup = () => {
    renderer.dispose();
    mount.removeChild(renderer.domElement);
  };

  return { renderer, scene, camera, player, cleanup };
}
