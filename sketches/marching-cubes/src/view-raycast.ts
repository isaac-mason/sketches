import * as THREE from "three/webgpu";
import type { Engine } from "./engine";
import type { RendererState } from "./renderer";
import type { VoxelsState } from "./voxels-state";

export const initViewRaycast = (engine: Engine) => {
  const viewRaycast = new engine.RaycastResult();
  
  return {
    viewRaycast,
  };
};

export type ViewRaycastState = ReturnType<typeof initViewRaycast>;

const _direction = new THREE.Vector3();

export const updateViewRaycast = (
  state: ViewRaycastState,
  renderer: RendererState,
  voxels: VoxelsState,
  engine: Engine
) => {
  const { camera } = renderer;
  const { viewRaycast } = state;
  
  camera.getWorldDirection(_direction);
  
  engine.raycastVoxels(
    viewRaycast,
    voxels.world,
    camera.position.x,
    camera.position.y,
    camera.position.z,
    _direction.x,
    _direction.y,
    _direction.z,
    100
  );
};
