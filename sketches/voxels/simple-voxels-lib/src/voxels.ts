import { Mesh, Object3D, Vector3 } from 'three'
import * as BlockRegistry from './block-registry'
import { ChunkGeometry } from './chunk-geometry'
import { ChunkMaterial } from './chunk-material'
import * as CulledMesher from './culled-mesher'
import * as TextureAtlas from './texture-atlas'
import { Chunk, CHUNK_SIZE, World, worldPositionToChunkCoordinate, worldPositionToChunkPosition } from './world'

const _chunkCoordinate = new Vector3()
const _chunkPosition = new Vector3()

export class Voxels {
    world = new World()

    dirtyChunks = new Set<string>()

    assets: { [key: string]: HTMLImageElement } = {}

    blockRegistry: BlockRegistry.State

    textureAtlasLayout?: TextureAtlas.Layout
    textureAtlasCanvas?: TextureAtlas.Canvas
    textureAtlasTexture?: TextureAtlas.Texture

    private chunkStates: Map<string, { mesh: Mesh; geometry: ChunkGeometry }> = new Map()

    private object3D: Object3D
    private textureSize: number
    private chunkMaterial: ChunkMaterial

    /**
     * @param object3D object3D to add chunk meshes to
     * @param textureSize size of the texture atlas
     */
    constructor(object3D: Object3D, textureSize: number) {
        this.object3D = object3D
        this.textureSize = textureSize
        this.blockRegistry = BlockRegistry.init()
        this.chunkMaterial = new ChunkMaterial()
    }

    /**
     * Register a new block type.
     * You must call `this.updateAtlas()` after this.
     */
    registerBlock(block: BlockRegistry.BlockInfo) {
        return BlockRegistry.add(this.blockRegistry, block)
    }

    /**
     * Call after adding blocks to the block registry
     */
    updateAtlas() {
        this.updateAtlasLayout()
        this.updateAtlasTexture()
    }

    /**
     * Update the layout of the texture atlas based on the current block registry
     * You must call this.updateAtlasTexture() after this
     */
    updateAtlasLayout() {
        const layout = TextureAtlas.createLayout(this.blockRegistry, this.textureSize)
        this.textureAtlasLayout = layout
    }

    /**
     * Call as this.assets updates, e.g. as images load to facilitate lazy loading
     */
    updateAtlasTexture() {
        const canvas = TextureAtlas.createCanvas(this.textureAtlasLayout!, this.assets)
        this.textureAtlasCanvas = canvas

        const texture = TextureAtlas.createTexture(canvas)
        this.textureAtlasTexture = texture

        this.chunkMaterial.updateTexture(texture)
    }

    set(x: number, y: number, z: number, type: number) {
        this.world.setType(x, y, z, type)

        this.markBlockDirty(x, y, z)
    }

    markBlockDirty(x: number, y: number, z: number) {
        const chunkCoordinate = worldPositionToChunkCoordinate(x, y, z, _chunkCoordinate)
        const chunkId = Chunk.id(chunkCoordinate.x, chunkCoordinate.y, chunkCoordinate.z)

        this.dirtyChunks.add(chunkId)

        const chunkPosition = worldPositionToChunkPosition(x, y, z, _chunkPosition)

        if (chunkPosition.x === 0) {
            this.dirtyChunks.add(Chunk.id(chunkCoordinate.x - 1, chunkCoordinate.y, chunkCoordinate.z))
        }
        if (chunkPosition.x === CHUNK_SIZE - 1) {
            this.dirtyChunks.add(Chunk.id(chunkCoordinate.x + 1, chunkCoordinate.y, chunkCoordinate.z))
        }
        if (chunkPosition.y === 0) {
            this.dirtyChunks.add(Chunk.id(chunkCoordinate.x, chunkCoordinate.y - 1, chunkCoordinate.z))
        }
        if (chunkPosition.y === CHUNK_SIZE - 1) {
            this.dirtyChunks.add(Chunk.id(chunkCoordinate.x, chunkCoordinate.y + 1, chunkCoordinate.z))
        }
        if (chunkPosition.z === 0) {
            this.dirtyChunks.add(Chunk.id(chunkCoordinate.x, chunkCoordinate.y, chunkCoordinate.z - 1))
        }
        if (chunkPosition.z === CHUNK_SIZE - 1) {
            this.dirtyChunks.add(Chunk.id(chunkCoordinate.x, chunkCoordinate.y, chunkCoordinate.z + 1))
        }
    }

    markChunkDirty(chunk: Chunk) {
        this.dirtyChunks.add(chunk.id)
    }

    update(meshChunkBatchSize = 3, actor: Vector3) {
        // prioritize chunks based on an expanding sphere around the actor
        const chunks = Array.from(this.dirtyChunks.values())

        // bubble sort only the REMESH_BATCH_SIZE closest chunks based on distance to the actor
        for (let i = 0; i < meshChunkBatchSize; i++) {
            for (let j = i + 1; j < chunks.length; j++) {
                const chunkA = this.world.chunks.get(chunks[i])
                const chunkB = this.world.chunks.get(chunks[j])

                if (!chunkA || !chunkB) continue

                const distanceA = chunkA.position.distanceTo(actor)
                const distanceB = chunkB.position.distanceTo(actor)

                if (distanceB < distanceA) {
                    const temp = chunks[i]
                    chunks[i] = chunks[j]
                    chunks[j] = temp
                }
            }
        }

        // mesh chunks
        const batch = chunks.slice(0, meshChunkBatchSize)

        for (const chunkId of batch) {
            const chunk = this.world.chunks.get(chunkId)
            if (!chunk) continue

            this.meshChunk(chunk)
        }
    }

    meshAllChunks() {
        for (const chunk of this.world.chunks.values()) {
            this.meshChunk(chunk)
        }
        this.dirtyChunks.clear()
    }

    private meshChunk(chunk: Chunk) {
        const result = CulledMesher.mesh(chunk, this.world, this.blockRegistry, this.textureAtlasLayout!)

        let chunkState = this.chunkStates.get(chunk.id)

        if (!chunkState) {
            const geometry = new ChunkGeometry()
            const mesh = new Mesh(geometry, this.chunkMaterial)
            mesh.position.set(chunk.worldPositionOffset.x, chunk.worldPositionOffset.y, chunk.worldPositionOffset.z)
            this.object3D.add(mesh)

            chunkState = { mesh, geometry }
            this.chunkStates.set(chunk.id, chunkState)
        }

        const geometry = chunkState.geometry
        geometry.setMesherData(result)

        this.dirtyChunks.delete(chunk.id)
    }

    dispose() {
        for (const { mesh } of this.chunkStates.values()) {
            this.object3D.remove(mesh)
            mesh.geometry.dispose()
        }

        this.chunkMaterial.dispose()
    }
}
