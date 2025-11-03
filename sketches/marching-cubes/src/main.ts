import EngineModule from './engine';
import { initFlyControls } from './fly-controls';
import { initRenderer, updateRenderer } from './renderer';
import { createToolState, setupToolControls, updateBlockIndicator } from './tools';
import { initViewRaycast, updateViewRaycast } from './view-raycast';
import { initVoxelRenderer, updateVoxelRenderer } from './voxel-renderer';
import { initVoxels, updateVoxels, generateChunks } from './voxels-state';

const init = async () => {
    const engine = await EngineModule();

    const voxels = await initVoxels(engine);

    const renderer = await initRenderer();

    const voxelRenderer = initVoxelRenderer();
    renderer.scene.add(voxelRenderer.batchedMesh);

    const flyControls = initFlyControls(renderer.renderer, renderer.camera);

    const tools = createToolState(renderer.scene);

    setupToolControls(tools, engine, voxels);

    const viewRaycast = initViewRaycast(engine);

    renderer.camera.position.set(54, 100, 160);

    return {
        engine,
        renderer,
        voxels,
        voxelRenderer,
        flyControls,
        tools,
        viewRaycast,
        prevUpdateTime: performance.now(),
    };
};

type State = ReturnType<typeof init> extends Promise<infer T> ? T : never;

export const update = (state: State, dt: number) => {
    state.flyControls.update(dt);

    updateViewRaycast(state.viewRaycast, state.renderer, state.voxels, state.engine);

    updateBlockIndicator(state.tools, state.viewRaycast.viewRaycast);

    generateChunks(state.voxels, state.engine, state.renderer.camera.position);

    updateVoxels(state.voxels, dt);

    updateVoxelRenderer(
        state.voxelRenderer,
        state.engine,
        state.voxels.world,
        state.voxels.chunkGeom,
        state.voxels.chunks,
        state.voxels.CHUNK_SIZE,
        state.renderer.scene,
        state.renderer.camera,
    );

    updateRenderer(state.renderer);
};

const main = async () => {
    const state = await init();

    const loop = () => {
        requestAnimationFrame(loop);
        const now = performance.now();
        const dt = (now - state.prevUpdateTime) / 1000; // Convert to seconds
        state.prevUpdateTime = now;
        update(state, dt);
    };

    loop();
};

main();
