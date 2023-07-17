import { Vec3, VoxelChunk, VoxelChunkMeshData } from './voxel-types'
import { VoxelWorld } from './voxel-world'

export const CHUNK_BITS = 4
export const CHUNK_SIZE = Math.pow(2, 4)

const CHUNK_VOXELS = CHUNK_SIZE ** 3

const VOXEL_SIDES = 6
const VOXEL_SIDE_VERTICES = 4

const CHUNK_MESH_DATA_MAX_VERTICES = (Float32Array.BYTES_PER_ELEMENT * CHUNK_VOXELS * VOXEL_SIDES * VOXEL_SIDE_VERTICES * 3) / 2
const CHUNK_MESH_DATA_MAX_INDICES = (Uint32Array.BYTES_PER_ELEMENT * CHUNK_VOXELS * VOXEL_SIDES * 3 * 2) / 2

const traceRayImpl = (
    world: VoxelWorld,
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    hitPosition: Vec3,
    hitNormal: Vec3,
    epsilon: number,
) => {
    let t = 0.0
    let nx = 0
    let ny = 0
    let nz = 0
    let ix: number
    let iy: number
    let iz: number
    let fx: number
    let fy: number
    let fz: number
    let ox: number = 0
    let oy: number = 0
    let oz: number = 0
    let ex: boolean
    let ey: boolean
    let ez: boolean
    let b: boolean
    let step: number
    let minStep: number

    // Step block-by-block along ray
    while (t <= maxDistance) {
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
            if (hitPosition) {
                // Clamp to face on hit
                hitPosition[0] = fx < epsilon ? +ix : fx > 1.0 - epsilon ? ix + 1.0 - epsilon : ox
                hitPosition[1] = fy < epsilon ? +iy : fy > 1.0 - epsilon ? iy + 1.0 - epsilon : oy
                hitPosition[2] = fz < epsilon ? +iz : fz > 1.0 - epsilon ? iz + 1.0 - epsilon : oz
            }
            if (hitNormal) {
                hitNormal[0] = nx
                hitNormal[1] = ny
                hitNormal[2] = nz
            }
            return b
        }

        // Check edge cases
        minStep = +(epsilon * (1.0 + t))
        if (t > minStep) {
            ex = nx < 0 ? fx <= minStep : fx >= 1.0 - minStep
            ey = ny < 0 ? fy <= minStep : fy >= 1.0 - minStep
            ez = nz < 0 ? fz <= minStep : fz >= 1.0 - minStep
            if (ex && ey && ez) {
                b =
                    world.isSolid([ix + nx, iy + ny, iz]) ||
                    world.isSolid([ix, iy + ny, iz + nz]) ||
                    world.isSolid([ix + nx, iy, iz + nz])
                if (b) {
                    if (hitPosition) {
                        hitPosition[0] = nx < 0 ? ix - epsilon : ix + 1.0 - epsilon
                        hitPosition[1] = ny < 0 ? iy - epsilon : iy + 1.0 - epsilon
                        hitPosition[2] = nz < 0 ? iz - epsilon : iz + 1.0 - epsilon
                    }
                    if (hitNormal) {
                        hitNormal[0] = nx
                        hitNormal[1] = ny
                        hitNormal[2] = nz
                    }
                    return b
                }
            }
            if (ex && (ey || ez)) {
                b = world.isSolid([ix + nx, iy, iz])
                if (b) {
                    if (hitPosition) {
                        hitPosition[0] = nx < 0 ? ix - epsilon : ix + 1.0 - epsilon
                        hitPosition[1] = fy < epsilon ? +iy : oy
                        hitPosition[2] = fz < epsilon ? +iz : oz
                    }
                    if (hitNormal) {
                        hitNormal[0] = nx
                        hitNormal[1] = ny
                        hitNormal[2] = nz
                    }
                    return b
                }
            }
            if (ey && (ex || ez)) {
                b = world.isSolid([ix, iy + ny, iz])
                if (b) {
                    if (hitPosition) {
                        hitPosition[0] = fx < epsilon ? +ix : ox
                        hitPosition[1] = ny < 0 ? iy - epsilon : iy + 1.0 - epsilon
                        hitPosition[2] = fz < epsilon ? +iz : oz
                    }
                    if (hitNormal) {
                        hitNormal[0] = nx
                        hitNormal[1] = ny
                        hitNormal[2] = nz
                    }
                    return b
                }
            }
            if (ez && (ex || ey)) {
                b = world.isSolid([ix, iy, iz + nz])
                if (b) {
                    if (hitPosition) {
                        hitPosition[0] = fx < epsilon ? +ix : ox
                        hitPosition[1] = fy < epsilon ? +iy : oy
                        hitPosition[2] = nz < 0 ? iz - epsilon : iz + 1.0 - epsilon
                    }
                    if (hitNormal) {
                        hitNormal[0] = nx
                        hitNormal[1] = ny
                        hitNormal[2] = nz
                    }
                    return b
                }
            }
        }
        // walk to next face of cube along ray
        nx = ny = nz = 0
        step = 2.0
        if (direction[0] < -epsilon) {
            const s = -fx / direction[0]
            nx = 1
            step = s
        }
        if (direction[0] > epsilon) {
            const s = (1.0 - fx) / direction[0]
            nx = -1
            step = s
        }
        if (direction[1] < -epsilon) {
            const s = -fy / direction[1]
            if (s < step - minStep) {
                nx = 0
                ny = 1
                step = s
            } else if (s < step + minStep) {
                ny = 1
            }
        }
        if (direction[1] > epsilon) {
            const s = (1.0 - fy) / direction[1]
            if (s < step - minStep) {
                nx = 0
                ny = -1
                step = s
            } else if (s < step + minStep) {
                ny = -1
            }
        }
        if (direction[2] < -epsilon) {
            const s = -fz / direction[2]
            if (s < step - minStep) {
                nx = ny = 0
                nz = 1
                step = s
            } else if (s < step + minStep) {
                nz = 1
            }
        }
        if (direction[2] > epsilon) {
            const s = (1.0 - fz) / direction[2]
            if (s < step - minStep) {
                nx = ny = 0
                nz = -1
                step = s
            } else if (s < step + minStep) {
                nz = -1
            }
        }
        if (step > maxDistance - t) {
            step = maxDistance - t - minStep
        }
        if (step < minStep) {
            step = minStep
        }
        t += step
    }

    if (hitPosition) {
        hitPosition[0] = ox
        hitPosition[1] = oy
        hitPosition[2] = oz
    }

    if (hitNormal) {
        hitNormal[0] = hitNormal[1] = hitNormal[2] = 0
    }
    return false
}

export class VoxelUtils {
    static isSolid(position: Vec3, chunks: Map<string, VoxelChunk>) {
        const chunk = chunks.get(VoxelUtils.chunkId(VoxelUtils.worldPositionToChunkPosition(position)))

        if (!chunk) {
            return false
        }

        const chunkDataIndex = VoxelUtils.positionToChunkIndex(position)
        return chunk.solid[chunkDataIndex] === 1
    }

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
        const solidBuffer = new SharedArrayBuffer(Uint8Array.BYTES_PER_ELEMENT * CHUNK_SIZE ** 3)
        const colorBuffer = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT * CHUNK_SIZE ** 3)

        return {
            id,
            position,
            solid: new Uint8Array(solidBuffer),
            color: new Uint32Array(colorBuffer),
            solidBuffer,
            colorBuffer,
        }
    }

    static emptyChunkMeshData() {
        // create buffers that can hold the maximum amount of data for a chunk
        const positionsBuffer = new SharedArrayBuffer(CHUNK_MESH_DATA_MAX_VERTICES)
        const indicesBuffer = new SharedArrayBuffer(CHUNK_MESH_DATA_MAX_INDICES)
        const normalsBuffer = new SharedArrayBuffer(CHUNK_MESH_DATA_MAX_VERTICES)
        const colorsBuffer = new SharedArrayBuffer(CHUNK_MESH_DATA_MAX_VERTICES)
        const metaBuffer = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT * 4)

        const chunkMeshData: VoxelChunkMeshData = {
            positions: new Float32Array(positionsBuffer),
            positionsBuffer: positionsBuffer,
            indices: new Uint32Array(indicesBuffer),
            indicesBuffer,
            normals: new Float32Array(normalsBuffer),
            normalsBuffer: normalsBuffer,
            colors: new Float32Array(colorsBuffer),
            colorsBuffer: colorsBuffer,
            meta: new Uint32Array(metaBuffer),
            metaBuffer,
        }

        return chunkMeshData
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
