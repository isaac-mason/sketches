import * as THREE from 'three'
import { BlockRegistry } from './block-registry'
import { CHUNK_SIZE, Chunk, World } from './world'

export type ChunkGeometryData = {
    positions: Float32Array
    indices: Uint32Array
    normals: Float32Array
    uv: Float32Array
    tex: Float32Array
}

export type CulledMesherResult = {
    id: string
    opaque: ChunkGeometryData
}

const DIRECTION_VECTORS: number[][][] = new Array(3)
for (let i = 0; i < 3; ++i) {
    DIRECTION_VECTORS[i] = [
        [0, 0, 0],
        [0, 0, 0],
    ]
    DIRECTION_VECTORS[i][0][(i + 1) % 3] = 1
    DIRECTION_VECTORS[i][1][(i + 2) % 3] = 1
}

const Axis = {
    X: 0,
    Y: 1,
    Z: 2,
}

const Face = {
    NORTH: 0,
    EAST: 1,
    SOUTH: 2,
    WEST: 3,
    UP: 4,
    DOWN: 5,
}

const Side = {
    Current: 0,
    Next: 1,
}

const FACES: { [axis: number]: { [side: number]: number } } = {
    [Axis.X]: { [Side.Current]: Face.EAST, [Side.Next]: Face.WEST },
    [Axis.Y]: { [Side.Current]: Face.UP, [Side.Next]: Face.DOWN },
    [Axis.Z]: { [Side.Current]: Face.SOUTH, [Side.Next]: Face.NORTH },
}

const FACE_TEXTURE_UVS: { [face: number]: [number, number, number, number, number, number, number, number] } = {
    [Face.NORTH]: [1, 0, 1, 1, 0, 1, 0, 0],
    [Face.SOUTH]: [0, 0, 1, 0, 1, 1, 0, 1],
    [Face.EAST]: [1, 0, 1, 1, 0, 1, 0, 0],
    [Face.WEST]: [0, 0, 1, 0, 1, 1, 0, 1],
    [Face.UP]: [0, 1, 0, 0, 1, 0, 1, 1],
    [Face.DOWN]: [0, 0, 1, 0, 1, 1, 0, 1],
}

const FACE_NORMALS: { [face: number]: [number, number, number] } = {
    [Face.NORTH]: [0, 0, -1],
    [Face.SOUTH]: [0, 0, 1],
    [Face.EAST]: [1, 0, 0],
    [Face.WEST]: [-1, 0, 0],
    [Face.UP]: [0, 1, 0],
    [Face.DOWN]: [0, -1, 0],
}

type BlockData = {
    // [x1, y1, z1, x2, y2, z2, ...]
    positions: number[]
    // [a, b, c, ...]
    indices: number[]
    // [x, y, z, ...]
    normals: number[]
    // [u1, v1, u2, v2, ...]
    uv: number[]
    // [x, y, w, h, ...]
    tex: number[]
}

export class CulledMesher {
    static mesh(chunk: Chunk, world: World, blockRegistry: BlockRegistry): CulledMesherResult {
        const buffer: BlockData = {
            positions: [],
            indices: [],
            normals: [],
            uv: [],
            tex: [],
        }

        const currentWorldPosition = new THREE.Vector3()
        const nxWorldPosition = new THREE.Vector3()
        const nyWorldPosition = new THREE.Vector3()
        const nzWorldPosition = new THREE.Vector3()

        for (let x = -1; x < CHUNK_SIZE; x++) {
            for (let z = -1; z < CHUNK_SIZE; z++) {
                for (let y = -1; y < CHUNK_SIZE; y++) {
                    currentWorldPosition.set(
                        chunk.position.x * CHUNK_SIZE + x,
                        chunk.position.y * CHUNK_SIZE + y,
                        chunk.position.z * CHUNK_SIZE + z,
                    )
                    nxWorldPosition.set(currentWorldPosition.x + 1, currentWorldPosition.y, currentWorldPosition.z)
                    nyWorldPosition.set(currentWorldPosition.x, currentWorldPosition.y + 1, currentWorldPosition.z)
                    nzWorldPosition.set(currentWorldPosition.x, currentWorldPosition.y, currentWorldPosition.z + 1)

                    const current = world.getBlock(currentWorldPosition)

                    const neighbours = [
                        world.getBlock(nxWorldPosition),
                        world.getBlock(nyWorldPosition),
                        world.getBlock(nzWorldPosition),
                    ]

                    for (let dir = 0; dir < 3; dir++) {
                        const nei = neighbours[dir]

                        if (current.solid === nei.solid) continue

                        const side = !current.solid ? 1 : 0

                        const localChunkPosition = [x, y, z]
                        const u = DIRECTION_VECTORS[dir][side]
                        const v = DIRECTION_VECTORS[dir][side ^ 1]
                        ++localChunkPosition[dir]

                        // Skip face generation for positions outside the current chunk
                        if (
                            localChunkPosition[0] < 0 ||
                            localChunkPosition[0] >= CHUNK_SIZE ||
                            localChunkPosition[1] < 0 ||
                            localChunkPosition[1] >= CHUNK_SIZE ||
                            localChunkPosition[2] < 0 ||
                            localChunkPosition[2] >= CHUNK_SIZE
                        )
                            continue

                        buffer.positions.push(localChunkPosition[0], localChunkPosition[1], localChunkPosition[2])
                        buffer.positions.push(
                            localChunkPosition[0] + u[0],
                            localChunkPosition[1] + u[1],
                            localChunkPosition[2] + u[2],
                        )
                        buffer.positions.push(
                            localChunkPosition[0] + u[0] + v[0],
                            localChunkPosition[1] + u[1] + v[1],
                            localChunkPosition[2] + u[2] + v[2],
                        )
                        buffer.positions.push(
                            localChunkPosition[0] + v[0],
                            localChunkPosition[1] + v[1],
                            localChunkPosition[2] + v[2],
                        )

                        const a = buffer.positions.length / 3 - 4
                        const b = buffer.positions.length / 3 - 3
                        const c = buffer.positions.length / 3 - 2
                        const d = buffer.positions.length / 3 - 1
                        buffer.indices.push(a, b, d, b, c, d)

                        const face = FACES[dir][side]

                        const normal = FACE_NORMALS[face]
                        buffer.normals.push(...normal, ...normal, ...normal, ...normal)

                        buffer.uv.push(...FACE_TEXTURE_UVS[face])

                        const block = side ? nei : current
                        const blockType = blockRegistry.getBlock(block.type)

                        if (blockType) {
                            const texture = blockType.texture
                            for (let i = 0; i < 4; i++) {
                                buffer.tex.push(texture.x, texture.y, texture.width, texture.height)
                            }
                        } else {
                            for (let i = 0; i < 4; i++) {
                                buffer.tex.push(0, 0, 0, 0) // todo: error texture
                            }
                        }
                    }
                }
            }
        }

        return {
            id: chunk.id,
            opaque: {
                positions: new Float32Array(buffer.positions),
                indices: new Uint32Array(buffer.indices),
                normals: new Float32Array(buffer.normals),
                uv: new Float32Array(buffer.uv),
                tex: new Float32Array(buffer.tex),
            },
        }
    }
}
