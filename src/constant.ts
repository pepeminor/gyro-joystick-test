import * as THREE from "three";

export const JOY_RADIUS = 70;
export const JOY_DEADZONE = 6;

export const LOOK_SENS = 0.0032;         // nhạy xoay camera
export const LOOK_LERP = 18;             // inertia (cao = bám nhanh)
export const PITCH_MIN = -Math.PI / 2 + 0.05;
export const PITCH_MAX = 0.6;

export const ACCEL = 18;                 // m/s^2
export const DEACCEL = 14;               // m/s^2
export const MAX_SPEED = 5.5;

export const SAFE_BOTTOM = "env(safe-area-inset-bottom, 0px)";

export const UP = new THREE.Vector3(0, 1, 0);
