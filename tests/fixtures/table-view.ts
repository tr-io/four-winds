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

/** Keep the WebGL pixels available so camera tests compare the board without DOM clocks/overlays. */
export async function preserveTableFrames(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext as (
      type: string,
      options?: unknown,
    ) => RenderingContext | null;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      options?: WebGLContextAttributes,
    ) {
      return original.call(
        this,
        type,
        type === 'webgl2' ? { ...options, preserveDrawingBuffer: true } : options,
      );
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}
export async function tableFrame(page: Page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  return page.locator('#live-table canvas').evaluate((el) => (el as HTMLCanvasElement).toDataURL());
}
