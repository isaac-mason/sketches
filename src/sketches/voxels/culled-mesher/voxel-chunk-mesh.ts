import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial } from 'three'
import { VoxelChunk, VoxelChunkMeshData } from './voxel-types'
import { CHUNK_SIZE } from './voxel-utils'
import { VoxelWorld } from './voxel-world'

export class VoxelChunkMesh {
    geometry = new BufferGeometry()

    material = new MeshStandardMaterial({
        vertexColors: true,
    })

    mesh = new Mesh()

    constructor(
        public voxelWorld: VoxelWorld,
        public voxelChunk: VoxelChunk,
        public voxelChunkMeshData: VoxelChunkMeshData,
    ) {
        this.mesh.geometry = this.geometry
        this.mesh.material = this.material
    }

    update() {
        const {
            positions,
            indices,
            normals,
            colors,
            meta: [positionsCount, indicesCount, normalsCount, colorsCount],
        } = this.voxelChunkMeshData

        this.geometry.setIndex(new BufferAttribute(indices.slice(0, indicesCount), 1))
        this.geometry.setAttribute('position', new BufferAttribute(positions.slice(0, positionsCount), 3))
        this.geometry.setAttribute('normal', new BufferAttribute(normals.slice(0, normalsCount), 3))
        this.geometry.setAttribute('color', new BufferAttribute(colors.slice(0, colorsCount), 3))

        this.geometry.computeBoundingBox()
        this.geometry.computeBoundingSphere()

        this.mesh.position.set(
            this.voxelChunk.position[0] * CHUNK_SIZE,
            this.voxelChunk.position[1] * CHUNK_SIZE,
            this.voxelChunk.position[2] * CHUNK_SIZE,
        )
    }
}
