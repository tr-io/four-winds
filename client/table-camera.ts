import { PerspectiveCamera, Vector3 } from 'three';

/** Fit the whole table inside the canvas, whose CSS reserves space for the seat cards. */
export function tableFieldOfView(aspect: number) {
  const camera = new PerspectiveCamera(40, aspect, 0.1, 100);
  camera.position.set(0, 15, 12);
  camera.lookAt(0, 0, 0.7);
  camera.updateMatrixWorld();
  let extent = 0;
  for (const x of [-6.2, 6.2])
    for (const z of [-6.2, 6.2]) {
      const point = new Vector3(x, 0, z).project(camera);
      extent = Math.max(extent, Math.abs(point.x), Math.abs(point.y));
    }
  return (2 * Math.atan((Math.tan(Math.PI / 9) * extent) / 0.94) * 180) / Math.PI;
}
