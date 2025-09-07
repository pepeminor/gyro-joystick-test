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
  const joyPointerId = useRef<number | null>(null); // ✅ giữ pointer joystick riêng

  // Camera drag (multi-touch safe)
  const camPointerId = useRef<number | null>(null); // ✅ giữ pointer drag camera riêng
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

  // ===== Khóa scroll trang khi đang kéo joystick (iOS) =====
  useEffect(() => {
    if (!joyActive) return;
    const prev = {
      ob: document.body.style.overscrollBehavior,
      ts: document.documentElement.style.touchAction,
    };
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.touchAction = "none";

    const noScroll = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", noScroll, { passive: false });

    return () => {
      document.body.style.overscrollBehavior = prev.ob;
      document.documentElement.style.touchAction = prev.ts;
      document.removeEventListener("touchmove", noScroll);
    };
  }, [joyActive]);

  // ====== THREE ======
  useEffect(() => {
    if (!mountRef.current) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x0d0f13, 1);
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.userSelect = "none";
    (renderer.domElement.style as any).webkitUserSelect = "none";
    renderer.domElement.style.setProperty("-webkit-touch-callout", "none");
    mountRef.current.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Camera
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

    // Player
    const player = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.2, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xff2d2d, metalness: 0.1, roughness: 0.5 })
    );
    player.position.set(0, 0.6, 0);
    scene.add(player);

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

    // ====== Third-person camera follow + smooth look ======
    const camState = {
      yaw: 0,
      pitch: -0.12,
      distance: 5.5,
      target: new THREE.Vector3(),
      curPos: new THREE.Vector3(),
      desiredYaw: 0,
      desiredPitch: -0.12,
    };

    const LOOK_SENS = 0.0032;   // độ nhạy
    const LOOK_LERP = 18;       // lớn -> bám nhanh, nhỏ -> mượt hơn
    const PITCH_MIN = -Math.PI / 2 + 0.05;
    const PITCH_MAX = 0.6;

    // === Drag camera: MULTI-TOUCH SAFE (một pointer duy nhất điều khiển camera) ===
    const onPointerDown = (e: PointerEvent) => {
      const targetEl = e.target as HTMLElement;
      if (targetEl.closest("#joystick")) return; // joystick có pointer riêng

      // nếu chưa có camera pointer, nhận thằng đầu tiên
      if (camPointerId.current === null) {
        e.preventDefault();
        camPointerId.current = e.pointerId;
        lastDrag.current = { x: e.clientX, y: e.clientY };
        targetEl.setPointerCapture?.(e.pointerId);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      // chỉ xử lý move của pointer đang giữ camera
      if (camPointerId.current !== e.pointerId || !lastDrag.current) return;
      e.preventDefault();

      const dx = e.clientX - lastDrag.current.x;
      const dy = e.clientY - lastDrag.current.y;
      lastDrag.current = { x: e.clientX, y: e.clientY };

      // cập nhật "mục tiêu" (không áp trực tiếp)
      camState.desiredYaw   -= dx * LOOK_SENS;
      camState.desiredPitch -= dy * LOOK_SENS;
      camState.desiredPitch  = Math.max(PITCH_MIN, Math.min(PITCH_MAX, camState.desiredPitch));
    };

    const releaseCamPointer = () => {
      camPointerId.current = null;
      lastDrag.current = null;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (camPointerId.current === e.pointerId) releaseCamPointer();
    };
    const onPointerCancel = (e: PointerEvent) => {
      if (camPointerId.current === e.pointerId) releaseCamPointer();
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown as any, { passive: false });
    window.addEventListener("pointermove", onPointerMove as any, { passive: false });
    window.addEventListener("pointerup", onPointerUp as any, { passive: false });
    window.addEventListener("pointercancel", onPointerCancel as any, { passive: false });

    // Resize
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // Movement
    const up = new THREE.Vector3(0, 1, 0);
    const vel = new THREE.Vector3();
    const moveDir = new THREE.Vector3();
    const accel = 18;
    const deaccel = 14;
    const maxSpeed = 5.5;

    // Main loop
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // ===== Smooth look: tiến dần tới desiredYaw/Pitch theo exponential smoothing
      const k = 1 - Math.exp(-LOOK_LERP * dt); // 0..1
      camState.yaw   += (camState.desiredYaw   - camState.yaw)   * k;
      camState.pitch += (camState.desiredPitch - camState.pitch) * k;

      // camera target & desired pos
      camState.target.copy(player.position).add(new THREE.Vector3(0, 0.9, 0));
      const off = new THREE.Vector3(
        Math.sin(camState.yaw) * Math.cos(camState.pitch),
        Math.sin(camState.pitch),
        Math.cos(camState.yaw) * Math.cos(camState.pitch)
      ).multiplyScalar(-camState.distance);
      const desired = new THREE.Vector3().copy(camState.target).add(off);

      // hướng theo camera
      const camForward = new THREE.Vector3(-off.x, 0, -off.z).normalize();
      const camRight   = new THREE.Vector3().crossVectors(camForward, up).normalize();

      // input from joystick + WASD
      const joyX = joyVec.current.x;
      const joyY = joyVec.current.y;
      let iX = joyX, iY = joyY;
      if (keys.current["w"]) iY += 1;
      if (keys.current["s"]) iY -= 1;
      if (keys.current["a"]) iX -= 1;
      if (keys.current["d"]) iX += 1;
      const input = new THREE.Vector2(iX, iY);
      if (input.lengthSq() > 1) input.normalize();

      moveDir.set(0, 0, 0)
        .addScaledVector(camForward, input.y)
        .addScaledVector(camRight,   input.x);

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

      player.position.addScaledVector(vel, dt);

      const spd = vel.length();
      if (spd > 0.1) {
        const targetYaw = Math.atan2(vel.x, vel.z);
        const curYaw = player.rotation.y;
        let d = targetYaw - curYaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        player.rotation.y += d * Math.min(1, dt * 8);
      }

      // lerp camera position
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
      renderer.domElement.removeEventListener("pointerdown", onPointerDown as any);
      window.removeEventListener("pointermove", onPointerMove as any);
      window.removeEventListener("pointerup", onPointerUp as any);
      window.removeEventListener("pointercancel", onPointerCancel as any);
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // ====== JOYSTICK HANDLERS (multi-touch safe) ======
  const onJoyStart = (e: React.PointerEvent) => {
    e.preventDefault();
    // chỉ nhận nếu chưa có pointer joystick
    if (joyPointerId.current !== null && joyPointerId.current !== e.pointerId) return;
    joyPointerId.current = e.pointerId;

    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    joyOrigin.current = { x, y };
    setJoyActive(true);
    setJoyKnob({ x, y });
    el.setPointerCapture?.(e.pointerId);
  };

  const onJoyMove = (e: React.PointerEvent) => {
    e.preventDefault();
    if (joyPointerId.current !== e.pointerId || !joyOrigin.current) return;
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

    const nx = clamped.x / JOY_RADIUS;
    const ny = -clamped.y / JOY_RADIUS;
    const mag = Math.hypot(nx, ny);

    if (mag < JOY_DEADZONE / JOY_RADIUS) {
      joyVec.current.set(0, 0);
    } else {
      joyVec.current.set(nx, ny);
    }
  };

  const onJoyEnd = (e: React.PointerEvent) => {
    if (joyPointerId.current !== e.pointerId) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    joyPointerId.current = null;
    joyOrigin.current = null;
    setJoyActive(false);
    setJoyKnob(null);
    joyVec.current.set(0, 0);
  };

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
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        touchAction: "none",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Canvas */}
      <div ref={mountRef} style={{ position: "absolute", inset: 0, touchAction: "none" }} />

      {/* HUD (không nhận pointer để khỏi highlight) */}
      <div style={{
        position: "fixed", left: 12, top: 12, zIndex: 20,
        padding: "6px 10px", borderRadius: 10, background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.15)", fontSize: 12,
        pointerEvents: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}>
        Drag to rotate camera • Joystick to move
      </div>

      {/* ====== JOYSTICK UI ====== */}
      <div
        id="joystick"
        onPointerDown={(e) => { e.preventDefault(); onJoyStart(e); }}
        onPointerMove={(e) => { e.preventDefault(); onJoyMove(e); }}
        onPointerUp={onJoyEnd}
        onPointerCancel={onJoyEnd}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: `calc(12vh + ${safeBottom} + 8px)`,
          width: JOY_RADIUS * 2 + 16,
          height: JOY_RADIUS * 2 + 16,
          zIndex: 30,
          touchAction: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
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
          touchAction: "none",
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
            touchAction: "none",
          }} />
        )}
        {/* dot center */}
        {!joyActive && (
          <div style={{
            position: "absolute",
            left: "50%", top: "50%",
            transform: "translate(-50%,-50%)",
            width: 8, height: 8, borderRadius: 999,
            background: "rgba(255,255,255,.5)",
            touchAction: "none",
          }} />
        )}
      </div>
    </div>
  );
}
