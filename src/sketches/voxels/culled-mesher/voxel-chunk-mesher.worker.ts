import { Color } from 'three'
import {
    ChunkMeshUpdateNotificationMessage,
    RegisterChunkMessage,
    VoxelChunk,
    VoxelChunkMeshData,
    WorkerMessage,
} from './voxel-types'
import { CHUNK_SIZE, VoxelUtils } from './voxel-utils'

const VOXEL_FACE_DIRECTIONS: {
    // direction of the neighbour voxel
    dx: number
    dy: number
    dz: number

    // local position offset of the neighbour face
    lx: number
    ly: number
    lz: number

    // uvs of the neighbour faces
    ux: number
    uy: number
    uz: number
    vx: number
    vy: number
    vz: number

    // normal of the neighbour face
    nx: number
    ny: number
    nz: number
}[] = [
    {
        dx: 0,
        dy: 1,
        dz: 0,
        lx: 1,
        ly: 1,
        lz: 0,
        ux: -1,
        uy: 0,
        uz: 0,
        vx: 0,
        vy: 0,
        vz: 1,
        nx: 0,
        ny: 1,
        nz: 0,
    },
    {
        dx: 0,
        dy: -1,
        dz: 0,
        lx: 0,
        ly: 0,
        lz: 0,
        ux: 1,
        uy: 0,
        uz: 0,
        vx: 0,
        vy: 0,
        vz: 1,
        nx: 0,
        ny: -1,
        nz: 0,
    },
    {
        dx: -1,
        dy: 0,
        dz: 0,
        lx: 0,
        ly: 0,
        lz: 1,
        ux: 0,
        uy: 1,
        uz: 0,
        vx: 0,
        vy: 0,
        vz: -1,
        nx: -1,
        ny: 0,
        nz: 0,
    },
    {
        dx: 1,
        dy: 0,
        dz: 0,
        lx: 1,
        ly: 0,
        lz: 0,
        ux: 0,
        uy: 1,
        uz: 0,
        vx: 0,
        vy: 0,
        vz: 1,
        nx: 1,
        ny: 0,
        nz: 0,
    },
    {
        dx: 0,
        dy: 0,
        dz: -1,
        lx: 0,
        ly: 0,
        lz: 0,
        ux: 0,
        uy: 1,
        uz: 0,
        vx: 1,
        vy: 0,
        vz: 0,
        nx: 0,
        ny: 0,
        nz: -1,
    },
    {
        dx: 0,
        dy: 0,
        dz: 1,
        lx: 1,
        ly: 0,
        lz: 1,
        ux: 0,
        uy: 1,
        uz: 0,
        vx: -1,
        vy: 0,
        vz: 0,
        nx: 0,
        ny: 0,
        nz: 1,
    },
]

class VoxelChunkMesher {
    private tmpColor = new Color()

    constructor(
        public chunks: Map<string, VoxelChunk>,
        public chunk: VoxelChunk,
        public chunkMeshData: VoxelChunkMeshData,
    ) {}

    update() {
        const chunkX = this.chunk.position[0] * CHUNK_SIZE
        const chunkY = this.chunk.position[1] * CHUNK_SIZE
        const chunkZ = this.chunk.position[2] * CHUNK_SIZE

        let positionsCount = 0
        let indicesCount = 0
        let normalsCount = 0
        let colorsCount = 0

        const { positions, indices, normals, colors, meta } = this.chunkMeshData

        for (let localX = 0; localX < CHUNK_SIZE; localX++) {
            for (let localY = 0; localY < CHUNK_SIZE; localY++) {
                for (let localZ = 0; localZ < CHUNK_SIZE; localZ++) {
                    const chunkDataIndex = VoxelUtils.positionToChunkIndex([localX, localY, localZ])

                    if (this.chunk.solid[chunkDataIndex] === 0) continue

                    const worldX = chunkX + localX
                    const worldY = chunkY + localY
                    const worldZ = chunkZ + localZ

                    const col = this.chunk.color[chunkDataIndex]
                    this.tmpColor.set(col)

                    for (const { dx, dy, dz, lx, ly, lz, ux, uy, uz, vx, vy, vz, nx, ny, nz } of VOXEL_FACE_DIRECTIONS) {
                        let solid: boolean

                        if (
                            localX + dx < 0 ||
                            localX + dx >= CHUNK_SIZE ||
                            localY + dy < 0 ||
                            localY + dy >= CHUNK_SIZE ||
                            localZ + dz < 0 ||
                            localZ + dz >= CHUNK_SIZE
                        ) {
                            solid = VoxelUtils.isSolid([worldX + dx, worldY + dy, worldZ + dz], this.chunks)
                        } else {
                            const index = VoxelUtils.positionToChunkIndex([localX + dx, localY + dy, localZ + dz])
                            solid = this.chunk.solid[index] === 1
                        }

                        if (solid) continue

                        const x = localX + lx
                        const y = localY + ly
                        const z = localZ + lz

                        positions[positionsCount++] = x
                        positions[positionsCount++] = y
                        positions[positionsCount++] = z

                        positions[positionsCount++] = x + ux
                        positions[positionsCount++] = y + uy
                        positions[positionsCount++] = z + uz

                        positions[positionsCount++] = x + ux + vx
                        positions[positionsCount++] = y + uy + vy
                        positions[positionsCount++] = z + uz + vz

                        positions[positionsCount++] = x + vx
                        positions[positionsCount++] = y + vy
                        positions[positionsCount++] = z + vz

                        /*
                            make two triangles for the face
                            d --- c
                            |     |
                            a --- b
                        */

                        const index = (positionsCount + 1) / 3 - 4
                        const a = index
                        const b = index + 1
                        const c = index + 2
                        const d = index + 3

                        indices[indicesCount++] = a
                        indices[indicesCount++] = b
                        indices[indicesCount++] = d

                        indices[indicesCount++] = b
                        indices[indicesCount++] = c
                        indices[indicesCount++] = d

                        normals[normalsCount++] = nx
                        normals[normalsCount++] = ny
                        normals[normalsCount++] = nz

                        normals[normalsCount++] = nx
                        normals[normalsCount++] = ny
                        normals[normalsCount++] = nz

                        normals[normalsCount++] = nx
                        normals[normalsCount++] = ny
                        normals[normalsCount++] = nz

                        normals[normalsCount++] = nx
                        normals[normalsCount++] = ny
                        normals[normalsCount++] = nz

                        colors[colorsCount++] = this.tmpColor.r
                        colors[colorsCount++] = this.tmpColor.g
                        colors[colorsCount++] = this.tmpColor.b

                        colors[colorsCount++] = this.tmpColor.r
                        colors[colorsCount++] = this.tmpColor.g
                        colors[colorsCount++] = this.tmpColor.b

                        colors[colorsCount++] = this.tmpColor.r
                        colors[colorsCount++] = this.tmpColor.g
                        colors[colorsCount++] = this.tmpColor.b

                        colors[colorsCount++] = this.tmpColor.r
                        colors[colorsCount++] = this.tmpColor.g
                        colors[colorsCount++] = this.tmpColor.b
                    }
                }
            }
        }

        meta[0] = positionsCount
        meta[1] = indicesCount
        meta[2] = normalsCount
        meta[3] = colorsCount
    }
}

type WorkerState = {
    chunks: Map<string, VoxelChunk>
    meshers: Map<string, VoxelChunkMesher>
    meshJobs: Set<string>
}

const state: WorkerState = {
    chunks: new Map(),
    meshers: new Map(),
    meshJobs: new Set(),
}

const worker = self as unknown as Worker

const update = () => {
    const incomplete = new Set(state.meshJobs)

    const jobs = state.meshJobs
    state.meshJobs = new Set()

    for (const chunkId of jobs) {
        const mesher = state.meshers.get(chunkId)

        if (!mesher) continue

        mesher.update()

        incomplete.delete(chunkId)

        const chunkMeshUpdateNotification: ChunkMeshUpdateNotificationMessage = {
            type: 'chunk-mesh-update-notification',
            id: chunkId,
        }

        worker.postMessage(chunkMeshUpdateNotification)
    }

    state.meshJobs = new Set([...incomplete, ...state.meshJobs])
}

const registerChunk = ({ id, position, chunkBuffers, chunkMeshBuffers }: RegisterChunkMessage) => {
    const chunk: VoxelChunk = {
        id,
        position,
        solid: new Uint8Array(chunkBuffers.solid),
        color: new Uint32Array(chunkBuffers.color),
        solidBuffer: chunkBuffers.solid,
        colorBuffer: chunkBuffers.color,
    }

    state.chunks.set(id, chunk)

    const chunkMeshData: VoxelChunkMeshData = {
        positions: new Float32Array(chunkMeshBuffers.positions),
        positionsBuffer: chunkMeshBuffers.positions,
        indices: new Uint32Array(chunkMeshBuffers.indices),
        indicesBuffer: chunkMeshBuffers.indices,
        normals: new Float32Array(chunkMeshBuffers.normals),
        normalsBuffer: chunkMeshBuffers.normals,
        colors: new Float32Array(chunkMeshBuffers.colors),
        colorsBuffer: chunkMeshBuffers.colors,
        meta: new Uint32Array(chunkMeshBuffers.meta),
        metaBuffer: chunkMeshBuffers.meta,
    }

    const mesher = new VoxelChunkMesher(state.chunks, chunk, chunkMeshData)

    state.meshers.set(chunk.id, mesher)
}

worker.onmessage = (e) => {
    const data = e.data as WorkerMessage
    const { type } = data

    if (type === 'register-chunk') {
        registerChunk(data)
    } else if (type === 'request-chunk-mesh-update') {
        state.meshJobs.add(data.id)
    }
}

setInterval(() => {
    update()
}, 1 / 60)
