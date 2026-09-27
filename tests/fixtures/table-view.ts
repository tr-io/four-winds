import type { Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { tableFieldOfView } from '../../client/table-camera';

// Project actual tile centers to pointer coordinates; raycast tooltips verify a visible face exists.
export async function tableProjection(page: Page) {
  const rect = (await page.locator('#live-table canvas').boundingBox())!;
  const aspect = rect.width / rect.height;
  const camera = new PerspectiveCamera(tableFieldOfView(aspect), aspect, 0.1, 100);
  camera.position.set(0, 15, 12);
  camera.lookAt(0, 0, 0.7);
  camera.updateMatrixWorld();
  return (x: number, z: number) => {
    const v = new Vector3(x, 0.178, z).project(camera);
    return { x: rect.x + ((v.x + 1) / 2) * rect.width, y: rect.y + ((1 - v.y) / 2) * rect.height };
  };
}
