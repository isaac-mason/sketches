import { Vector3, Vector3Tuple } from 'three'
import { BlockRegistry } from './block-registry'
import { CHUNK_SIZE, Chunk, World } from './world'

export type CulledMesherResult = {
    positions: Float32Array
    indices: Uint32Array
    normals: Float32Array
    uv: Float32Array
    tex: Float32Array
    ambientOcclusion: Float32Array
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

const AXIS = {
    X: 0,
    Y: 1,
    Z: 2,
}

const FACE = {
    NORTH: 0,
    EAST: 1,
    SOUTH: 2,
    WEST: 3,
    UP: 4,
    DOWN: 5,
}

const SIDE = {
    CURRENT: 0,
    NEXT: 1,
}

const FACES: { [axis: number]: { [side: number]: number } } = {
    [AXIS.X]: { [SIDE.CURRENT]: FACE.EAST, [SIDE.NEXT]: FACE.WEST },
    [AXIS.Y]: { [SIDE.CURRENT]: FACE.UP, [SIDE.NEXT]: FACE.DOWN },
    [AXIS.Z]: { [SIDE.CURRENT]: FACE.SOUTH, [SIDE.NEXT]: FACE.NORTH },
}

const FACE_TEXTURE_UVS: { [face: number]: [number, number, number, number, number, number, number, number] } = {
    [FACE.NORTH]: [1, 0, 1, 1, 0, 1, 0, 0],
    [FACE.SOUTH]: [0, 0, 1, 0, 1, 1, 0, 1],
    [FACE.EAST]: [1, 0, 1, 1, 0, 1, 0, 0],
    [FACE.WEST]: [0, 0, 1, 0, 1, 1, 0, 1],
    [FACE.UP]: [0, 1, 0, 0, 1, 0, 1, 1],
    [FACE.DOWN]: [0, 0, 1, 0, 1, 1, 0, 1],
}

const FACE_NORMALS: { [face: number]: [number, number, number] } = {
    [FACE.NORTH]: [0, 0, -1],
    [FACE.SOUTH]: [0, 0, 1],
    [FACE.EAST]: [1, 0, 0],
    [FACE.WEST]: [-1, 0, 0],
    [FACE.UP]: [0, 1, 0],
    [FACE.DOWN]: [0, -1, 0],
}

const MAX_POSITIONS = 6 * 4 * 3 * CHUNK_SIZE ** 3
const MAX_INDICES = 6 * 2 * 3 * CHUNK_SIZE ** 3
const MAX_NORMALS = 6 * 4 * 3 * CHUNK_SIZE ** 3
const MAX_UV = 6 * 4 * 2 * CHUNK_SIZE ** 3
const MAX_TEX = 6 * 4 * 4 * CHUNK_SIZE ** 3
const MAX_AO = 6 * 4 * CHUNK_SIZE ** 3

const _opaqueBuffer = {
    positions: new Array(MAX_POSITIONS),
    indices: new Array(MAX_INDICES),
    normals: new Array(MAX_NORMALS),
    uv: new Array(MAX_UV),
    tex: new Array(MAX_TEX),
    ambientOcclusion: new Array(MAX_AO),
}

const getType = (chunk: Chunk, world: World, x: number, y: number, z: number) => {
    // if within chunk
    if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
        return chunk.getType(x, y, z)
    }
    
    // if outside of chunk, get from world
    return world.getType(x + chunk.worldPositionOffset.x, y + chunk.worldPositionOffset.y, z + chunk.worldPositionOffset.z)
}

const MARCH_DIRECTIONS = [
    new Vector3(1, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, 0, 1),
]

const vertexAmbientOcclusion = (side1: number, side2: number, corner: number) => {
    if (side1 && side2) {
        return 0
    }

    return (3 - (side1 + side2 + corner)) / 3
}

const _blockPosition: Vector3Tuple = [0, 0, 0]
const _ao_grid = new Uint32Array(9)

export const mesh = (chunk: Chunk, world: World, blockRegistry: BlockRegistry): CulledMesherResult => {
    let positionsIndex = 0
    let indicesIndex = 0
    let normalsIndex = 0
    let uvIndex = 0
    let texIndex = 0
    let ambientOcclusionIndex = 0

    // march over the chunk, comparing neighbouring blocks in px, py, pz directions
    for (let x = -1; x < CHUNK_SIZE; x++) {
        for (let z = -1; z < CHUNK_SIZE; z++) {
            for (let y = -1; y < CHUNK_SIZE; y++) {
                if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) {
                    continue
                }

                const marchBlockType = getType(chunk, world, x, y, z)
                const marchBlockSolid = marchBlockType !== 0

                for (let dir = 0; dir < 3; dir++) {
                    const marchDirection = MARCH_DIRECTIONS[dir]

                    const marchNeighbourX = x + marchDirection.x
                    const marchNeighbourY = y + marchDirection.y
                    const marchNeighbourZ = z + marchDirection.z

                    const marchNeighbourBlockType = getType(
                        chunk,
                        world,
                        marchNeighbourX,
                        marchNeighbourY,
                        marchNeighbourZ,
                    )
                    const marchNeighbourBlockSolid = marchNeighbourBlockType !== 0

                    if (marchBlockSolid === marchNeighbourBlockSolid) continue

                    const side = marchBlockSolid ? 0 : 1
                    const faceBlockType = side ? marchNeighbourBlockType : marchBlockType

                    const face = FACES[dir][side]
                    const [dx, dy, dz] = FACE_NORMALS[face]
                    const [ux, uy, uz] = DIRECTION_VECTORS[dir][side]
                    const [vx, vy, vz] = DIRECTION_VECTORS[dir][side ^ 1]

                    // positions
                    // use marchNeighbourXYZ as the first vertex position
                    _opaqueBuffer.positions[positionsIndex++] = marchNeighbourX
                    _opaqueBuffer.positions[positionsIndex++] = marchNeighbourY
                    _opaqueBuffer.positions[positionsIndex++] = marchNeighbourZ

                    _opaqueBuffer.positions[positionsIndex++] = marchNeighbourX + ux
                    _opaqueBuffer.positions[positionsIndex++] = marchNeighbourY + uy
                    _opaqueBuffer.positions[positionsIndex++] = marchNeighbourZ + uz

                    _opaqueBuffer.positions[positionsIndex++] = marchNeighbourX + ux + vx
                    _opaqueBuffer.positions[positionsIndex++] = marchNeighbourY + uy + vy
                    _opaqueBuffer.positions[positionsIndex++] = marchNeighbourZ + uz + vz

                    _opaqueBuffer.positions[positionsIndex++] = marchNeighbourX + vx
                    _opaqueBuffer.positions[positionsIndex++] = marchNeighbourY + vy
                    _opaqueBuffer.positions[positionsIndex++] = marchNeighbourZ + vz

                    // normals
                    _opaqueBuffer.normals[normalsIndex++] = dx
                    _opaqueBuffer.normals[normalsIndex++] = dy
                    _opaqueBuffer.normals[normalsIndex++] = dz

                    _opaqueBuffer.normals[normalsIndex++] = dx
                    _opaqueBuffer.normals[normalsIndex++] = dy
                    _opaqueBuffer.normals[normalsIndex++] = dz

                    _opaqueBuffer.normals[normalsIndex++] = dx
                    _opaqueBuffer.normals[normalsIndex++] = dy
                    _opaqueBuffer.normals[normalsIndex++] = dz

                    _opaqueBuffer.normals[normalsIndex++] = dx
                    _opaqueBuffer.normals[normalsIndex++] = dy
                    _opaqueBuffer.normals[normalsIndex++] = dz

                    // uvs
                    const uvs = FACE_TEXTURE_UVS[face]
                    _opaqueBuffer.uv[uvIndex++] = uvs[0]
                    _opaqueBuffer.uv[uvIndex++] = uvs[1]
                    _opaqueBuffer.uv[uvIndex++] = uvs[2]
                    _opaqueBuffer.uv[uvIndex++] = uvs[3]
                    _opaqueBuffer.uv[uvIndex++] = uvs[4]
                    _opaqueBuffer.uv[uvIndex++] = uvs[5]
                    _opaqueBuffer.uv[uvIndex++] = uvs[6]
                    _opaqueBuffer.uv[uvIndex++] = uvs[7]

                    // tex
                    const faceBlockTypeDetails = blockRegistry.get(faceBlockType)

                    if (faceBlockTypeDetails) {
                        const texture = faceBlockTypeDetails.texture
                        for (let i = 0; i < 4; i++) {
                            _opaqueBuffer.tex[texIndex++] = texture.x
                            _opaqueBuffer.tex[texIndex++] = texture.y
                            _opaqueBuffer.tex[texIndex++] = texture.width
                            _opaqueBuffer.tex[texIndex++] = texture.height
                        }
                    } else {
                        for (let i = 0; i < 4; i++) {
                            // todo: error texture
                            _opaqueBuffer.tex[texIndex++] = 0
                            _opaqueBuffer.tex[texIndex++] = 0
                            _opaqueBuffer.tex[texIndex++] = 0
                            _opaqueBuffer.tex[texIndex++] = 0
                        }
                    }

                    // get the block position, used for ao calculations
                    _blockPosition[0] = x
                    _blockPosition[1] = y
                    _blockPosition[2] = z
                    _blockPosition[dir] += side
                    const [blockPositionX, blockPositionY, blockPositionZ] = _blockPosition

                    const aoGrid = _ao_grid

                    let aoGridIndex = 0
                    for (let q = -1; q < 2; q++) {
                        for (let p = -1; p < 2; p++) {
                            const aoNeighbourX = blockPositionX + dx + ux * p + vx * q
                            const aoNeighbourY = blockPositionY + dy + uy * p + vy * q
                            const aoNeighbourZ = blockPositionZ + dz + uz * p + vz * q

                            const aoNeighbourBlockType = getType(
                                chunk,
                                world,
                                aoNeighbourX,
                                aoNeighbourY,
                                aoNeighbourZ,
                            )
                            const aoNeighbourSolid = aoNeighbourBlockType !== 0

                            aoGrid[aoGridIndex] = aoNeighbourSolid ? 1 : 0

                            aoGridIndex++
                        }
                    }

                    // calculate ambient occlusion for each vertex
                    const ao00 = vertexAmbientOcclusion(aoGrid[3], aoGrid[1], aoGrid[0])
                    const ao01 = vertexAmbientOcclusion(aoGrid[1], aoGrid[5], aoGrid[2])
                    const ao10 = vertexAmbientOcclusion(aoGrid[5], aoGrid[7], aoGrid[8])
                    const ao11 = vertexAmbientOcclusion(aoGrid[3], aoGrid[7], aoGrid[6])

                    // push ambient occlusion
                    _opaqueBuffer.ambientOcclusion[ambientOcclusionIndex++] = ao00
                    _opaqueBuffer.ambientOcclusion[ambientOcclusionIndex++] = ao01
                    _opaqueBuffer.ambientOcclusion[ambientOcclusionIndex++] = ao10
                    _opaqueBuffer.ambientOcclusion[ambientOcclusionIndex++] = ao11

                    /*
                     * make two triangles for the face
                     * d --- c
                     * |     |
                     * a --- b
                     */
                    const index = (positionsIndex + 1) / 3 - 4
                    const a = index
                    const b = index + 1
                    const c = index + 2
                    const d = index + 3

                    /**
                     * @see https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/
                     */
                    if (ao00 + ao10 > ao11 + ao01) {
                        // flipped quad
                        _opaqueBuffer.indices[indicesIndex++] = a
                        _opaqueBuffer.indices[indicesIndex++] = b
                        _opaqueBuffer.indices[indicesIndex++] = c

                        _opaqueBuffer.indices[indicesIndex++] = a
                        _opaqueBuffer.indices[indicesIndex++] = c
                        _opaqueBuffer.indices[indicesIndex++] = d
                    } else {
                        // normal quad
                        _opaqueBuffer.indices[indicesIndex++] = a
                        _opaqueBuffer.indices[indicesIndex++] = b
                        _opaqueBuffer.indices[indicesIndex++] = d

                        _opaqueBuffer.indices[indicesIndex++] = b
                        _opaqueBuffer.indices[indicesIndex++] = c
                        _opaqueBuffer.indices[indicesIndex++] = d
                    }
                }
            }
        }
    }

    return {
        positions: new Float32Array(_opaqueBuffer.positions.slice(0, positionsIndex)),
        indices: new Uint32Array(_opaqueBuffer.indices.slice(0, indicesIndex)),
        normals: new Float32Array(_opaqueBuffer.normals.slice(0, normalsIndex)),
        uv: new Float32Array(_opaqueBuffer.uv.slice(0, uvIndex)),
        tex: new Float32Array(_opaqueBuffer.tex.slice(0, texIndex)),
        ambientOcclusion: new Float32Array(_opaqueBuffer.ambientOcclusion.slice(0, ambientOcclusionIndex)),
    }
}
