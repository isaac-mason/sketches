import { Raw } from './raw'
import { Vector3Tuple } from './types'

export const vec3 = {
    tupleToJolt: (tuple: Vector3Tuple) => new Raw.module.Vec3(...tuple),
    threeToJolt: (vector: THREE.Vector3) => new Raw.module.Vec3(vector.x, vector.y, vector.z),
}
