import { BlockRegistry } from './block-registry'
import { CHUNK_SIZE, Chunk, World } from './world'
import * as THREE from 'three'

export type CulledMesherResult = {
    id: string
    positions: Float32Array
    indices: Uint32Array
    normals: Float32Array
    light: Float32Array
    uv: Float32Array
    tex: Float32Array
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
    [Face.EAST]: [1, 0, 1, 1, 0, 1, 0, 0],
    [Face.SOUTH]: [0, 0, 1, 0, 1, 1, 0, 1],
    [Face.WEST]: [0, 0, 1, 0, 1, 1, 0, 1],
    [Face.UP]: [0, 1, 0, 0, 1, 0, 1, 1],
    [Face.DOWN]: [0, 0, 1, 0, 1, 1, 0, 1],
}

const FACE_NORMALS: { [face: number]: [number, number, number] } = {
    [Face.NORTH]: [0, 0, -1],
    [Face.EAST]: [1, 0, 0],
    [Face.SOUTH]: [0, 0, 1],
    [Face.WEST]: [-1, 0, 0],
    [Face.UP]: [0, -1, 0],
    [Face.DOWN]: [0, 1, 0],
}

const AIR = { type: 0, solid: false }

export class CulledMesher {
    static mesh(chunk: Chunk, world: World, blockRegistry: BlockRegistry): CulledMesherResult {
        // [x1, y1, z1, x2, y2, z2, ...]
        const positions: number[] = []
        // [a, b, c, ...]
        const indices: number[] = []
        // [x, y, z, ...]
        const normals: number[] = []
        // [r, g, b, ...]
        const lighting: number[] = []
        // [u1, v1, u2, v2, ...]
        const uv: number[] = []
        // [x, y, w, h, ...]
        const tex: number[] = []

        const currentWorldPosition = new THREE.Vector3()
        const nxWorldPosition = new THREE.Vector3()
        const nyWorldPosition = new THREE.Vector3()
        const nzWorldPosition = new THREE.Vector3()

        const neighbourChunks = [
            world.chunks.get(Chunk.id({ x: chunk.position.x - 1, y: chunk.position.y, z: chunk.position.z })),
            world.chunks.get(Chunk.id({ x: chunk.position.x + 1, y: chunk.position.y, z: chunk.position.z })),
            world.chunks.get(Chunk.id({ x: chunk.position.x, y: chunk.position.y - 1, z: chunk.position.z })),
            world.chunks.get(Chunk.id({ x: chunk.position.x, y: chunk.position.y + 1, z: chunk.position.z })),
            world.chunks.get(Chunk.id({ x: chunk.position.x, y: chunk.position.y, z: chunk.position.z - 1 })),
            world.chunks.get(Chunk.id({ x: chunk.position.x, y: chunk.position.y, z: chunk.position.z + 1 })),
        ];

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

                    const current =
                        x >= 0 && y >= 0 && z >= 0
                            ? chunk.getBlock({ x, y, z })
                            : (x < 0
                                  ? neighbourChunks[0]?.getBlock({ x: CHUNK_SIZE - 1, y, z })
                                  : y < 0
                                    ? neighbourChunks[2]?.getBlock({ x, y: CHUNK_SIZE - 1, z })
                                    : neighbourChunks[4]?.getBlock({ x, y, z: CHUNK_SIZE - 1 })) ?? AIR

                    const neighbours = [
                        (x + 1 < CHUNK_SIZE) ? chunk.getBlock({ x: x + 1, y, z }) : neighbourChunks[1]?.getBlock({ x: 0, y, z }) ?? AIR,
                        (y + 1 < CHUNK_SIZE) ? chunk.getBlock({ x, y: y + 1, z }) : neighbourChunks[3]?.getBlock({ x, y: 0, z }) ?? AIR,
                        (z + 1 < CHUNK_SIZE) ? chunk.getBlock({ x, y, z: z + 1 }) : neighbourChunks[5]?.getBlock({ x, y, z: 0 }) ?? AIR,
                    ]

                    for (let dir = 0; dir < 3; dir++) {
                        const nei = neighbours[dir]

                        if (current.solid === nei.solid) continue

                        const side = !current.solid ? 1 : 0

                        const localChunkPosition = [x, y, z]
                        const u = DIRECTION_VECTORS[dir][side]
                        const v = DIRECTION_VECTORS[dir][side ^ 1]
                        ++localChunkPosition[dir]

                        positions.push(localChunkPosition[0], localChunkPosition[1], localChunkPosition[2])
                        positions.push(localChunkPosition[0] + u[0], localChunkPosition[1] + u[1], localChunkPosition[2] + u[2])
                        positions.push(
                            localChunkPosition[0] + u[0] + v[0],
                            localChunkPosition[1] + u[1] + v[1],
                            localChunkPosition[2] + u[2] + v[2],
                        )
                        positions.push(localChunkPosition[0] + v[0], localChunkPosition[1] + v[1], localChunkPosition[2] + v[2])

                        const a = positions.length / 3 - 4
                        const b = positions.length / 3 - 3
                        const c = positions.length / 3 - 2
                        const d = positions.length / 3 - 1
                        indices.push(a, b, d, b, c, d)

                        const normal = FACE_NORMALS[FACES[dir][side]]
                        normals.push(...normal, ...normal, ...normal, ...normal)

                        const face = FACES[dir][side]

                        uv.push(...FACE_TEXTURE_UVS[face])

                        const block = side ? nei : current
                        const blockType = blockRegistry.getBlock(block.type)

                        if (blockType) {
                            const texture = blockType.texture
                            for (let i = 0; i < 4; i++) {
                                tex.push(texture.x, texture.y, texture.width, texture.height)
                            }
                        } else {
                            for (let i = 0; i < 4; i++) {
                                tex.push(0, 0, 0, 0) // todo: error texture
                            }
                        }
                    }
                }
            }
        }

        return {
            id: chunk.id,
            positions: new Float32Array(positions),
            indices: new Uint32Array(indices),
            normals: new Float32Array(normals),
            light: new Float32Array(lighting),
            uv: new Float32Array(uv),
            tex: new Float32Array(tex),
        }
    }
}
