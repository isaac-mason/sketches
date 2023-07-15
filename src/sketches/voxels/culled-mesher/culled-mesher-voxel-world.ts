import { useFrame } from '@react-three/fiber'
import { Topic } from 'arancini'
import { packSiblings } from 'd3'
import { BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial } from 'three'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

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
    vx: number
    vy: number

    // normal of the neighbour face
    nx: number
    ny: number
    nz: number
}[] = [
    {
        dx: 0,
        dy: 0,
        dz: 1,
        lx: 1,
        ly: 0,
        lz: 1,
        ux: -1,
        uy: 0,
        vx: 0,
        vy: 1,
        nx: 0,
        ny: 0,
        nz: 1,
    },
    {
        dx: 0,
        dy: 0,
        dz: -1,
        lx: 0,
        ly: 0,
        lz: 0,
        ux: 1,
        uy: 0,
        vx: 0,
        vy: 1,
        nx: 0,
        ny: 0,
        nz: -1,
    },
    {
        dx: -1,
        dy: 0,
        dz: 0,
        lx: 0,
        ly: 1,
        lz: 0,
        ux: 0,
        uy: 0,
        vx: 0,
        vy: -1,
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
        uy: 0,
        vx: 0,
        vy: 1,
        nx: 1,
        ny: 0,
        nz: 0,
    },
    {
        dx: 0,
        dy: -1,
        dz: 0,
        lx: 0,
        ly: 0,
        lz: 0,
        ux: 0,
        uy: 0,
        vx: 1,
        vy: 0,
        nx: 0,
        ny: -1,
        nz: 0,
    },
    {
        dx: 0,
        dy: 1,
        dz: 0,
        lx: 1,
        ly: 1,
        lz: 0,
        ux: 0,
        uy: 0,
        vx: -1,
        vy: 0,
        nx: 0,
        ny: 1,
        nz: 0,
    },
]

export const CHUNK_BITS = 4
export const CHUNK_SIZE = Math.pow(2, 4)

export type Vec3 = [x: number, y: number, z: number]

export type VoxelChunk = {
    id: string
    position: Vec3
    solid: Uint8Array
    color: Uint32Array
    dirty: boolean
}

export class VoxelWorld {
    chunks = new Map<string, VoxelChunk>()

    onChunkCreated = new Topic<[VoxelChunk]>()

    onChunkDirtied = new Topic<[VoxelChunk]>()

    setBlock(position: Vec3, value: { solid: false } | { solid: true; color: number }) {
        const chunkPosition = VoxelUtils.worldPositionToChunkPosition(position)
        const id = VoxelUtils.chunkId(chunkPosition)

        let chunk = this.chunks.get(id)

        if (chunk === undefined) {
            chunk = VoxelUtils.emptyChunk(id, chunkPosition)
            this.chunks.set(id, chunk)
            this.onChunkCreated.emit(chunk)
        }

        const index = VoxelUtils.positionToChunkIndex(position)
        chunk.solid[index] = value.solid ? 1 : 0
        chunk.color[index] = value.solid ? value.color : 0

        chunk.dirty = true
        this.onChunkDirtied.emit(chunk)

        // check if we need to make neighbour chunks dirty
        for (let axis = 0; axis < 3; axis++) {
            for (const [pos, dir] of [
                [0, -1],
                [CHUNK_SIZE - 1, 1],
            ]) {
                if (position[axis] !== pos) {
                    continue
                }

                const offset = [0, 0, 0]
                offset[axis] = dir

                const neighbourPosition: Vec3 = [position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]]

                if (!this.isSolid(neighbourPosition)) return

                const neighbourChunk = this.chunks.get(
                    VoxelUtils.chunkId([
                        chunkPosition[0] + offset[0],
                        chunkPosition[1] + offset[1],
                        chunkPosition[2] + offset[2],
                    ]),
                )!

                neighbourChunk.dirty = true
                this.onChunkDirtied.emit(neighbourChunk)

                return
            }
        }
    }

    isSolid(position: Vec3): boolean {
        const chunk = this.chunks.get(VoxelUtils.chunkId(VoxelUtils.worldPositionToChunkPosition(position)))

        if (!chunk) {
            return false
        }

        const chunkDataIndex = VoxelUtils.positionToChunkIndex(position)
        return chunk.solid[chunkDataIndex] === 1
    }
}

const traceRayImpl = (
    world: VoxelWorld,
    origin: Vec3,
    direction: Vec3,
    max_d: number,
    hit_pos: Vec3,
    hit_norm: Vec3,
    EPSILON: number,
) => {
    let t = 0.0
    let nx = 0
    let ny = 0
    let nz = 0
    let ix
    let iy
    let iz
    let fx
    let fy
    let fz
    let ox: number = 0
    let oy: number = 0
    let oz: number = 0
    let ex: boolean
    let ey: boolean
    let ez: boolean
    let b: boolean
    let step: number
    let min_step: number

    // Step block-by-block along ray
    while (t <= max_d) {
        ox = origin[0] + t * direction[0]
        oy = origin[1] + t * direction[1]
        oz = origin[2] + t * direction[2]
        ix = Math.floor(ox) | 0
        iy = Math.floor(oy) | 0
        iz = Math.floor(oz) | 0
        fx = ox - ix
        fy = oy - iy
        fz = oz - iz
        b = world.isSolid([ix, iy, iz])

        if (b) {
            if (hit_pos) {
                // Clamp to face on hit
                hit_pos[0] = fx < EPSILON ? +ix : fx > 1.0 - EPSILON ? ix + 1.0 - EPSILON : ox
                hit_pos[1] = fy < EPSILON ? +iy : fy > 1.0 - EPSILON ? iy + 1.0 - EPSILON : oy
                hit_pos[2] = fz < EPSILON ? +iz : fz > 1.0 - EPSILON ? iz + 1.0 - EPSILON : oz
            }
            if (hit_norm) {
                hit_norm[0] = nx
                hit_norm[1] = ny
                hit_norm[2] = nz
            }
            return b
        }

        // Check edge cases
        min_step = +(EPSILON * (1.0 + t))
        if (t > min_step) {
            ex = nx < 0 ? fx <= min_step : fx >= 1.0 - min_step
            ey = ny < 0 ? fy <= min_step : fy >= 1.0 - min_step
            ez = nz < 0 ? fz <= min_step : fz >= 1.0 - min_step
            if (ex && ey && ez) {
                b =
                    world.isSolid([ix + nx, iy + ny, iz]) ||
                    world.isSolid([ix, iy + ny, iz + nz]) ||
                    world.isSolid([ix + nx, iy, iz + nz])
                if (b) {
                    if (hit_pos) {
                        hit_pos[0] = nx < 0 ? ix - EPSILON : ix + 1.0 - EPSILON
                        hit_pos[1] = ny < 0 ? iy - EPSILON : iy + 1.0 - EPSILON
                        hit_pos[2] = nz < 0 ? iz - EPSILON : iz + 1.0 - EPSILON
                    }
                    if (hit_norm) {
                        hit_norm[0] = nx
                        hit_norm[1] = ny
                        hit_norm[2] = nz
                    }
                    return b
                }
            }
            if (ex && (ey || ez)) {
                b = world.isSolid([ix + nx, iy, iz])
                if (b) {
                    if (hit_pos) {
                        hit_pos[0] = nx < 0 ? ix - EPSILON : ix + 1.0 - EPSILON
                        hit_pos[1] = fy < EPSILON ? +iy : oy
                        hit_pos[2] = fz < EPSILON ? +iz : oz
                    }
                    if (hit_norm) {
                        hit_norm[0] = nx
                        hit_norm[1] = ny
                        hit_norm[2] = nz
                    }
                    return b
                }
            }
            if (ey && (ex || ez)) {
                b = world.isSolid([ix, iy + ny, iz])
                if (b) {
                    if (hit_pos) {
                        hit_pos[0] = fx < EPSILON ? +ix : ox
                        hit_pos[1] = ny < 0 ? iy - EPSILON : iy + 1.0 - EPSILON
                        hit_pos[2] = fz < EPSILON ? +iz : oz
                    }
                    if (hit_norm) {
                        hit_norm[0] = nx
                        hit_norm[1] = ny
                        hit_norm[2] = nz
                    }
                    return b
                }
            }
            if (ez && (ex || ey)) {
                b = world.isSolid([ix, iy, iz + nz])
                if (b) {
                    if (hit_pos) {
                        hit_pos[0] = fx < EPSILON ? +ix : ox
                        hit_pos[1] = fy < EPSILON ? +iy : oy
                        hit_pos[2] = nz < 0 ? iz - EPSILON : iz + 1.0 - EPSILON
                    }
                    if (hit_norm) {
                        hit_norm[0] = nx
                        hit_norm[1] = ny
                        hit_norm[2] = nz
                    }
                    return b
                }
            }
        }
        //Walk to next face of cube along ray
        nx = ny = nz = 0
        step = 2.0
        if (direction[0] < -EPSILON) {
            var s = -fx / direction[0]
            nx = 1
            step = s
        }
        if (direction[0] > EPSILON) {
            var s = (1.0 - fx) / direction[0]
            nx = -1
            step = s
        }
        if (direction[1] < -EPSILON) {
            var s = -fy / direction[1]
            if (s < step - min_step) {
                nx = 0
                ny = 1
                step = s
            } else if (s < step + min_step) {
                ny = 1
            }
        }
        if (direction[1] > EPSILON) {
            var s = (1.0 - fy) / direction[1]
            if (s < step - min_step) {
                nx = 0
                ny = -1
                step = s
            } else if (s < step + min_step) {
                ny = -1
            }
        }
        if (direction[2] < -EPSILON) {
            var s = -fz / direction[2]
            if (s < step - min_step) {
                nx = ny = 0
                nz = 1
                step = s
            } else if (s < step + min_step) {
                nz = 1
            }
        }
        if (direction[2] > EPSILON) {
            var s = (1.0 - fz) / direction[2]
            if (s < step - min_step) {
                nx = ny = 0
                nz = -1
                step = s
            } else if (s < step + min_step) {
                nz = -1
            }
        }
        if (step > max_d - t) {
            step = max_d - t - min_step
        }
        if (step < min_step) {
            step = min_step
        }
        t += step
    }

    if (hit_pos) {
        hit_pos[0] = ox
        hit_pos[1] = oy
        hit_pos[2] = oz
    }

    if (hit_norm) {
        hit_norm[0] = hit_norm[1] = hit_norm[2] = 0
    }
    return false
}

export class VoxelUtils {
    static positionToChunkIndex([x, y, z]: Vec3): number {
        const mask = (1 << CHUNK_BITS) - 1

        return (x & mask) + ((y & mask) << CHUNK_BITS) + ((z & mask) << (CHUNK_BITS * 2))
    }

    static worldPositionToChunkPosition([x, y, z]: Vec3): Vec3 {
        // Using signed right shift to convert to chunk vec
        // Shifts right by pushing copies of the leftmost bit in from the left, and let the rightmost bits fall off
        // e.g.
        // 15 >> 4 = 0
        // 16 >> 4 = 1
        const cx = x >> CHUNK_BITS
        const cy = y >> CHUNK_BITS
        const cz = z >> CHUNK_BITS

        return [cx, cy, cz]
    }

    static chunkId = (position: Vec3): string => {
        return position.join(',')
    }

    static emptyChunk(id: string, position: Vec3): VoxelChunk {
        return {
            id,
            position,
            solid: new Uint8Array(CHUNK_SIZE ** 3),
            color: new Uint32Array(CHUNK_SIZE ** 3),
            dirty: true,
        }
    }

    static traceRay(
        world: VoxelWorld,
        origin: Vec3,
        direction: Vec3,
        maxDistance = 500,
        hitPosition: Vec3 = [0, 0, 0],
        hitNormal: Vec3 = [0, 0, 0],
        EPSILON = 1e-8,
    ): { hit: false; hitPosition: undefined; hitNormal: undefined } | { hit: true; hitPosition: Vec3; hitNormal: Vec3 } {
        const px = +origin[0]
        const py = +origin[1]
        const pz = +origin[2]

        let dx = +direction[0]
        let dy = +direction[1]
        let dz = +direction[2]

        const ds = Math.sqrt(dx * dx + dy * dy + dz * dz)

        if (typeof EPSILON === 'undefined') {
            EPSILON = 1e-8
        }

        if (ds < EPSILON) {
            return { hit: false, hitPosition: undefined, hitNormal: undefined }
        }

        dx /= ds
        dy /= ds
        dz /= ds

        const hit = traceRayImpl(world, [px, py, pz], [dx, dy, dz], maxDistance, hitPosition, hitNormal, EPSILON)

        if (hit) {
            return { hit: true, hitPosition: hitPosition, hitNormal: hitNormal }
        }

        return { hit, hitPosition: undefined, hitNormal: undefined }
    }
}

export class VoxelChunkMesh {
    geometry = new BufferGeometry()

    material = new MeshStandardMaterial({
        vertexColors: true,
    })

    mesh = new Mesh()

    private tmpColor = new Color()

    constructor(
        public world: VoxelWorld,
        public chunk: VoxelChunk,
    ) {
        this.mesh.geometry = this.geometry
        this.mesh.material = this.material
    }

    update() {
        const positions: number[] = []
        const indices: number[] = []
        const normals: number[] = []
        const colors: number[] = []

        const chunkX = this.chunk.position[0] * CHUNK_SIZE
        const chunkY = this.chunk.position[1] * CHUNK_SIZE
        const chunkZ = this.chunk.position[2] * CHUNK_SIZE

        for (let localX = 0; localX < CHUNK_SIZE; localX++) {
            for (let localY = 0; localY < CHUNK_SIZE; localY++) {
                for (let localZ = 0; localZ < CHUNK_SIZE; localZ++) {
                    const chunkDataIndex = VoxelUtils.positionToChunkIndex([localX, localY, localZ])

                    if (this.chunk.solid[chunkDataIndex] === 0) {
                        continue
                    }

                    const worldX = chunkX + localX
                    const worldY = chunkY + localY
                    const worldZ = chunkZ + localZ

                    const col = this.chunk.color[chunkDataIndex]
                    this.tmpColor.set(col)

                    for (const { dx, dy, dz, lx, ly, lz, ux, uy, vx, vy, nx, ny, nz } of VOXEL_FACE_DIRECTIONS) {
                        let solid: boolean

                        if (
                            localX + dx < 0 ||
                            localX + dx >= CHUNK_SIZE ||
                            localY + dy < 0 ||
                            localY + dy >= CHUNK_SIZE ||
                            localZ + dz < 0 ||
                            localZ + dz >= CHUNK_SIZE
                        ) {
                            solid = this.world.isSolid([worldX + dx, worldY + dy, worldZ + dz])
                        } else {
                            const index = VoxelUtils.positionToChunkIndex([localX + dx, localY + dy, localZ + dz])
                            solid = this.chunk.solid[index] === 1
                        }

                        if (!solid) {
                            const x = localX + lx
                            const y = localY + ly
                            const z = localZ + lz

                            const uz = ux == 0 && uy == 0 ? 1 : 0
                            const vz = vx == 0 && vy == 0 ? 1 : 0

                            positions.push(x, y, z)
                            positions.push(x + ux, y + uy, z + uz)
                            positions.push(x + vx, y + vy, z + vz)
                            positions.push(x + ux + vx, y + uy + vy, z + uz + vz)

                            const index = positions.length / 3 - 4
                            const a = index
                            const b = index + 1
                            const c = index + 2
                            const d = index + 3

                            indices.push(b, a, c)
                            indices.push(b, c, d)

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

                            normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz)
                        }
                    }
                }
            }
        }

        this.geometry.setIndex(indices)
        this.geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
        this.geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
        this.geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))

        this.mesh.position.set(
            this.chunk.position[0] * CHUNK_SIZE,
            this.chunk.position[1] * CHUNK_SIZE,
            this.chunk.position[2] * CHUNK_SIZE,
        )
    }
}

type VoxelWorldStore = {
    chunkMeshes: { [key: string]: VoxelChunkMesh }
    dirtyChunks: Set<string>
    clearDirtyChunks: () => void
}

export const createVoxelWorld = () => {
    const world = new VoxelWorld()

    const voxelWorldStore = createStore<VoxelWorldStore>((set) => {
        world.onChunkCreated.add((chunk) => {
            const chunkMesh = new VoxelChunkMesh(world, chunk)
            set((state) => ({ chunkMeshes: { ...state.chunkMeshes, [chunkMesh.chunk.id]: chunkMesh } }))
        })

        world.onChunkDirtied.add((chunk) => {
            set((state) => ({ dirtyChunks: new Set([...state.dirtyChunks, chunk.id]) }))
        })

        return {
            chunkMeshes: {},
            dirtyChunks: new Set(),
            clearDirtyChunks: () => set({ dirtyChunks: new Set() }),
        }
    })

    const useVoxelWorldStore = () => useStore(voxelWorldStore)

    const updateVoxelChunkMeshes = () => {
        voxelWorldStore.setState((state) => {
            const chunkMeshes = state.chunkMeshes
            const dirtyChunks = state.dirtyChunks

            dirtyChunks.forEach((id: string) => {
                const chunk = world.chunks.get(id)!

                if (!chunk) {
                    return
                }

                let chunkMesh = chunkMeshes[id]

                if (!chunkMesh) {
                    chunkMesh = new VoxelChunkMesh(world, chunk)
                    chunkMeshes[id] = chunkMesh
                }

                chunkMesh.update()
                chunkMesh.geometry.computeBoundingBox()
                chunk.dirty = false
            })

            return { dirtyChunks: new Set() }
        })
    }

    const useVoxelWorld = () => {
        const { chunkMeshes } = useVoxelWorldStore()

        useFrame(() => {
            updateVoxelChunkMeshes()
        })

        return { world, chunkMeshes: Object.values(chunkMeshes) }
    }

    return { world, updateVoxelChunkMeshes, useVoxelWorld }
}
