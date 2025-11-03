import * as THREE from 'three/webgpu';
import type { Engine } from './engine';
import type { VoxelsState } from './voxels-state';
import { setVoxel } from './voxels-state';

export type BlockRaycast = {
    hit: boolean;
    x: number;
    y: number;
    z: number;
    normalX: number;
    normalY: number;
    normalZ: number;
}

export type ToolState = {
    blockIndicator: THREE.LineSegments;
    blockRaycast: BlockRaycast;
}

export const createBlockIndicator = (scene: THREE.Scene): THREE.LineSegments => {
    const boxGeometry = new THREE.BoxGeometry(1.02, 1.02, 1.02);
    const edges = new THREE.EdgesGeometry(boxGeometry);
    const blockIndicator = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff }));
    blockIndicator.visible = false;
    scene.add(blockIndicator);
    return blockIndicator;
};

export const createToolState = (scene: THREE.Scene): ToolState => {
    const blockIndicator = createBlockIndicator(scene);
    const blockRaycast: BlockRaycast = {
        hit: false,
        x: 0,
        y: 0,
        z: 0,
        normalX: 0,
        normalY: 0,
        normalZ: 0,
    };

    return {
        blockIndicator,
        blockRaycast,
    };
};

export const updateBlockIndicator = (state: ToolState, viewRaycast: any) => {
    const { blockIndicator, blockRaycast } = state;

    if (viewRaycast.hit) {
        blockRaycast.hit = true;
        blockRaycast.x = viewRaycast.voxelX;
        blockRaycast.y = viewRaycast.voxelY;
        blockRaycast.z = viewRaycast.voxelZ;
        blockRaycast.normalX = viewRaycast.normalX;
        blockRaycast.normalY = viewRaycast.normalY;
        blockRaycast.normalZ = viewRaycast.normalZ;

        // Update visual indicator
        blockIndicator.position.set(blockRaycast.x, blockRaycast.y, blockRaycast.z);
        blockIndicator.visible = true;
    } else {
        blockRaycast.hit = false;
        blockIndicator.visible = false;
    }
};

// Fixed color for placed blocks (red)
const BLOCK_COLOR = { r: 255, g: 64, b: 64 };

export const handleBlockTool = (state: ToolState, engine: Engine, voxels: VoxelsState, isBreak: boolean) => {
    if (!state.blockRaycast.hit) return;

    const { x, y, z, normalX, normalY, normalZ } = state.blockRaycast;

    if (isBreak) {
        // Break: remove the block at the raycast hit position
        setVoxel(engine, voxels, x, y, z, 0, 0, 0, 0);
    } else {
        // Build: place a block adjacent to the hit block, in the direction of the normal
        const placeX = x + Math.round(normalX);
        const placeY = y + Math.round(normalY);
        const placeZ = z + Math.round(normalZ);

        setVoxel(
            engine,
            voxels,
            placeX,
            placeY,
            placeZ,
            255, // full density
            BLOCK_COLOR.r,
            BLOCK_COLOR.g,
            BLOCK_COLOR.b,
        );
    }
};

const createCrosshair = (): HTMLElement => {
    const crosshair = document.createElement('div');
    crosshair.id = 'crosshair';
    crosshair.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        width: 8px;
        height: 8px;
        border: 2px solid rgba(255, 255, 255, 0.8);
        border-radius: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 1000;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
        transition: all 0.15s ease-out;
    `;
    return crosshair;
};

export const setupToolControls = (state: ToolState, engine: Engine, voxels: VoxelsState) => {
    const crosshair = createCrosshair();
    document.body.appendChild(crosshair);

    // Mouse controls for build/break
    const handleMouseDown = (e: MouseEvent) => {
        const isBreak = e.button === 0; // Left click = break
        const isBuild = e.button === 2; // Right click = build

        if (isBuild || isBreak) {
            handleBlockTool(state, engine, voxels, isBreak);
        }
    };

    // Prevent context menu on right click
    const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('contextmenu', handleContextMenu);

    return {
        dispose: () => {
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('contextmenu', handleContextMenu);
            crosshair.remove();
        },
    };
};
