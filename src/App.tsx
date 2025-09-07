import { useEffect, useRef } from "react";
import * as THREE from "three";

import { createLookController, type CamState } from "./controls/createLookController";

import { useJoystick } from "./hooks/useJoystick";
import { useKeys } from "./hooks/useKeys";
import { useScrollLock } from "./hooks/useScrollLock";
import { ACCEL, DEACCEL, LOOK_LERP, MAX_SPEED, SAFE_BOTTOM, UP } from "./constant";
import { createScene } from "./three/createScene";


export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Hooks
  const { joyActive, joyKnob, joyVec, joyHandlers } = useJoystick();
  const keys = useKeys();
  useScrollLock(joyActive);

  useEffect(() => {
    if (!mountRef.current) return;

    // ===== Three scene =====
    const { renderer, scene, camera, player, cleanup } = createScene(mountRef.current);

    // ===== Camera state + controller (multi-touch safe) =====
    const camState: CamState = {
      yaw: 0,
      pitch: -0.12,
      distance: 5.5,
      target: new THREE.Vector3(),
      curPos: new THREE.Vector3(),
      desiredYaw: 0,
      desiredPitch: -0.12,
    };

    const destroyLook = createLookController(
      renderer.domElement,
      camState,
      (t) => !!(t as HTMLElement | null)?.closest?.("#joystick")
    );

    // Resize
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // Movement state
    const vel = new THREE.Vector3();
    const moveDir = new THREE.Vector3();

    // Loop
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Smooth look (exponential)
      const k = 1 - Math.exp(-LOOK_LERP * dt);
      camState.yaw   += (camState.desiredYaw   - camState.yaw)   * k;
      camState.pitch += (camState.desiredPitch - camState.pitch) * k;

      // camera follow calc
      camState.target.copy(player.position).add(new THREE.Vector3(0, 0.9, 0));
      const off = new THREE.Vector3(
        Math.sin(camState.yaw) * Math.cos(camState.pitch),
        Math.sin(camState.pitch),
        Math.cos(camState.yaw) * Math.cos(camState.pitch)
      ).multiplyScalar(-camState.distance);
      const desired = new THREE.Vector3().copy(camState.target).add(off);

      // hướng theo camera
      const camForward = new THREE.Vector3(-off.x, 0, -off.z).normalize();
      const camRight   = new THREE.Vector3().crossVectors(camForward, UP).normalize();

      // input joystick + WASD
      let iX = joyVec.current.x;
      let iY = joyVec.current.y;
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
        vel.addScaledVector(moveDir, ACCEL * dt);
      } else {
        const sp = vel.length();
        if (sp > 0) {
          const dec = Math.max(sp - DEACCEL * dt, 0);
          vel.setLength(dec);
        }
      }
      if (vel.length() > MAX_SPEED) vel.setLength(MAX_SPEED);

      // update player
      player.position.addScaledVector(vel, dt);
      const spd = vel.length();
      if (spd > 0.1) {
        const targetYaw = Math.atan2(vel.x, vel.z);
        const curYaw = player.rotation.y;
        let d = targetYaw - curYaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        player.rotation.y += d * Math.min(1, dt * 8);
      }

      // camera pos lerp
      camState.curPos.lerp(desired, 1 - Math.exp(-dt * 10));
      camera.position.copy(camState.curPos);
      camera.lookAt(camState.target);

      // fun rotation
      player.rotation.x += 0.2 * dt;

      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    };
    tick();

    return () => {
      window.removeEventListener("resize", onResize);
      destroyLook();
      cleanup();
    };
  }, [joyVec, keys]);

  // UI styles
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
      {/* Canvas mount */}
      <div ref={mountRef} style={{ position: "absolute", inset: 0, touchAction: "none" }} />

      {/* HUD (không bắt pointer để khỏi highlight) */}
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

      {/* JOYSTICK */}
      <div
        id="joystick"
        data-joystick
        onPointerDown={joyHandlers.onPointerDown}
        onPointerMove={joyHandlers.onPointerMove}
        onPointerUp={joyHandlers.onPointerUp}
        onPointerCancel={joyHandlers.onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: `calc(12vh + ${SAFE_BOTTOM} + 8px)`,
          width: 70 * 2 + 16,
          height: 70 * 2 + 16,
          zIndex: 30,
          touchAction: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        <div style={{
          position: "absolute", inset: 0, borderRadius: 999,
          background: "rgba(255,255,255,.06)",
          border: "1px solid rgba(255,255,255,.18)",
          boxShadow: "0 6px 30px rgba(0,0,0,.35)",
          touchAction: "none",
        }} />
        {joyKnob && (
          <div style={{
            position: "absolute",
            left: joyKnob.x, top: joyKnob.y,
            width: 56, height: 56, borderRadius: 999,
            transform: "translate(-50%,-50%)",
            background: "rgba(255,255,255,.25)",
            border: "1px solid rgba(255,255,255,.55)",
            backdropFilter: "blur(4px)",
            touchAction: "none",
          }} />
        )}
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
