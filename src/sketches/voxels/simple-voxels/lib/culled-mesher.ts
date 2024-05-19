import { Color, Vector3 } from 'three'
import { CHUNK_SIZE, Chunk, World } from './world'

export type CulledMesherChunkResult = {
    id: string
    positions: Float32Array
    indices: Uint32Array
    normals: Float32Array
    colors: Float32Array
    ambientOcclusion: Float32Array
}

const VOXEL_FACE_DIRECTIONS: {
    // direction of the face / normal
    dx: number
    dy: number
    dz: number

    // local position offset
    lx: number
    ly: number
    lz: number

    // uvs of the faces
    ux: number
    uy: number
    uz: number
    vx: number
    vy: number
    vz: number
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
    },
]

const _color = new Color()

const _mesh_chunkLocalPosition = new Vector3()
const _mesh_worldPosition = new Vector3()
const _mesh_worldNeighbourPosition = new Vector3()
const _mesh_localNeighbourPosition = new Vector3()

const _ao_worldPosition = new Vector3()
const _ao_grid = new Uint32Array(9)

const vertexAmbientOcclusion = (side1: number, side2: number, corner: number) => {
    if (side1 && side2) {
        return 0
    }

    return (3 - (side1 + side2 + corner)) / 3
}

export const mesh = (chunk: Chunk, world: World): CulledMesherChunkResult => {
    const chunkX = chunk.position.x * CHUNK_SIZE
    const chunkY = chunk.position.y * CHUNK_SIZE
    const chunkZ = chunk.position.z * CHUNK_SIZE

    const positions: number[] = []
    const indices: number[] = []
    const normals: number[] = []
    const colors: number[] = []
    const ambientOcclusion: number[] = []

    const chunkLocalPosition = _mesh_chunkLocalPosition
    const worldPosition = _mesh_worldPosition
    const localNeighbourPosition = _mesh_localNeighbourPosition
    const worldNeighbourPosition = _mesh_worldNeighbourPosition

    const colorCache = new Map<number, [r: number, g: number, b: number]>()

    for (let localX = 0; localX < CHUNK_SIZE; localX++) {
        for (let localZ = 0; localZ < CHUNK_SIZE; localZ++) {
            for (let localY = 0; localY < CHUNK_SIZE; localY++) {
                /* skip air */
                chunkLocalPosition.set(localX, localY, localZ)

                if (!chunk.getSolid(chunkLocalPosition)) continue

                /* get voxel color */
                const colorHex = chunk.getColor(chunkLocalPosition)

                let color = colorCache.get(colorHex)

                if (!color) {
                    _color.setHex(colorHex)
                    color = [_color.r, _color.g, _color.b]
                    colorCache.set(colorHex, color)
                }

                const [colorR, colorG, colorB] = color

                /* check which faces are visible */
                const worldX = chunkX + localX
                const worldY = chunkY + localY
                const worldZ = chunkZ + localZ

                for (const voxelFaceDirection of VOXEL_FACE_DIRECTIONS) {
                    const { dx, dy, dz, lx, ly, lz, ux, uy, uz, vx, vy, vz } = voxelFaceDirection

                    localNeighbourPosition.set(localX + dx, localY + dy, localZ + dz)

                    /* skip creating faces when neighbour is solid */
                    let solid: boolean
                    if (
                        localNeighbourPosition.x < 0 ||
                        localNeighbourPosition.x >= CHUNK_SIZE ||
                        localNeighbourPosition.y < 0 ||
                        localNeighbourPosition.y >= CHUNK_SIZE ||
                        localNeighbourPosition.z < 0 ||
                        localNeighbourPosition.z >= CHUNK_SIZE
                    ) {
                        worldNeighbourPosition.set(worldX + dx, worldY + dy, worldZ + dz)
                        solid = world.getSolid(worldNeighbourPosition)
                    } else {
                        solid = chunk.getSolid(localNeighbourPosition)
                    }

                    if (solid) continue

                    worldPosition.set(worldX, worldY, worldZ)

                    /* create face */
                    const voxelFaceLocalX = localX + lx
                    const voxelFaceLocalY = localY + ly
                    const voxelFaceLocalZ = localZ + lz

                    // prettier-ignore
                    positions.push(
                        voxelFaceLocalX, voxelFaceLocalY, voxelFaceLocalZ,
                        voxelFaceLocalX + ux, voxelFaceLocalY + uy, voxelFaceLocalZ + uz,
                        voxelFaceLocalX + ux + vx, voxelFaceLocalY + uy + vy, voxelFaceLocalZ + uz + vz,
                        voxelFaceLocalX + vx, voxelFaceLocalY + vy, voxelFaceLocalZ + vz
                    )

                    normals.push(dx, dy, dz, dx, dy, dz, dx, dy, dz, dx, dy, dz)

                    colors.push(colorR, colorG, colorB, colorR, colorG, colorB, colorR, colorG, colorB, colorR, colorG, colorB)

                    /**
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

                    // calculate ambient occlusion grid
                    const aoGridWorldPosition = _ao_worldPosition
                    const aoGrid = _ao_grid

                    let aoGridIndex = 0
                    for (let q = -1; q < 2; q++) {
                        for (let p = -1; p < 2; p++) {
                            aoGridWorldPosition.copy(worldPosition)

                            aoGridWorldPosition.x += dx + ux * p + vx * q
                            aoGridWorldPosition.y += dy + uy * p + vy * q
                            aoGridWorldPosition.z += dz + uz * p + vz * q

                            const solid = world.getSolid(aoGridWorldPosition)

                            aoGrid[aoGridIndex] = solid ? 1 : 0

                            aoGridIndex++
                        }
                    }

                    // calculate ambient occlusion for each vertex
                    const ao00 = vertexAmbientOcclusion(aoGrid[3], aoGrid[1], aoGrid[0])
                    const ao01 = vertexAmbientOcclusion(aoGrid[1], aoGrid[5], aoGrid[2])
                    const ao10 = vertexAmbientOcclusion(aoGrid[5], aoGrid[7], aoGrid[8])
                    const ao11 = vertexAmbientOcclusion(aoGrid[3], aoGrid[7], aoGrid[6])

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
        id: chunk.id,
        positions: new Float32Array(positions),
        indices: new Uint32Array(indices),
        normals: new Float32Array(normals),
        colors: new Float32Array(colors),
        ambientOcclusion: new Float32Array(ambientOcclusion),
    }
}
