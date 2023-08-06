import { CHUNK_SIZE } from '../core'
import { VoxelChunkMeshData } from './types'

const CHUNK_VOXELS = CHUNK_SIZE ** 3

const VOXEL_SIDES = 6
const VOXEL_SIDE_VERTICES = 4

const CHUNK_MESH_DATA_MAX_VERTICES = (Float32Array.BYTES_PER_ELEMENT * CHUNK_VOXELS * VOXEL_SIDES * VOXEL_SIDE_VERTICES * 3)
const CHUNK_MESH_DATA_MAX_AO = (Float32Array.BYTES_PER_ELEMENT * CHUNK_VOXELS * VOXEL_SIDES * VOXEL_SIDE_VERTICES)
const CHUNK_MESH_DATA_MAX_INDICES = (Uint32Array.BYTES_PER_ELEMENT * CHUNK_VOXELS * VOXEL_SIDES * 3 * 2)

export const emptyChunkMeshData = () => {
    // create buffers that can hold the maximum amount of data for a chunk
    const positionsBuffer = new SharedArrayBuffer(CHUNK_MESH_DATA_MAX_VERTICES)
    const indicesBuffer = new SharedArrayBuffer(CHUNK_MESH_DATA_MAX_INDICES)
    const normalsBuffer = new SharedArrayBuffer(CHUNK_MESH_DATA_MAX_VERTICES)
    const colorsBuffer = new SharedArrayBuffer(CHUNK_MESH_DATA_MAX_VERTICES)
    const ambientOcclusionBuffer = new SharedArrayBuffer(CHUNK_MESH_DATA_MAX_AO)
    const metaBuffer = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT * 5)

    const chunkMeshData: VoxelChunkMeshData = {
        positions: new Float32Array(positionsBuffer),
        positionsBuffer,
        indices: new Uint32Array(indicesBuffer),
        indicesBuffer,
        normals: new Float32Array(normalsBuffer),
        normalsBuffer,
        colors: new Float32Array(colorsBuffer),
        colorsBuffer,
        ambientOcclusion: new Float32Array(ambientOcclusionBuffer),
        ambientOcclusionBuffer,
        meta: new Uint32Array(metaBuffer),
        metaBuffer,
    }

    return chunkMeshData
}
