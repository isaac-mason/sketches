import { Vec3 } from '../core'

export const VOXEL_PHYSICS_WORLD_OFFSET = 0.5

export const worldVoxelPositionToPhysicsPosition = ([x, y, z]: Vec3): Vec3 => {
    return [x + VOXEL_PHYSICS_WORLD_OFFSET, y + VOXEL_PHYSICS_WORLD_OFFSET, z + VOXEL_PHYSICS_WORLD_OFFSET]
}
