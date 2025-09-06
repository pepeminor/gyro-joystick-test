import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Quaternion bù -90° quanh trục X (chuẩn khi map DeviceOrientation -> camera)
const QX_MINUS_90 = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -Math.PI / 2
);

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animRef = useRef<number | null>(null);

  // Gyro
  const enabledRef = useRef(false);
  const screenFixQ = useRef(new THREE.Quaternion()); // bù góc quay màn hình
  const euler = useRef(new THREE.Euler());
  const q = useRef(new THREE.Quaternion());

  // UI/debug
  const [debugText, setDebugText] = useState("Tap Enable Gyro →");
  const [hud, setHud] = useState("init…");
  const [evtCount, setEvtCount] = useState(0);

  // Movement
  const keys = useRef<Record<string, boolean>>({});
  const joyVec = useRef(new THREE.Vector2(0, 0));

  // Recenter yaw
  const recenter = () => {
    const cam = cameraRef.current;
    if (!cam) return;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    const invYaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -yaw
    );
    cam.quaternion.premultiply(invYaw);
  };

  const updateScreenFix = () => {
    const angleDeg =
      (screen.orientation?.angle as number) ?? (window as any).orientation ?? 0;
    const angle = (angleDeg * Math.PI) / 180;
    screenFixQ.current.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -angle);
  };

  useEffect(() => {
    updateScreenFix();
    const onChange = () => updateScreenFix();
    screen.orientation?.addEventListener("change", onChange);
    return () => screen.orientation?.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setClearColor(0x20252b, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene & camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      200
    );
    camera.position.set(0, 1.6, 5);
    cameraRef.current = camera;

    // Controls (fallback desktop)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1;
    controlsRef.current = controls;

    // Helpers & lights
    scene.add(new THREE.GridHelper(60, 60, 0xffffff, 0x444444));
    const axes = new THREE.AxesHelper(3);
    axes.position.set(0, 1.2, 0);
    scene.add(axes);

    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 10, 7);
    scene.add(dir);
    scene.add(new THREE.DirectionalLightHelper(dir, 1, 0xffee88));

    const point = new THREE.PointLight(0xffffff, 2.0, 0, 2);
    point.position.set(-3, 2, 2);
    scene.add(point);
    scene.add(new THREE.PointLightHelper(point, 0.3, 0x88ff88));

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: 0x0f1115, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Cube đỏ dễ thấy
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.5, 1.5),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    cube.position.set(0, 1.2, -2);
    scene.add(cube);

    // Skybox 6 màu
    scene.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(80, 80, 80),
        [0xff6b6b, 0x4fd1c5, 0xf6ad55, 0x90cdf4, 0xb794f4, 0x68d391].map(
          (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide })
        ) as THREE.Material[]
      )
    );

    controls.target.copy(cube.position);
    camera.lookAt(cube.position);

    // Resize theo viewport
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // Loop
    let last = performance.now();
    const up = new THREE.Vector3(0, 1, 0);
    const tmp = new THREE.Vector3();
    const right = new THREE.Vector3();
    const speed = 2.2;

    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;

      cube.rotation.x += 0.6 * dt;
      cube.rotation.y += 0.8 * dt;

      // WASD/joystick move
      const move = new THREE.Vector2(0, 0);
      if (keys.current["w"]) move.y += 1;
      if (keys.current["s"]) move.y -= 1;
      if (keys.current["a"]) move.x -= 1;
      if (keys.current["d"]) move.x += 1;
      move.add(joyVec.current);
      if (move.lengthSq() > 0) {
        move.clampLength(0, 1);
        camera.getWorldDirection(tmp);
        tmp.y = 0;
        tmp.normalize();
        right.crossVectors(tmp, up).normalize().multiplyScalar(-1);
        const worldMove = new THREE.Vector3();
        worldMove.addScaledVector(tmp, move.y);
        worldMove.addScaledVector(right, move.x);
        camera.position.addScaledVector(worldMove.normalize(), speed * dt);
      }

      // Controls: khi bật gyro thì khóa rotate, vẫn cho zoom/pan
      if (controlsRef.current) {
        const gyro = enabledRef.current;
        controlsRef.current.enableRotate = !gyro;
        controlsRef.current.enableZoom = true;
        controlsRef.current.enablePan = true;
        controlsRef.current.autoRotate = !gyro;
        controlsRef.current.update();
      }

      renderer.render(scene, camera);
      animRef.current = requestAnimationFrame(tick);
    };
    tick();

    // keys
    const down = (e: KeyboardEvent) =>
      (keys.current[e.key.toLowerCase()] = true);
    const upk = (e: KeyboardEvent) =>
      (keys.current[e.key.toLowerCase()] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", upk);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", upk);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // ===== DeviceOrientation -> camera quaternion =====
  useEffect(() => {
    const onOrientation = (ev: DeviceOrientationEvent) => {
      if (!enabledRef.current || !cameraRef.current) return;

      const { alpha, beta, gamma } = ev;
      const a = THREE.MathUtils.degToRad(alpha || 0); // yaw
      const b = THREE.MathUtils.degToRad(beta || 0);  // pitch
      const g = THREE.MathUtils.degToRad(gamma || 0); // roll

      // q = R(b,a,-g) * Rx(-90deg) * Rz(-screenAngle)
      euler.current.set(b, a, -g, "YXZ");
      q.current.setFromEuler(euler.current);
      q.current.multiply(QX_MINUS_90);
      q.current.multiply(screenFixQ.current);

      cameraRef.current.quaternion.copy(q.current);

      setDebugText(
        `α:${(alpha ?? 0).toFixed(1)} β:${(beta ?? 0).toFixed(1)} γ:${(
          gamma ?? 0
        ).toFixed(1)}`
      );
      setEvtCount((c) => c + 1);
    };

    window.addEventListener("deviceorientation", onOrientation, true);
    window.addEventListener(
      "deviceorientationabsolute",
      onOrientation as any,
      true
    );
    return () => {
      window.removeEventListener("deviceorientation", onOrientation, true);
      window.removeEventListener(
        "deviceorientationabsolute",
        onOrientation as any,
        true
      );
    };
  }, []);

  // ===== Request permission & lock orientation (nếu có) =====
  const requestGyro = async () => {
    setHud("requesting permission…");
    try {
      const NeedsPerm =
        typeof (window as any).DeviceOrientationEvent !== "undefined" &&
        typeof (DeviceOrientationEvent as any).requestPermission === "function";
      if (NeedsPerm) {
        const st = await (DeviceOrientationEvent as any).requestPermission();
        if (st !== "granted") {
          setHud("permission denied (iOS)");
          return;
        }
        if (
          typeof (window as any).DeviceMotionEvent !== "undefined" &&
          typeof (DeviceMotionEvent as any).requestPermission === "function"
        ) {
          try {
            await (DeviceMotionEvent as any).requestPermission();
          } catch {}
        }
      }

      setEvtCount(0);
      enabledRef.current = true;
      setHud("gyro ON — waiting events…");

      setTimeout(() => {
        setHud(
          evtCount > 0
            ? `receiving events ✔ (${evtCount})`
            : "no sensor events — check headers/HTTPS or open in Safari/Chrome"
        );
      }, 2000);

      const orien: any = screen.orientation;
      if (orien?.lock && typeof orien.lock === "function") {
        try {
          await orien.lock("landscape");
        } catch {}
      }
    } catch (e) {
      console.error(e);
      setHud("gyro error");
    }
  };

  // ===== Simple joystick (optional) =====
  const JOY_RADIUS = 60,
    JOY_DEADZONE = 8;
  const [joyActive, setJoyActive] = useState(false);
  const [joyPos, setJoyPos] = useState<{ x: number; y: number } | null>(null);
  const joyOrigin = useRef<{ x: number; y: number } | null>(null);
  const onJoyStart = (e: React.PointerEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left,
      y = e.clientY - rect.top;
    joyOrigin.current = { x, y };
    setJoyActive(true);
    setJoyPos({ x, y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onJoyMove = (e: React.PointerEvent) => {
    if (!joyOrigin.current) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left,
      y = e.clientY - rect.top;
    const dx = x - joyOrigin.current.x,
      dy = y - joyOrigin.current.y;
    const v = new THREE.Vector2(dx, dy),
      len = v.length();
    const clamped = v.clone();
    if (len > JOY_RADIUS) clamped.setLength(JOY_RADIUS);
    setJoyPos({
      x: joyOrigin.current.x + clamped.x,
      y: joyOrigin.current.y + clamped.y,
    });
    const nx = clamped.x / JOY_RADIUS,
      ny = -clamped.y / JOY_RADIUS;
    const mag = Math.sqrt(nx * nx + ny * ny);
    if (mag < JOY_DEADZONE / JOY_RADIUS) joyVec.current.set(0, 0);
    else joyVec.current.set(nx, ny);
  };
  const onJoyEnd = () => {
    joyOrigin.current = null;
    setJoyActive(false);
    setJoyPos(null);
    joyVec.current.set(0, 0);
  };

  return (
    <div className="w-full h-screen bg-black text-white select-none">
      {/* HUD */}
      <div
        style={{
          position: "fixed",
          left: 12,
          top: 12,
          zIndex: 1000,
          display: "flex",
          gap: 8,
        }}
      >
        <button
          onClick={requestGyro}
          className="px-3 py-2 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 text-sm"
        >
          Enable Gyro
        </button>
        <button
          onClick={recenter}
          className="px-3 py-2 rounded-2xl bg-white/10 border border-white/20 text-sm"
        >
          Recenter
        </button>
        <div className="text-xs opacity-80 px-2 py-1 rounded bg-white/5 border border-white/10">
          {hud} • {debugText}
        </div>
      </div>

      {/* Canvas mount */}
      <div
        ref={mountRef}
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 0,
        }}
      />

      {/* Joystick */}
      <div
        className="absolute z-20 left-4 bottom-4 w-40 h-40 touch-none"
        onPointerDown={onJoyStart}
        onPointerMove={onJoyMove}
        onPointerUp={onJoyEnd}
        onPointerCancel={onJoyEnd}
        onPointerLeave={onJoyEnd}
      >
        <div className="absolute inset-0 rounded-full border border-white/20 bg-white/5" />
        {joyActive && joyPos && (
          <div
            className="absolute w-14 h-14 rounded-full border border-white/50 bg-white/30 -translate-x-1/2 -translate-y-1/2"
            style={{ left: joyPos.x, top: joyPos.y }}
          />
        )}
      </div>
    </div>
  );
}
