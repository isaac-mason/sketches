import { Color, Vector3 } from 'three'
import { Vec3, VoxelChunk, isSolid, positionToChunkIndex } from '../core'
import { CHUNK_SIZE } from '../core/utils'
import { ChunkMeshUpdateMessage, RegisterChunkMessage, WorkerMessage } from './types'

const vertexAmbientOcclusion = (side1: number, side2: number, corner: number) => {
    if (side1 && side2) {
        return 0
    }

    return (3 - (side1 + side2 + corner)) / 3
}

const voxelFaceAmbientOcclusionGrid = (
    chunks: Map<string, VoxelChunk>,
    pos: Vec3,
    dir: (typeof VOXEL_FACE_DIRECTIONS)[number],
): number[] => {
    const u = new Vector3(dir.ux, dir.uy, dir.uz)
    const v = new Vector3(dir.vx, dir.vy, dir.vz)
    const normal = new Vector3(dir.nx, dir.ny, dir.nz)

    const grid: number[] = []
    const vec3 = new Vector3()

    for (let q = -1; q < 2; q++) {
        for (let p = -1; p < 2; p++) {
            vec3.set(...pos)

            vec3.x += normal.x
            vec3.y += normal.y
            vec3.z += normal.z

            vec3.x += u.x * p
            vec3.y += u.y * p
            vec3.z += u.z * p

            vec3.x += v.x * q
            vec3.y += v.y * q
            vec3.z += v.z * q

            const solid = isSolid(vec3.toArray(), chunks)

            grid.push(solid ? 1 : 0)
        }
    }

    return grid
}

/**
 * Calculates ambient occlusion for a voxel face quad
 *
 *  . --- . --- . --- .
 *  |  6  |  7  |  8  |
 *  . --- d --- c --- .
 *  |  3  |  4  |  5  |
 *  . --- a --- b --- .
 *  |  0  |  1  |  2  |
 *  . --- . --- . --- .
 */
const voxelFaceAmbientOcclusion = (chunks: Map<string, VoxelChunk>, pos: Vec3, dir: (typeof VOXEL_FACE_DIRECTIONS)[number]) => {
    const grid = voxelFaceAmbientOcclusionGrid(chunks, pos, dir)

    return [
        vertexAmbientOcclusion(grid[3], grid[1], grid[0]),
        vertexAmbientOcclusion(grid[1], grid[5], grid[2]),
        vertexAmbientOcclusion(grid[5], grid[7], grid[8]),
        vertexAmbientOcclusion(grid[3], grid[7], grid[6]),
    ]
}

const VOXEL_FACE_DIRECTIONS: {
    // direction of the neighbour voxel
    dx: number
    dy: number
    dz: number

    // local position offset
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
    // top
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
    // bottom
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
    // left
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
    // right
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
    // front
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
    // back
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
    ) {}

    mesh() {
        const chunkX = this.chunk.position.x * CHUNK_SIZE
        const chunkY = this.chunk.position.y * CHUNK_SIZE
        const chunkZ = this.chunk.position.z * CHUNK_SIZE

        const positions: number[] = []
        const indices: number[] = []
        const normals: number[] = []
        const colors: number[] = []
        const ambientOcclusion: number[] = []

        for (let localX = 0; localX < CHUNK_SIZE; localX++) {
            for (let localY = 0; localY < CHUNK_SIZE; localY++) {
                for (let localZ = 0; localZ < CHUNK_SIZE; localZ++) {
                    const chunkDataIndex = positionToChunkIndex([localX, localY, localZ])

                    if (this.chunk.solid[chunkDataIndex] === 0) continue

                    const worldX = chunkX + localX
                    const worldY = chunkY + localY
                    const worldZ = chunkZ + localZ

                    const col = this.chunk.color[chunkDataIndex]
                    this.tmpColor.set(col)

                    for (const voxelFaceDirection of VOXEL_FACE_DIRECTIONS) {
                        const { dx, dy, dz, lx, ly, lz, ux, uy, uz, vx, vy, vz, nx, ny, nz } = voxelFaceDirection

                        let solid: boolean

                        if (
                            localX + dx < 0 ||
                            localX + dx >= CHUNK_SIZE ||
                            localY + dy < 0 ||
                            localY + dy >= CHUNK_SIZE ||
                            localZ + dz < 0 ||
                            localZ + dz >= CHUNK_SIZE
                        ) {
                            solid = isSolid([worldX + dx, worldY + dy, worldZ + dz], this.chunks)
                        } else {
                            const index = positionToChunkIndex([localX + dx, localY + dy, localZ + dz])
                            solid = this.chunk.solid[index] === 1
                        }

                        if (solid) continue

                        const voxelFaceLocalX = localX + lx
                        const voxelFaceLocalY = localY + ly
                        const voxelFaceLocalZ = localZ + lz

                        positions.push(voxelFaceLocalX, voxelFaceLocalY, voxelFaceLocalZ)
                        positions.push(voxelFaceLocalX + ux, voxelFaceLocalY + uy, voxelFaceLocalZ + uz)
                        positions.push(voxelFaceLocalX + ux + vx, voxelFaceLocalY + uy + vy, voxelFaceLocalZ + uz + vz)
                        positions.push(voxelFaceLocalX + vx, voxelFaceLocalY + vy, voxelFaceLocalZ + vz)

                        normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz)

                        colors.push(
                            this.tmpColor.r,
                            this.tmpColor.g,
                            this.tmpColor.b,
                            this.tmpColor.r,
                            this.tmpColor.g,
                            this.tmpColor.b,
                            this.tmpColor.r,
                            this.tmpColor.g,
                            this.tmpColor.b,
                            this.tmpColor.r,
                            this.tmpColor.g,
                            this.tmpColor.b,
                        )

                        const ao = voxelFaceAmbientOcclusion(state.chunks, [worldX, worldY, worldZ], voxelFaceDirection)
                        const ao00 = ao[0]
                        const ao01 = ao[1]
                        const ao10 = ao[2]
                        const ao11 = ao[3]

                        ambientOcclusion.push(ao00, ao01, ao10, ao11)

                        /*
                            make two triangles for the face

                            d --- c
                            |     |
                            a --- b
                        */

                        const index = (positions.length + 1) / 3 - 4
                        const a = index
                        const b = index + 1
                        const c = index + 2
                        const d = index + 3

                        /**
                         * @see https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/
                         */
                        if (ao00 + ao10 > ao11 + ao01) {
                            // generate flipped quad
                            indices.push(a, b, c, a, c, d)
                        } else {
                            // generate normal quad
                            indices.push(a, b, d, b, c, d)
                        }
                    }
                }
            }
        }

        return {
            positions: new Float32Array(positions),
            indices: new Uint32Array(indices),
            normals: new Float32Array(normals),
            colors: new Float32Array(colors),
            ambientOcclusion: new Float32Array(ambientOcclusion),
        }
    }
}

type WorkerState = {
    chunks: Map<string, VoxelChunk>
    meshers: Map<string, VoxelChunkMesher>
    jobs: Set<string>
}

const state: WorkerState = {
    chunks: new Map(),
    meshers: new Map(),
    jobs: new Set(),
}

const worker = self as unknown as Worker

const update = () => {
    const incomplete = new Set(state.jobs)

    const jobs = state.jobs
    state.jobs = new Set()

    for (const chunkId of jobs) {
        const mesher = state.meshers.get(chunkId)

        if (!mesher) continue

        const { positions, indices, normals, colors, ambientOcclusion } = mesher.mesh()

        incomplete.delete(chunkId)

        const chunkMeshUpdateNotification: ChunkMeshUpdateMessage = {
            type: 'chunk-mesh-update',
            id: chunkId,
            positions,
            indices,
            normals,
            colors,
            ambientOcclusion,
        }

        worker.postMessage(chunkMeshUpdateNotification, [
            positions.buffer,
            indices.buffer,
            normals.buffer,
            colors.buffer,
            ambientOcclusion.buffer,
        ])
    }

    state.jobs = new Set([...incomplete, ...state.jobs])
}

const registerChunk = ({ id, position, solidBuffer, colorBuffer }: RegisterChunkMessage) => {
    const chunk: VoxelChunk = {
        id,
        position: new Vector3(...position),
        solid: new Uint8Array(solidBuffer),
        solidBuffer,
        color: new Uint32Array(colorBuffer),
        colorBuffer,
        priority: 0,
    }

    state.chunks.set(id, chunk)

    const mesher = new VoxelChunkMesher(state.chunks, chunk)

    state.meshers.set(chunk.id, mesher)
}

worker.onmessage = (e) => {
    const data = e.data as WorkerMessage
    const { type } = data

    if (type === 'register-chunk') {
        registerChunk(data)
    } else if (type === 'request-chunk-mesh-update') {
        state.jobs.add(data.id)
    }
}

setInterval(() => {
    update()
}, 1 / 60)
