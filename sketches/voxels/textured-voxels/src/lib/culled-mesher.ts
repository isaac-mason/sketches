import { BlockRegistry } from './block-registry'
import { CHUNK_SIZE, Chunk } from './world'

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

export type NeigbourChunks = {
    nx?: Chunk
    ny?: Chunk
    nz?: Chunk
    px?: Chunk
    py?: Chunk
    pz?: Chunk
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

const MAX_POSITIONS = 6 * 4 * 3 * CHUNK_SIZE ** 3
const MAX_INDICES = 6 * 2 * 3 * CHUNK_SIZE ** 3
const MAX_NORMALS = 6 * 4 * 3 * CHUNK_SIZE ** 3
const MAX_UV = 6 * 4 * 2 * CHUNK_SIZE ** 3
const MAX_TEX = 6 * 4 * 4 * CHUNK_SIZE ** 3

const _buffer = {
    positions: new Array(MAX_POSITIONS),
    indices: new Array(MAX_INDICES),
    normals: new Array(MAX_NORMALS),
    uv: new Array(MAX_UV),
    tex: new Array(MAX_TEX),
}

export class CulledMesher {
    static mesh(chunk: Chunk, neighbours: NeigbourChunks, blockRegistry: BlockRegistry): CulledMesherResult {
        let positionsIndex = 0
        let indicesIndex = 0
        let normalsIndex = 0
        let uvIndex = 0
        let texIndex = 0

        // march over the chunk, comparing neighbouring blocks in px, py, pz directions
        for (let x = -1; x < CHUNK_SIZE; x++) {
            for (let z = -1; z < CHUNK_SIZE; z++) {
                for (let y = -1; y < CHUNK_SIZE; y++) {
                    if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) {
                        continue
                    }

                    let currentSolid = false
                    let currentType = 0

                    // if we are on the nx/ny/nz face of the chunk, we need to check the neighbour for the current block
                    if (x === -1) {
                        if (neighbours.nx) {
                            currentSolid = neighbours.nx.getSolid(CHUNK_SIZE - 1, y, z)
                            if (currentSolid) {
                                currentType = neighbours.nx.getType(CHUNK_SIZE - 1, y, z)
                            }
                        }
                    } else if (y === -1) {
                        if (neighbours.ny) {
                            currentSolid = neighbours.ny.getSolid(x, CHUNK_SIZE - 1, z)
                            if (currentSolid) {
                                currentType = neighbours.ny.getType(x, CHUNK_SIZE - 1, z)
                            }
                        }
                    } else if (z === -1) {
                        if (neighbours.nz) {
                            currentSolid = neighbours.nz.getSolid(x, y, CHUNK_SIZE - 1)
                            if (currentSolid) {
                                currentType = neighbours.nz.getType(x, y, CHUNK_SIZE - 1)
                            }
                        }
                    } else {
                        currentSolid = chunk.getSolid(x, y, z)
                        if (currentSolid) {
                            currentType = chunk.getType(x, y, z)
                        }
                    }

                    for (let dir = 0; dir < 3; dir++) {
                        let neighbourSolid: boolean = false
                        let neighbourType: number = 0

                        if (dir === 0) {
                            if (x === CHUNK_SIZE - 1) {
                                if (neighbours.px) {
                                    neighbourSolid = neighbours.px.getSolid(0, y, z)
                                    if (neighbourSolid) {
                                        neighbourType = neighbours.px.getType(0, y, z)
                                    }
                                }
                            } else {
                                neighbourSolid = chunk.getSolid(x + 1, y, z)
                                if (neighbourSolid) {
                                    neighbourType = chunk.getType(x + 1, y, z)
                                }
                            }
                        } else if (dir === 1) {
                            if (y === CHUNK_SIZE - 1) {
                                if (neighbours.py) {
                                    neighbourSolid = neighbours.py.getSolid(x, 0, z)
                                    if (neighbourSolid) {
                                        neighbourType = neighbours.py.getType(x, 0, z)
                                    }
                                }
                            } else {
                                neighbourSolid = chunk.getSolid(x, y + 1, z)
                                if (neighbourSolid) {
                                    neighbourType = chunk.getType(x, y + 1, z)
                                }
                            }
                        } else {
                            if (z === CHUNK_SIZE - 1) {
                                if (neighbours.pz) {
                                    neighbourSolid = neighbours.pz.getSolid(x, y, 0)
                                    if (neighbourSolid) {
                                        neighbourType = neighbours.pz.getType(x, y, 0)
                                    }
                                }
                            } else {
                                neighbourSolid = chunk.getSolid(x, y, z + 1)
                                if (neighbourSolid) {
                                    neighbourType = chunk.getType(x, y, z + 1)
                                }
                            }
                        }

                        if (currentSolid === neighbourSolid) continue

                        const side = !currentSolid ? 1 : 0

                        const localChunkPosition = [x, y, z]
                        const u = DIRECTION_VECTORS[dir][side]
                        const v = DIRECTION_VECTORS[dir][side ^ 1]
                        ++localChunkPosition[dir]

                        _buffer.positions[positionsIndex++] = localChunkPosition[0]
                        _buffer.positions[positionsIndex++] = localChunkPosition[1]
                        _buffer.positions[positionsIndex++] = localChunkPosition[2]

                        _buffer.positions[positionsIndex++] = localChunkPosition[0] + u[0]
                        _buffer.positions[positionsIndex++] = localChunkPosition[1] + u[1]
                        _buffer.positions[positionsIndex++] = localChunkPosition[2] + u[2]

                        _buffer.positions[positionsIndex++] = localChunkPosition[0] + u[0] + v[0]
                        _buffer.positions[positionsIndex++] = localChunkPosition[1] + u[1] + v[1]
                        _buffer.positions[positionsIndex++] = localChunkPosition[2] + u[2] + v[2]

                        _buffer.positions[positionsIndex++] = localChunkPosition[0] + v[0]
                        _buffer.positions[positionsIndex++] = localChunkPosition[1] + v[1]
                        _buffer.positions[positionsIndex++] = localChunkPosition[2] + v[2]

                        const bufferPositionsLength = positionsIndex / 3
                        const a = bufferPositionsLength - 4
                        const b = bufferPositionsLength - 3
                        const c = bufferPositionsLength - 2
                        const d = bufferPositionsLength - 1

                        _buffer.indices[indicesIndex++] = a
                        _buffer.indices[indicesIndex++] = b
                        _buffer.indices[indicesIndex++] = d
                        _buffer.indices[indicesIndex++] = b
                        _buffer.indices[indicesIndex++] = c
                        _buffer.indices[indicesIndex++] = d

                        const face = FACES[dir][side]

                        const normal = FACE_NORMALS[face]

                        _buffer.normals[normalsIndex++] = normal[0]
                        _buffer.normals[normalsIndex++] = normal[1]
                        _buffer.normals[normalsIndex++] = normal[2]

                        _buffer.normals[normalsIndex++] = normal[0]
                        _buffer.normals[normalsIndex++] = normal[1]
                        _buffer.normals[normalsIndex++] = normal[2]

                        _buffer.normals[normalsIndex++] = normal[0]
                        _buffer.normals[normalsIndex++] = normal[1]
                        _buffer.normals[normalsIndex++] = normal[2]

                        _buffer.normals[normalsIndex++] = normal[0]
                        _buffer.normals[normalsIndex++] = normal[1]
                        _buffer.normals[normalsIndex++] = normal[2]

                        const uvs = FACE_TEXTURE_UVS[face]
                        _buffer.uv[uvIndex++] = uvs[0]
                        _buffer.uv[uvIndex++] = uvs[1]
                        _buffer.uv[uvIndex++] = uvs[2]
                        _buffer.uv[uvIndex++] = uvs[3]
                        _buffer.uv[uvIndex++] = uvs[4]
                        _buffer.uv[uvIndex++] = uvs[5]
                        _buffer.uv[uvIndex++] = uvs[6]
                        _buffer.uv[uvIndex++] = uvs[7]

                        const blockTypeId = side ? neighbourType : currentType
                        const blockType = blockRegistry.getBlock(blockTypeId)

                        if (blockType) {
                            const texture = blockType.texture
                            for (let i = 0; i < 4; i++) {
                                _buffer.tex[texIndex++] = texture.x
                                _buffer.tex[texIndex++] = texture.y
                                _buffer.tex[texIndex++] = texture.width
                                _buffer.tex[texIndex++] = texture.height
                            }
                        } else {
                            for (let i = 0; i < 4; i++) {
                                // todo: error texture
                                _buffer.tex[texIndex++] = 0
                                _buffer.tex[texIndex++] = 0
                                _buffer.tex[texIndex++] = 0
                                _buffer.tex[texIndex++] = 0
                            }
                        }
                    }
                }
            }
        }

        return {
            id: chunk.id,
            opaque: {
                positions: new Float32Array(_buffer.positions.slice(0, positionsIndex)),
                indices: new Uint32Array(_buffer.indices.slice(0, indicesIndex)),
                normals: new Float32Array(_buffer.normals.slice(0, normalsIndex)),
                uv: new Float32Array(_buffer.uv.slice(0, uvIndex)),
                tex: new Float32Array(_buffer.tex.slice(0, texIndex)),
            },
        }
    }
}
