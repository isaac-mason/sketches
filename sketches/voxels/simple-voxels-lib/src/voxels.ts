import { Mesh, type Object3D, Vector3 } from 'three';
import * as BlockRegistry from './block-registry';
import { ChunkGeometry } from './chunk-geometry';
import { ChunkMaterial } from './chunk-material';
import * as CulledMesher from './culled-mesher';
import * as TextureAtlas from './texture-atlas';
import {
    Chunk,
    CHUNK_SIZE,
    World,
    worldPositionToChunkCoordinate,
    worldPositionToChunkPosition,
} from './world';

const _chunkCoordinate = new Vector3();
const _chunkPosition = new Vector3();

export class Voxels {
    world = new World();

    dirtyChunks = new Set<string>();

    assets: { [key: string]: HTMLImageElement } = {};

    blockRegistry: BlockRegistry.State;

    textureAtlasLayout?: TextureAtlas.Layout;
    textureAtlasCanvas?: TextureAtlas.Canvas;
    textureAtlasTexture?: TextureAtlas.Texture;

    chunkMeshes: Map<string, { mesh: Mesh; geometry: ChunkGeometry }> =
        new Map();

    private parent: Object3D;
    private textureSize: number;
    private chunkMaterial: ChunkMaterial;

    /**
     * @param parentObject3D object3D to add chunk meshes to
     * @param textureSize size of the texture atlas
     */
    constructor(parentObject3D: Object3D, textureSize: number) {
        this.parent = parentObject3D;
        this.textureSize = textureSize;
        this.blockRegistry = BlockRegistry.init();
        this.chunkMaterial = new ChunkMaterial();
    }

    setBlock(x: number, y: number, z: number, type: number) {
        this.world.setBlock(x, y, z, type);

        this.markBlockDirty(x, y, z);
    }

    /**
     * Register a new block type.
     * You must call `this.updateAtlas()` after this.
     */
    registerType(block: BlockRegistry.BlockInfo) {
        return BlockRegistry.add(this.blockRegistry, block);
    }

    /**
     * Call after adding blocks to the block registry
     */
    updateAtlas() {
        this.updateAtlasLayout();
        this.updateAtlasTexture();
    }

    /**
     * Update the layout of the texture atlas based on the current block registry
     * You must call this.updateAtlasTexture() after this
     */
    updateAtlasLayout() {
        const layout = TextureAtlas.createLayout(
            this.blockRegistry,
            this.textureSize,
        );
        this.textureAtlasLayout = layout;
    }

    /**
     * Call as this.assets updates, e.g. as images load to facilitate lazy loading.
     */
    updateAtlasTexture() {
        const prevTexture = this.textureAtlasTexture;

        const canvas = TextureAtlas.createCanvas(
            this.textureAtlasLayout!,
            this.assets,
        );
        this.textureAtlasCanvas = canvas;

        const texture = TextureAtlas.createTexture(canvas);
        this.textureAtlasTexture = texture;

        this.chunkMaterial.updateTexture(texture);

        prevTexture?.dispose();
    }

    /**
     * Call after changing a block, with `World` directly. Calling `voxels.setType` will do this for you.
     */
    markBlockDirty(x: number, y: number, z: number) {
        const chunkCoordinate = worldPositionToChunkCoordinate(
            x,
            y,
            z,
            _chunkCoordinate,
        );
        const chunkId = Chunk.id(
            chunkCoordinate.x,
            chunkCoordinate.y,
            chunkCoordinate.z,
        );

        this.dirtyChunks.add(chunkId);

        const chunkPosition = worldPositionToChunkPosition(
            x,
            y,
            z,
            _chunkPosition,
        );

        if (chunkPosition.x === 0) {
            const id = Chunk.id(
                chunkCoordinate.x - 1,
                chunkCoordinate.y,
                chunkCoordinate.z,
            );
            if (this.world.chunks.has(id)) {
                this.dirtyChunks.add(id);
            }
        }
        if (chunkPosition.x === CHUNK_SIZE - 1) {
            const id = Chunk.id(
                chunkCoordinate.x + 1,
                chunkCoordinate.y,
                chunkCoordinate.z,
            );
            if (this.world.chunks.has(id)) {
                this.dirtyChunks.add(id);
            }
        }
        if (chunkPosition.y === 0) {
            const id = Chunk.id(
                chunkCoordinate.x,
                chunkCoordinate.y - 1,
                chunkCoordinate.z,
            );
            if (this.world.chunks.has(id)) {
                this.dirtyChunks.add(id);
            }
        }
        if (chunkPosition.y === CHUNK_SIZE - 1) {
            const id = Chunk.id(
                chunkCoordinate.x,
                chunkCoordinate.y + 1,
                chunkCoordinate.z,
            );
            if (this.world.chunks.has(id)) {
                this.dirtyChunks.add(id);
            }
        }
        if (chunkPosition.z === 0) {
            const id = Chunk.id(
                chunkCoordinate.x,
                chunkCoordinate.y,
                chunkCoordinate.z - 1,
            );
            if (this.world.chunks.has(id)) {
                this.dirtyChunks.add(id);
            }
        }
        if (chunkPosition.z === CHUNK_SIZE - 1) {
            const id = Chunk.id(
                chunkCoordinate.x,
                chunkCoordinate.y,
                chunkCoordinate.z + 1,
            );
            if (this.world.chunks.has(id)) {
                this.dirtyChunks.add(id);
            }
        }
    }

    /**
     * Marks a chunk as dirty.
     */
    markChunkDirty(chunk: Chunk) {
        this.dirtyChunks.add(chunk.id);
    }

    /**
     * Updates n dirty chunks around an actor.
     */
    update(n: number, actor: Vector3) {
        // prioritize chunks based on an expanding sphere around the actor
        const dirtyChunks = Array.from(this.dirtyChunks.values());

        // bubble sort only the REMESH_BATCH_SIZE closest chunks based on distance to the actor
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < dirtyChunks.length; j++) {
                const chunkA = this.world.chunks.get(dirtyChunks[i]);
                const chunkB = this.world.chunks.get(dirtyChunks[j]);

                if (!chunkA || !chunkB) continue;

                const distanceA = chunkA.position.distanceTo(actor);
                const distanceB = chunkB.position.distanceTo(actor);

                if (distanceB < distanceA) {
                    const temp = dirtyChunks[i];
                    dirtyChunks[i] = dirtyChunks[j];
                    dirtyChunks[j] = temp;
                }
            }
        }

        // mesh dirty chunks
        const batch = dirtyChunks.slice(0, n);

        for (const chunkId of batch) {
            const chunk = this.world.chunks.get(chunkId);
            if (!chunk) {
                continue;
            }

            this.updateChunk(chunk);
        }

        // return the updated chunk ids
        return batch;
    }

    /**
     * Updates all dirty chunks.
     */
    updateAll() {
        for (const chunk of this.world.chunks.values()) {
            this.updateChunk(chunk);
        }
    }

    /**
     * Updates a single chunk.
     */
    updateChunk(chunk: Chunk) {
        this.dirtyChunks.delete(chunk.id);

        let chunkMesh = this.chunkMeshes.get(chunk.id);

        if (chunkMesh) {
            chunkMesh.mesh.removeFromParent();
            chunkMesh.geometry.dispose();
        }

        const result = CulledMesher.mesh(
            chunk,
            this.world,
            this.blockRegistry,
            this.textureAtlasLayout!,
        );

        if (result.positions.length === 0) {
            return;
        }

        const geometry = new ChunkGeometry();
        geometry.setMesherData(result);

        const mesh = new Mesh(geometry, this.chunkMaterial);
        mesh.position.set(
            chunk.worldPositionOffset.x,
            chunk.worldPositionOffset.y,
            chunk.worldPositionOffset.z,
        );

        this.parent.add(mesh);

        chunkMesh = { mesh, geometry };
        this.chunkMeshes.set(chunk.id, chunkMesh);
    }

    dispose() {
        for (const { mesh } of this.chunkMeshes.values()) {
            this.parent.remove(mesh);
            mesh.geometry.dispose();
        }
        this.chunkMaterial.dispose();
        this.textureAtlasTexture?.dispose();
    }
}
