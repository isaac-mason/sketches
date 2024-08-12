
import { Vector3 } from 'three'
import { CHUNK_SIZE, Chunk, World } from '../../lib/world'

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

export const createChunkTrimesh = (world: World, chunk: Chunk) => {
    const chunkX = chunk.position.x * CHUNK_SIZE
    const chunkY = chunk.position.y * CHUNK_SIZE
    const chunkZ = chunk.position.z * CHUNK_SIZE

    const positions: number[] = []
    const indices: number[] = []

    const chunkLocalPosition = new Vector3()

    for (let localX = 0; localX < CHUNK_SIZE; localX++) {
        for (let localY = 0; localY < CHUNK_SIZE; localY++) {
            for (let localZ = 0; localZ < CHUNK_SIZE; localZ++) {
                chunkLocalPosition.set(localX, localY, localZ)

                if (!chunk.getSolid(chunkLocalPosition)) continue

                const worldX = chunkX + localX
                const worldY = chunkY + localY
                const worldZ = chunkZ + localZ

                for (const voxelFaceDirection of VOXEL_FACE_DIRECTIONS) {
                    const { dx, dy, dz, lx, ly, lz, ux, uy, uz, vx, vy, vz } = voxelFaceDirection

                    const solid = world.getSolid({ x: worldX + dx, y: worldY + dy, z: worldZ + dz })

                    if (solid) continue

                    const voxelFaceLocalX = localX + lx
                    const voxelFaceLocalY = localY + ly
                    const voxelFaceLocalZ = localZ + lz

                    positions.push(voxelFaceLocalX, voxelFaceLocalY, voxelFaceLocalZ)
                    positions.push(voxelFaceLocalX + ux, voxelFaceLocalY + uy, voxelFaceLocalZ + uz)
                    positions.push(voxelFaceLocalX + ux + vx, voxelFaceLocalY + uy + vy, voxelFaceLocalZ + uz + vz)
                    positions.push(voxelFaceLocalX + vx, voxelFaceLocalY + vy, voxelFaceLocalZ + vz)

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

                    indices.push(a, b, d, b, c, d)
                }
            }
        }
    }

    return {
        positions: new Float32Array(positions),
        indices: new Uint32Array(indices),
    }
}
