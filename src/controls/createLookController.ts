import * as THREE from "three";
import { LOOK_SENS, PITCH_MAX, PITCH_MIN } from "../constant";

export type CamState = {
  yaw: number;
  pitch: number;
  distance: number;
  target: THREE.Vector3;
  curPos: THREE.Vector3;
  desiredYaw: number;
  desiredPitch: number;
};

/** 
 * Multi-touch safe camera drag: 1 pointer riêng điều khiển camera.
 * Bỏ qua các event xảy ra bên trong vùng joystick (predicate).
 */
export function createLookController(
  dom: HTMLElement,
  camState: CamState,
  isInJoystick: (el: EventTarget | null) => boolean
) {
  let camPointerId: number | null = null;
  let last: { x: number; y: number } | null = null;

  const onDown = (e: PointerEvent) => {
    if (isInJoystick(e.target)) return;
    if (camPointerId !== null) return;
    e.preventDefault();
    camPointerId = e.pointerId;
    last = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: PointerEvent) => {
    if (camPointerId !== e.pointerId || !last) return;
    e.preventDefault();
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };

    camState.desiredYaw   -= dx * LOOK_SENS;
    camState.desiredPitch -= dy * LOOK_SENS;
    camState.desiredPitch  = Math.max(PITCH_MIN, Math.min(PITCH_MAX, camState.desiredPitch));
  };

  const release = () => {
    camPointerId = null;
    last = null;
  };
  const onUp = (e: PointerEvent) => { if (camPointerId === e.pointerId) release(); };
  const onCancel = (e: PointerEvent) => { if (camPointerId === e.pointerId) release(); };

  dom.addEventListener("pointerdown", onDown, { passive: false });
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp, { passive: false });
  window.addEventListener("pointercancel", onCancel, { passive: false });

  return () => {
    dom.removeEventListener("pointerdown", onDown as any);
    window.removeEventListener("pointermove", onMove as any);
    window.removeEventListener("pointerup", onUp as any);
    window.removeEventListener("pointercancel", onCancel as any);
  };
}
