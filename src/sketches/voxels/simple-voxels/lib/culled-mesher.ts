import { Color, Vector3, Vector3Like } from 'three'
import { CHUNK_SIZE, Chunk, World } from './world'

export type CulledMesherChunkResult = {
    id: string
    positions: Float32Array
    indices: Uint32Array
    normals: Float32Array
    colors: Float32Array
    ambientOcclusion: Float32Array
}

const vertexAmbientOcclusion = (side1: number, side2: number, corner: number) => {
    if (side1 && side2) {
        return 0
    }

    return (3 - (side1 + side2 + corner)) / 3
}

const _voxelFaceAmbientOcclusionGrid_u = new Vector3()
const _voxelFaceAmbientOcclusionGrid_v = new Vector3()
const _voxelFaceAmbientOcclusionGrid_normal = new Vector3()

const _voxelFaceAmbientOcclusionGrid_vec3 = new Vector3()

const createVoxelFaceAmbientOcclusionGrid = (
    world: World,
    pos: Vector3Like,
    dir: (typeof VOXEL_FACE_DIRECTIONS)[number],
    outGrid: Uint32Array,
) => {
    const u = _voxelFaceAmbientOcclusionGrid_u.set(dir.ux, dir.uy, dir.uz)
    const v = _voxelFaceAmbientOcclusionGrid_v.set(dir.vx, dir.vy, dir.vz)
    const normal = _voxelFaceAmbientOcclusionGrid_normal.set(dir.nx, dir.ny, dir.nz)

    const vec3 = _voxelFaceAmbientOcclusionGrid_vec3

    let index = 0

    for (let q = -1; q < 2; q++) {
        for (let p = -1; p < 2; p++) {
            vec3.copy(pos)

            // vec3.x += normal.x
            // vec3.y += normal.y
            // vec3.z += normal.z

            // vec3.x += u.x * p
            // vec3.y += u.y * p
            // vec3.z += u.z * p

            // vec3.x += v.x * q
            // vec3.y += v.y * q
            // vec3.z += v.z * q

            vec3.x += normal.x + u.x * p + v.x * q
            vec3.y += normal.y + u.y * p + v.y * q
            vec3.z += normal.z + u.z * p + v.z * q

            const solid = world.getSolid(vec3)

            outGrid[index] = solid ? 1 : 0

            index++
        }
    }
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
const voxelFaceAmbientOcclusion_grid = new Uint32Array(9)

const voxelFaceAmbientOcclusion = (world: World, pos: Vector3Like, dir: (typeof VOXEL_FACE_DIRECTIONS)[number]) => {
    const grid = voxelFaceAmbientOcclusion_grid

    createVoxelFaceAmbientOcclusionGrid(world, pos, dir, grid)

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

const _color = new Color()

const _mesh_chunkLocalPosition = new Vector3()
const _mesh_worldPosition = new Vector3()
const _mesh_worldNeighbourPosition = new Vector3()
const _mesh_localNeighbourPosition = new Vector3()

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
    const worldNeighbourPosition = _mesh_worldNeighbourPosition
    const localNeighbourPosition = _mesh_localNeighbourPosition

    const colorCache = new Map<number, [r: number, g: number, b: number]>()

    for (let localX = 0; localX < CHUNK_SIZE; localX++) {
        for (let localZ = 0; localZ < CHUNK_SIZE; localZ++) {
            for (let localY = 0; localY < CHUNK_SIZE; localY++) {
                /* check if solid */
                chunkLocalPosition.set(localX, localY, localZ)

                const solid = chunk.getSolid(chunkLocalPosition)

                if (!solid) continue

                /* get color */
                const colorHex = chunk.getColor(chunkLocalPosition)

                let color = colorCache.get(colorHex)

                if (!color) {
                    _color.setHex(colorHex)
                    color = [_color.r, _color.g, _color.b]
                    colorCache.set(colorHex, color)
                }

                const [colorR, colorG, colorB] = color

                /* check neighbours */
                const worldX = chunkX + localX
                const worldY = chunkY + localY
                const worldZ = chunkZ + localZ

                for (const voxelFaceDirection of VOXEL_FACE_DIRECTIONS) {
                    const { dx, dy, dz, lx, ly, lz, ux, uy, uz, vx, vy, vz, nx, ny, nz } = voxelFaceDirection

                    let solid: boolean

                    /* prefer chunk.getSolid() when possible */
                    if (
                        localX + dx < 0 ||
                        localX + dx >= CHUNK_SIZE ||
                        localY + dy < 0 ||
                        localY + dy >= CHUNK_SIZE ||
                        localZ + dz < 0 ||
                        localZ + dz >= CHUNK_SIZE
                    ) {
                        worldNeighbourPosition.set(worldX + dx, worldY + dy, worldZ + dz)

                        solid = world.getSolid(worldNeighbourPosition)
                    } else {
                        localNeighbourPosition.set(localX + dx, localY + dy, localZ + dz)

                        solid = chunk.getSolid(localNeighbourPosition)
                    }

                    /* skip creating faces when neighbour is solid */
                    if (solid) continue

                    /* create face */
                    const voxelFaceLocalX = localX + lx
                    const voxelFaceLocalY = localY + ly
                    const voxelFaceLocalZ = localZ + lz

                    positions.push(voxelFaceLocalX, voxelFaceLocalY, voxelFaceLocalZ)
                    positions.push(voxelFaceLocalX + ux, voxelFaceLocalY + uy, voxelFaceLocalZ + uz)
                    positions.push(voxelFaceLocalX + ux + vx, voxelFaceLocalY + uy + vy, voxelFaceLocalZ + uz + vz)
                    positions.push(voxelFaceLocalX + vx, voxelFaceLocalY + vy, voxelFaceLocalZ + vz)

                    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz)

                    colors.push(colorR, colorG, colorB, colorR, colorG, colorB, colorR, colorG, colorB, colorR, colorG, colorB)

                    worldPosition.set(worldX, worldY, worldZ)

                    const ao = voxelFaceAmbientOcclusion(world, worldPosition, voxelFaceDirection)
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
        id: chunk.id,
        positions: new Float32Array(positions),
        indices: new Uint32Array(indices),
        normals: new Float32Array(normals),
        colors: new Float32Array(colors),
        ambientOcclusion: new Float32Array(ambientOcclusion),
    }
}
