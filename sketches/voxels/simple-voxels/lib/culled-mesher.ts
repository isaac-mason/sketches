import { Color, Vector3 } from 'three'
import { CHUNK_SIZE, Chunk, World } from './world'

const MAX_POSITIONS = 6 * 4 * 3 * CHUNK_SIZE ** 3
const MAX_INDICES = 6 * 2 * 3 * CHUNK_SIZE ** 3
const MAX_NORMALS = 6 * 4 * 3 * CHUNK_SIZE ** 3
const MAX_COLORS = 6 * 4 * 3 * CHUNK_SIZE ** 3
const MAX_AMBIENT_OCCLUSION = 6 * 4 * CHUNK_SIZE ** 3

// pre-allocate a worst-case sized buffer for the mesher result
const _buffer = {
    positions: new Array(MAX_POSITIONS),
    indices: new Array(MAX_INDICES),
    normals: new Array(MAX_NORMALS),
    colors: new Array(MAX_COLORS),
    ambientOcclusion: new Array(MAX_AMBIENT_OCCLUSION),
}

// cache conversion of hex colors to rgb for vertex colors
const colorCache = new Map<number, [r: number, g: number, b: number]>()

const _color = new Color()

const _blockPosition = [0, 0, 0]
const _marchNeighbourPosition = [0, 0, 0]

type BlockValue = { solid: boolean; color: number }
const _marchValue: BlockValue = { solid: false, color: 0 }
const _marchNeighbourValue: BlockValue = { solid: false, color: 0 }
const _aoNeighbourValue: BlockValue = { solid: false, color: 0 }
const _worldPos = new Vector3()

const _ao_grid = new Uint32Array(9)

const vertexAmbientOcclusion = (side1: number, side2: number, corner: number) => {
    if (side1 && side2) {
        return 0
    }

    return (3 - (side1 + side2 + corner)) / 3
}

// precompute direction vectors
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
    Current: 0,
    Next: 1,
}

const FACES: { [axis: number]: { [side: number]: number } } = {
    [AXIS.X]: { [SIDE.Current]: FACE.EAST, [SIDE.Next]: FACE.WEST },
    [AXIS.Y]: { [SIDE.Current]: FACE.UP, [SIDE.Next]: FACE.DOWN },
    [AXIS.Z]: { [SIDE.Current]: FACE.SOUTH, [SIDE.Next]: FACE.NORTH },
}

const FACE_NORMALS: { [face: number]: [number, number, number] } = {
    [FACE.NORTH]: [0, 0, -1],
    [FACE.SOUTH]: [0, 0, 1],
    [FACE.EAST]: [1, 0, 0],
    [FACE.WEST]: [-1, 0, 0],
    [FACE.UP]: [0, 1, 0],
    [FACE.DOWN]: [0, -1, 0],
}

type ChunkNeighbours = {
    nx?: Chunk
    ny?: Chunk
    nz?: Chunk
    px?: Chunk
    py?: Chunk
    pz?: Chunk
}

const getBlock = (
    cx: number,
    cy: number,
    cz: number,
    chunk: Chunk,
    world: World,
    neighbours: ChunkNeighbours,
    chunkOffset: Vector3,
    out: BlockValue,
) => {
    // if within chunk bounds, use the current chunk.
    if (cx >= 0 && cx < CHUNK_SIZE && cy >= 0 && cy < CHUNK_SIZE && cz >= 0 && cz < CHUNK_SIZE) {
        out.solid = chunk.getSolid(cx, cy, cz)
        out.color = out.solid ? chunk.getColor(cx, cy, cz) : 0

        return out
    }

    // we're out-of-bounds, so we need to determine the neighbor chunk.
    // determine local coordinate and neighbor offset for each axis.
    let offsetX = 0
    let offsetY = 0
    let offsetZ = 0
    let localX = cx
    let localY = cy
    let localZ = cz

    if (cx < 0) {
        offsetX = -1
        localX = cx + CHUNK_SIZE
    } else if (cx >= CHUNK_SIZE) {
        offsetX = 1
        localX = cx - CHUNK_SIZE
    }

    if (cy < 0) {
        offsetY = -1
        localY = cy + CHUNK_SIZE
    } else if (cy >= CHUNK_SIZE) {
        offsetY = 1
        localY = cy - CHUNK_SIZE
    }

    if (cz < 0) {
        offsetZ = -1
        localZ = cz + CHUNK_SIZE
    } else if (cz >= CHUNK_SIZE) {
        offsetZ = 1
        localZ = cz - CHUNK_SIZE
    }

    // count how many axes are out-of-bound.
    const nonZeroCount = (offsetX !== 0 ? 1 : 0) + (offsetY !== 0 ? 1 : 0) + (offsetZ !== 0 ? 1 : 0)

    // if exactly one axis is out-of-bound, we can use the direct neighbor.
    if (nonZeroCount === 1) {
        let neighborChunk: Chunk | undefined
        if (offsetX !== 0) {
            neighborChunk = offsetX === -1 ? neighbours.nx : neighbours.px
        } else if (offsetY !== 0) {
            neighborChunk = offsetY === -1 ? neighbours.ny : neighbours.py
        } else if (offsetZ !== 0) {
            neighborChunk = offsetZ === -1 ? neighbours.nz : neighbours.pz
        }

        if (neighborChunk) {
            out.solid = neighborChunk.getSolid(localX, localY, localZ)
            out.color = out.solid ? neighborChunk.getColor(localX, localY, localZ) : 0
            return out
        }
    }

    // for cases where two or three axes are out-of-bound (diagonals/edges)
    // or if the direct neighbor isn’t available, compute the world position.
    const worldPos = _worldPos.set(cx, cy, cz).add(chunkOffset)

    out.solid = world.getSolid(worldPos.x, worldPos.y, worldPos.z)
    out.color = out.solid ? (world.getColor(worldPos.x, worldPos.y, worldPos.z) ?? 0) : 0

    return out
}

const _chunkOffset = new Vector3()

export const mesh = (chunk: Chunk, world: World) => {
    const neighbours: ChunkNeighbours = {
        nx: world.getChunk(chunk.position.x - 1, chunk.position.y, chunk.position.z),
        ny: world.getChunk(chunk.position.x, chunk.position.y - 1, chunk.position.z),
        nz: world.getChunk(chunk.position.x, chunk.position.y, chunk.position.z - 1),
        px: world.getChunk(chunk.position.x + 1, chunk.position.y, chunk.position.z),
        py: world.getChunk(chunk.position.x, chunk.position.y + 1, chunk.position.z),
        pz: world.getChunk(chunk.position.x, chunk.position.y, chunk.position.z + 1),
    }

    let positionsIndex = 0
    let indicesIndex = 0
    let normalsIndex = 0
    let colorsIndex = 0
    let ambientOcclusionIndex = 0

    const chunkOffset = _chunkOffset.copy(chunk.position).multiplyScalar(CHUNK_SIZE)

    // march over the chunk, comparing neighbouring blocks in px, py, pz directions
    for (let x = -1; x < CHUNK_SIZE; x++) {
        for (let z = -1; z < CHUNK_SIZE; z++) {
            for (let y = -1; y < CHUNK_SIZE; y++) {
                if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) {
                    continue
                }

                const marchValue = getBlock(x, y, z, chunk, world, neighbours, chunkOffset, _marchValue)

                for (let dir = 0; dir < 3; dir++) {
                    _marchNeighbourPosition[0] = x
                    _marchNeighbourPosition[1] = y
                    _marchNeighbourPosition[2] = z
                    _marchNeighbourPosition[dir]++
                    const [marchNeighbourX, marchNeighbourY, marchNeighbourZ] = _marchNeighbourPosition

                    const marchNeighbourValue = getBlock(
                        marchNeighbourX,
                        marchNeighbourY,
                        marchNeighbourZ,
                        chunk,
                        world,
                        neighbours,
                        chunkOffset,
                        _marchNeighbourValue,
                    )

                    if (marchValue.solid === marchNeighbourValue.solid) continue

                    const side = !marchValue.solid ? 1 : 0
                    const currentValue = side ? marchNeighbourValue : marchValue

                    const face = FACES[dir][side]
                    const [dx, dy, dz] = FACE_NORMALS[face]
                    const [ux, uy, uz] = DIRECTION_VECTORS[dir][side]
                    const [vx, vy, vz] = DIRECTION_VECTORS[dir][side ^ 1]

                    // positions
                    // use marchNeighbourXYZ as the first vertex position
                    _buffer.positions[positionsIndex++] = marchNeighbourX
                    _buffer.positions[positionsIndex++] = marchNeighbourY
                    _buffer.positions[positionsIndex++] = marchNeighbourZ

                    _buffer.positions[positionsIndex++] = marchNeighbourX + ux
                    _buffer.positions[positionsIndex++] = marchNeighbourY + uy
                    _buffer.positions[positionsIndex++] = marchNeighbourZ + uz

                    _buffer.positions[positionsIndex++] = marchNeighbourX + ux + vx
                    _buffer.positions[positionsIndex++] = marchNeighbourY + uy + vy
                    _buffer.positions[positionsIndex++] = marchNeighbourZ + uz + vz

                    _buffer.positions[positionsIndex++] = marchNeighbourX + vx
                    _buffer.positions[positionsIndex++] = marchNeighbourY + vy
                    _buffer.positions[positionsIndex++] = marchNeighbourZ + vz

                    // normals
                    _buffer.normals[normalsIndex++] = dx
                    _buffer.normals[normalsIndex++] = dy
                    _buffer.normals[normalsIndex++] = dz

                    _buffer.normals[normalsIndex++] = dx
                    _buffer.normals[normalsIndex++] = dy
                    _buffer.normals[normalsIndex++] = dz

                    _buffer.normals[normalsIndex++] = dx
                    _buffer.normals[normalsIndex++] = dy
                    _buffer.normals[normalsIndex++] = dz

                    _buffer.normals[normalsIndex++] = dx
                    _buffer.normals[normalsIndex++] = dy
                    _buffer.normals[normalsIndex++] = dz

                    // colors
                    const colorHex = currentValue.color
                    let color = colorCache.get(colorHex)

                    if (color === undefined) {
                        _color.setHex(colorHex)
                        color = [_color.r, _color.g, _color.b]
                        colorCache.set(colorHex, color)
                    }

                    const [colorR, colorG, colorB] = color

                    _buffer.colors[colorsIndex++] = colorR
                    _buffer.colors[colorsIndex++] = colorG
                    _buffer.colors[colorsIndex++] = colorB

                    _buffer.colors[colorsIndex++] = colorR
                    _buffer.colors[colorsIndex++] = colorG
                    _buffer.colors[colorsIndex++] = colorB

                    _buffer.colors[colorsIndex++] = colorR
                    _buffer.colors[colorsIndex++] = colorG
                    _buffer.colors[colorsIndex++] = colorB

                    _buffer.colors[colorsIndex++] = colorR
                    _buffer.colors[colorsIndex++] = colorG
                    _buffer.colors[colorsIndex++] = colorB

                    /*
                     * Calculate ambient occlusion for each vertex
                     *
                     *  . --- . --- . --- .
                     *  |  6  |  7  |  8  |
                     *  . --- d --- c --- .
                     *  |  3  |  4  |  5  |
                     *  . --- a --- b --- .
                     *  |  0  |  1  |  2  |
                     *  . --- . --- . --- .
                     */

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

                            const aoNeighbour = getBlock(
                                aoNeighbourX,
                                aoNeighbourY,
                                aoNeighbourZ,
                                chunk,
                                world,
                                neighbours,
                                chunkOffset,
                                _aoNeighbourValue,
                            )

                            aoGrid[aoGridIndex] = aoNeighbour.solid ? 1 : 0

                            aoGridIndex++
                        }
                    }

                    // calculate ambient occlusion for each vertex
                    const ao00 = vertexAmbientOcclusion(aoGrid[3], aoGrid[1], aoGrid[0])
                    const ao01 = vertexAmbientOcclusion(aoGrid[1], aoGrid[5], aoGrid[2])
                    const ao10 = vertexAmbientOcclusion(aoGrid[5], aoGrid[7], aoGrid[8])
                    const ao11 = vertexAmbientOcclusion(aoGrid[3], aoGrid[7], aoGrid[6])

                    // push ambient occlusion
                    _buffer.ambientOcclusion[ambientOcclusionIndex++] = ao00
                    _buffer.ambientOcclusion[ambientOcclusionIndex++] = ao01
                    _buffer.ambientOcclusion[ambientOcclusionIndex++] = ao10
                    _buffer.ambientOcclusion[ambientOcclusionIndex++] = ao11

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
                        _buffer.indices[indicesIndex++] = a
                        _buffer.indices[indicesIndex++] = b
                        _buffer.indices[indicesIndex++] = c

                        _buffer.indices[indicesIndex++] = a
                        _buffer.indices[indicesIndex++] = c
                        _buffer.indices[indicesIndex++] = d
                    } else {
                        // normal quad
                        _buffer.indices[indicesIndex++] = a
                        _buffer.indices[indicesIndex++] = b
                        _buffer.indices[indicesIndex++] = d

                        _buffer.indices[indicesIndex++] = b
                        _buffer.indices[indicesIndex++] = c
                        _buffer.indices[indicesIndex++] = d
                    }
                }
            }
        }
    }

    return {
        positions: new Float32Array(_buffer.positions.slice(0, positionsIndex)),
        indices: new Uint32Array(_buffer.indices.slice(0, indicesIndex)),
        normals: new Float32Array(_buffer.normals.slice(0, normalsIndex)),
        colors: new Float32Array(_buffer.colors.slice(0, colorsIndex)),
        ambientOcclusion: new Float32Array(_buffer.ambientOcclusion.slice(0, ambientOcclusionIndex)),
    }
}
