import { useRef, useState } from "react";
import * as THREE from "three";
import { JOY_DEADZONE, JOY_RADIUS } from "../constant";

export type JoyKnob = { x: number; y: number } | null;

export function useJoystick() {
  const [joyActive, setJoyActive] = useState(false);
  const [joyKnob, setJoyKnob] = useState<JoyKnob>(null);

  const joyVec = useRef(new THREE.Vector2(0, 0)); // [-1..1]
  const joyOrigin = useRef<{ x: number; y: number } | null>(null);
  const joyPointerId = useRef<number | null>(null);

  const onDown: React.PointerEventHandler = (e) => {
    e.preventDefault();
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

  const onMove: React.PointerEventHandler = (e) => {
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

  const onUp: React.PointerEventHandler = (e) => {
    if (joyPointerId.current !== e.pointerId) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    joyPointerId.current = null;
    joyOrigin.current = null;
    setJoyActive(false);
    setJoyKnob(null);
    joyVec.current.set(0, 0);
  };

  return {
    joyActive,
    joyKnob,
    joyVec,            // ref<Vector2>
    joyHandlers: {
      onPointerDown: onDown,
      onPointerMove: onMove,
      onPointerUp: onUp,
      onPointerCancel: onUp,
    },
  };
}
