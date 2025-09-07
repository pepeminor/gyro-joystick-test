import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // ====== JOYSTICK ======
  const JOY_RADIUS = 70;
  const JOY_DEADZONE = 6;
  const [joyActive, setJoyActive] = useState(false);
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number } | null>(null);
  const joyOrigin = useRef<{ x: number; y: number } | null>(null);
  const joyVec = useRef(new THREE.Vector2(0, 0)); // [-1..1]

  // Mouse drag để xoay camera
  const isDraggingView = useRef(false);
  const lastDrag = useRef<{ x: number; y: number } | null>(null);

  // WASD fallback (desktop)
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const down = (e: KeyboardEvent) => (keys.current[e.key.toLowerCase()] = true);
    const up = (e: KeyboardEvent) => (keys.current[e.key.toLowerCase()] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ====== THREE ======
  useEffect(() => {
    if (!mountRef.current) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x0d0f13, 1);
    mountRef.current.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Camera & Controls (tự điều khiển thủ công)
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

    // Cube (player)
    const player = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.2, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xff2d2d, metalness: 0.1, roughness: 0.5 })
    );
    player.position.set(0, 0.6, 0);
    scene.add(player);

    // Vật thể rải rác cho vui eye-tracking
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

    // ====== Third-person camera follow ======
    const camState = {
      yaw: 0,            // quanh trục Y
      pitch: -0.12,      // hơi cúi
      distance: 5.5,     // khoảng cách với player
      target: new THREE.Vector3(),
      curPos: new THREE.Vector3(),
    };

    // Drag để xoay camera
    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("#joystick")) return; // không ăn drag khi chạm joystick
      isDraggingView.current = true;
      lastDrag.current = { x: e.clientX, y: e.clientY };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingView.current || !lastDrag.current) return;
      const dx = e.clientX - lastDrag.current.x;
      const dy = e.clientY - lastDrag.current.y;
      lastDrag.current = { x: e.clientX, y: e.clientY };
      camState.yaw   -= dx * 0.0032;
      camState.pitch -= dy * 0.0022;
      camState.pitch  = Math.max(-Math.PI / 2 + 0.05, Math.min(0.6, camState.pitch));
    };
    const onPointerUp = () => {
      isDraggingView.current = false;
      lastDrag.current = null;
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    // Resize
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // Movement params
    const up = new THREE.Vector3(0, 1, 0);
    const vel = new THREE.Vector3();
    const moveDir = new THREE.Vector3();
    const accel = 18;   // m/s^2
    const deaccel = 14; // m/s^2
    const maxSpeed = 5.5;

    // Main loop
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // ===== Camera follow target & vị trí mong muốn =====
      camState.target.copy(player.position).add(new THREE.Vector3(0, 0.9, 0));
      const off = new THREE.Vector3(
        Math.sin(camState.yaw) * Math.cos(camState.pitch),
        Math.sin(camState.pitch),
        Math.cos(camState.yaw) * Math.cos(camState.pitch)
      ).multiplyScalar(-camState.distance);
      const desired = new THREE.Vector3().copy(camState.target).add(off);

      // ===== HƯỚNG CHUẨN THEO CAMERA (sửa hướng di chuyển) =====
      // forward trên mặt đất = hướng camera nhìn (project y=0)
      const camForward = new THREE.Vector3(-off.x, 0, -off.z).normalize();
      const camRight   = new THREE.Vector3().crossVectors(camForward, up).normalize();

      // build input từ joystick + WASD
      const joyX = joyVec.current.x;
      const joyY = joyVec.current.y;
      let iX = joyX, iY = joyY;
      if (keys.current["w"]) iY += 1;
      if (keys.current["s"]) iY -= 1;
      if (keys.current["a"]) iX -= 1;
      if (keys.current["d"]) iX += 1;
      const input = new THREE.Vector2(iX, iY);
      if (input.lengthSq() > 1) input.normalize();

      // Hướng move = forward * input.y + right * input.x
      moveDir.set(0, 0, 0)
        .addScaledVector(camForward, input.y)
        .addScaledVector(camRight,   input.x);

      // tăng/giảm tốc
      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        vel.addScaledVector(moveDir, accel * dt);
      } else {
        const sp = vel.length();
        if (sp > 0) {
          const dec = Math.max(sp - deaccel * dt, 0);
          vel.setLength(dec);
        }
      }
      if (vel.length() > maxSpeed) vel.setLength(maxSpeed);

      // update player position
      player.position.addScaledVector(vel, dt);

      // xoay player theo hướng di chuyển (mượt)
      const spd = vel.length();
      if (spd > 0.1) {
        const targetYaw = Math.atan2(vel.x, vel.z);
        const curYaw = player.rotation.y;
        let d = targetYaw - curYaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        player.rotation.y += d * Math.min(1, dt * 8);
      }

      // lerp camera mượt
      camState.curPos.lerp(desired, 1 - Math.exp(-dt * 10));
      camera.position.copy(camState.curPos);
      camera.lookAt(camState.target);

      // hiệu ứng quay cube
      player.rotation.x += 0.2 * dt;

      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    };
    tick();

    return () => {
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // ====== JOYSTICK HANDLERS ======
  const onJoyStart = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    joyOrigin.current = { x, y };
    setJoyActive(true);
    setJoyKnob({ x, y });
    el.setPointerCapture(e.pointerId);
  };

  const onJoyMove = (e: React.PointerEvent) => {
    if (!joyOrigin.current) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - joyOrigin.current.x;
    const dy = y - joyOrigin.current.y;

    const v = new THREE.Vector2(dx, dy);
    const len = v.length();
    const clamped = v.clone();
    if (len > JOY_RADIUS) clamped.setLength(JOY_RADIUS);

    setJoyKnob({
      x: joyOrigin.current.x + clamped.x,
      y: joyOrigin.current.y + clamped.y,
    });

    // chuẩn hóa [-1..1], Y ngược lại (kéo lên = tiến tới)
    const nx = clamped.x / JOY_RADIUS;
    const ny = -clamped.y / JOY_RADIUS;
    const mag = Math.sqrt(nx * nx + ny * ny);

    if (mag < JOY_DEADZONE / JOY_RADIUS) {
      joyVec.current.set(0, 0);
    } else {
      joyVec.current.set(nx, ny);
    }
  };

  const onJoyEnd = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    joyOrigin.current = null;
    setJoyActive(false);
    setJoyKnob(null);
    joyVec.current.set(0, 0);
  };

  // helper CSS safe-area bottom
  const safeBottom = "env(safe-area-inset-bottom, 0px)";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "#000",
        color: "#fff",
        userSelect: "none",
      }}
    >
      {/* Canvas mount */}
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />

      {/* HUD nhỏ */}
      <div style={{
        position: "fixed", left: 12, top: 12, zIndex: 20,
        padding: "6px 10px", borderRadius: 10, background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.15)", fontSize: 12
      }}>
        Drag để xoay camera • Joystick để di chuyển • WASD cũng được
      </div>

      {/* ====== JOYSTICK UI (center ngang, cách đáy ~30% viewport + safe-area) ====== */}
      <div
        id="joystick"
        onPointerDown={onJoyStart}
        onPointerMove={onJoyMove}
        onPointerUp={onJoyEnd}
        onPointerCancel={onJoyEnd}
        onPointerLeave={onJoyEnd}
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: `calc(12vh + ${safeBottom} + 8px)`,
          width: JOY_RADIUS * 2 + 16,
          height: JOY_RADIUS * 2 + 16,
          zIndex: 30,
          touchAction: "none",
        }}
      >
        {/* vòng ngoài */}
        <div style={{
          position: "absolute",
          inset: 0,
          borderRadius: 999,
          background: "rgba(255,255,255,.06)",
          border: "1px solid rgba(255,255,255,.18)",
          boxShadow: "0 6px 30px rgba(0,0,0,.35)",
        }} />
        {/* knob */}
        {joyKnob && (
          <div style={{
            position: "absolute",
            left: joyKnob.x,
            top: joyKnob.y,
            width: 56, height: 56,
            borderRadius: 999,
            transform: "translate(-50%,-50%)",
            background: "rgba(255,255,255,.25)",
            border: "1px solid rgba(255,255,255,.55)",
            backdropFilter: "blur(4px)",
          }} />
        )}
        {/* dot center */}
        {!joyActive && (
          <div style={{
            position: "absolute",
            left: "50%", top: "50%",
            transform: "translate(-50%,-50%)",
            width: 8, height: 8, borderRadius: 999,
            background: "rgba(255,255,255,.5)"
          }} />
        )}
      </div>
    </div>
  );
}
