import * as THREE from 'three/webgpu';

const BATCHED_MESH_INITIAL_INSTANCE_COUNT = 10_000;
const BATCHED_MESH_INITIAL_VERTEX_COUNT = 20_000_000;
const BATCHED_MESH_INITIAL_INDEX_COUNT = 20_000_000;
const BATCHED_MESH_INSTANCE_COUNT_INCREMENT = 10_000;
const BATCHED_MESH_VERTEX_COUNT_INCREMENT = 1_000_000;
const BATCHED_MESH_INDEX_COUNT_INCREMENT = 1_000_000;

type ChunkState = {
    version: number | undefined;
    instanceId: number | undefined;
    geometryId: number | undefined;
};

export const initVoxelRenderer = () => {
    // chunk state
    const dirtyChunks = new Set<string>();
    const chunks = new Map<string, ChunkState>();

    // chunk material
    const chunkMaterial = new THREE.MeshPhongNodeMaterial({
        vertexColors: true,
        side: THREE.FrontSide,
    });

    // batched mesh
    const batchedMesh = new THREE.BatchedMesh(
        BATCHED_MESH_INITIAL_INSTANCE_COUNT,
        BATCHED_MESH_INITIAL_VERTEX_COUNT,
        BATCHED_MESH_INITIAL_INDEX_COUNT,
        chunkMaterial,
    );
    batchedMesh.frustumCulled = false;
    batchedMesh.perObjectFrustumCulled = true;

    return {
        dirtyChunks,
        chunks,
        chunkMaterial,
        batchedMesh,
        batchedMeshMaxVertices: BATCHED_MESH_INITIAL_VERTEX_COUNT,
        batchedMeshMaxIndices: BATCHED_MESH_INITIAL_INDEX_COUNT,
        batchedMeshMaxInstances: BATCHED_MESH_INITIAL_INSTANCE_COUNT,
    };
};

export type VoxelRendererState = ReturnType<typeof initVoxelRenderer>;

export const disposeVoxelRenderer = (state: VoxelRendererState) => {
    state.chunkMaterial.dispose();
    state.batchedMesh.removeFromParent();
    state.batchedMesh.dispose();
};

const _matrix4 = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);

type ChunkData = {
    cx: number;
    cy: number;
    cz: number;
    chunk: any;
    chunkSize: number;
};

const getChunkKey = (cx: number, cy: number, cz: number): string => {
    return `${cx},${cy},${cz}`;
};

const getChunkDistance = (cx: number, cy: number, cz: number, chunkSize: number, cameraPos: THREE.Vector3): number => {
    const centerX = (cx + 0.5) * chunkSize;
    const centerY = (cy + 0.5) * chunkSize;
    const centerZ = (cz + 0.5) * chunkSize;
    const dx = centerX - cameraPos.x;
    const dy = centerY - cameraPos.y;
    const dz = centerZ - cameraPos.z;
    return dx * dx + dy * dy + dz * dz;
};

const MESHES_PER_FRAME = 3;

export const updateVoxelRenderer = (
    rendererState: VoxelRendererState,
    Voxels: any,
    world: any,
    chunkGeom: any,
    chunks: Array<{ cx: number; cy: number; cz: number; chunk: any }>,
    CHUNK_SIZE: number,
    scene: THREE.Scene,
    camera: THREE.Camera,
) => {
    // Convert chunks to ChunkData format
    const chunkData: ChunkData[] = chunks.map(({ cx, cy, cz, chunk }) => ({
        cx,
        cy,
        cz,
        chunk,
        chunkSize: CHUNK_SIZE,
    }));

    const state = rendererState;
    // update dirty chunks set
    for (const chunk of chunkData) {
        const key = getChunkKey(chunk.cx, chunk.cy, chunk.cz);
        const chunkState = state.chunks.get(key);

        if (!chunkState || Voxels.isChunkDirty(chunk.chunk)) {
            state.dirtyChunks.add(key);
        }
    }

    // sort dirty chunks by distance (closer chunks first)
    const chunkDataMap = new Map<string, ChunkData>();
    for (const chunk of chunkData) {
        const key = getChunkKey(chunk.cx, chunk.cy, chunk.cz);
        chunkDataMap.set(key, chunk);
    }

    const cameraPos = camera.position;
    const sortedDirtyChunks = Array.from(state.dirtyChunks).sort((a, b) => {
        const chunkA = chunkDataMap.get(a);
        const chunkB = chunkDataMap.get(b);

        if (!chunkA && !chunkB) return 0;
        if (!chunkA) return 1;
        if (!chunkB) return -1;

        const distA = getChunkDistance(chunkA.cx, chunkA.cy, chunkA.cz, chunkA.chunkSize, cameraPos);
        const distB = getChunkDistance(chunkB.cx, chunkB.cy, chunkB.cz, chunkB.chunkSize, cameraPos);

        return distA - distB;
    });

    // build chunks
    let built = 0;

    for (const key of sortedDirtyChunks) {
        const chunkData = chunkDataMap.get(key);
        if (!chunkData) continue;

        // get chunk state
        let chunkState = state.chunks.get(key);

        if (!chunkState) {
            // create new chunk state
            chunkState = {
                version: undefined,
                instanceId: undefined,
                geometryId: undefined,
            };
            state.chunks.set(key, chunkState);
        } else {
            // clear old chunk state
            if (chunkState.instanceId !== undefined) {
                state.batchedMesh.deleteInstance(chunkState.instanceId);
            }
            chunkState.instanceId = undefined;

            if (chunkState.geometryId !== undefined) {
                state.batchedMesh.deleteGeometry(chunkState.geometryId);
            }
            chunkState.geometryId = undefined;
        }

        // mesh chunk
        Voxels.mesh(world, chunkData.chunk, chunkGeom);

        const posView: Float32Array = Voxels.chunkGeometryPositions(chunkGeom);
        const norView: Float32Array = Voxels.chunkGeometryNormals(chunkGeom);
        const colView: Float32Array = Voxels.chunkGeometryColors(chunkGeom);

        if (posView.length > 0) {
            const meshResult = {
                positions: new Float32Array(posView.slice(0, chunkGeom.positionsCount)),
                normals: new Float32Array(norView.slice(0, chunkGeom.normalsCount)),
                colors: new Float32Array(colView.slice(0, chunkGeom.colorsCount)),
            };
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(meshResult.positions, 3));
            geometry.setAttribute('normal', new THREE.BufferAttribute(meshResult.normals, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(meshResult.colors, 3));

            // add geometry, resizing batched mesh if necessary
            let geometryId: number | undefined;
            try {
                geometryId = state.batchedMesh.addGeometry(geometry);
            } catch (e) {
                state.batchedMeshMaxVertices += BATCHED_MESH_VERTEX_COUNT_INCREMENT;
                state.batchedMeshMaxIndices += BATCHED_MESH_INDEX_COUNT_INCREMENT;
                state.batchedMesh.setGeometrySize(state.batchedMeshMaxVertices, state.batchedMeshMaxIndices);
                console.log('resize voxels batched mesh vertices and indices', {
                    vertices: state.batchedMeshMaxVertices,
                    indices: state.batchedMeshMaxIndices,
                });

                geometryId = state.batchedMesh.addGeometry(geometry);
            }

            // add instance, resizing batched mesh instance structures if necessary
            let instanceId: number | undefined;
            try {
                instanceId = state.batchedMesh.addInstance(geometryId);
            } catch (_e) {
                state.batchedMeshMaxInstances += BATCHED_MESH_INSTANCE_COUNT_INCREMENT;
                state.batchedMesh.setInstanceCount(state.batchedMeshMaxInstances);
                console.log('resize voxels batched mesh instances');

                instanceId = state.batchedMesh.addInstance(geometryId);
            }

            _position.set(
                chunkData.cx * chunkData.chunkSize,
                chunkData.cy * chunkData.chunkSize,
                chunkData.cz * chunkData.chunkSize,
            );
            _matrix4.compose(_position, _quaternion.set(0, 0, 0, 1), _scale);
            state.batchedMesh.setMatrixAt(instanceId, _matrix4);

            chunkState.geometryId = geometryId;
            chunkState.instanceId = instanceId;

            // increment number of built chunks
            built++;
        }

        state.dirtyChunks.delete(key);
        Voxels.clearChunkDirty(chunkData.chunk);

        if (built >= MESHES_PER_FRAME) {
            break;
        }
    }

    if (state.batchedMesh.instanceCount > 0) {
        scene.add(state.batchedMesh);
    } else {
        state.batchedMesh.removeFromParent();
    }
};
