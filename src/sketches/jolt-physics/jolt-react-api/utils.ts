import Jolt from 'jolt-physics'
import * as THREE from 'three'
import { Raw } from './raw'
import { Vector3Tuple } from './types'

export const vec3 = {
    tupleToJolt: (tuple: Vector3Tuple) => new Raw.module.Vec3(...tuple),
    threeToJolt: (vector: THREE.Vector3) => new Raw.module.Vec3(vector.x, vector.y, vector.z),
    joltToThree: (vec: Jolt.Vec3, out = new THREE.Vector3()) => out.set(vec.GetX(), vec.GetY(), vec.GetZ()),
    joltToTuple: (vec: Jolt.Vec3) => [vec.GetX(), vec.GetY(), vec.GetZ()]
}

export const quat = {
    joltToThree: (quat: Jolt.Quat, out = new THREE.Quaternion()) => out.set(quat.GetX(), quat.GetY(), quat.GetZ(), quat.GetW()),
    joltToTuple: (quat: Jolt.Quat) => [quat.GetX(), quat.GetY(), quat.GetZ(), quat.GetW()]
}
