import { Matrix3, Object3D, Quaternion, Vector3 } from 'three'
import Rapier from '@dimforge/rapier3d-compat'

const getVelocityAtWorldPoint_position = new Vector3()
const getVelocityAtWorldPoint_angvel = new Vector3()
const getVelocityAtWorldPoint_linvel = new Vector3()

export const getVelocityAtWorldPoint = (
    rigidBody: Rapier.RigidBody,
    worldPoint: Vector3,
    target = new Vector3()
): Vector3 => {
    const r = target

    const position = getVelocityAtWorldPoint_position.copy(
        rigidBody.translation() as Vector3
    )
    const angvel = getVelocityAtWorldPoint_angvel.copy(
        rigidBody.angvel() as Vector3
    )
    const linvel = getVelocityAtWorldPoint_linvel.copy(
        rigidBody.linvel() as Vector3
    )

    r.subVectors(worldPoint, position)
    r.crossVectors(angvel, r)
    r.add(linvel)

    // const result = linvel.add(new Vector3().copy(r).cross(angvel))
    return r
}

export const pointToWorldFrame = (
    rigidBody: Rapier.RigidBody,
    localPoint: Vector3,
    target = new Vector3()
): Vector3 => {
    target.copy(localPoint)
    target
        .applyQuaternion(
            new Quaternion().copy(rigidBody.rotation() as Quaternion)
        )
        .add(rigidBody.translation() as Vector3)
    return target
}

export const vectorToLocalFrame = (
    object: Rapier.RigidBody | Object3D,
    worldVector: Vector3,
    target = new Vector3()
): Vector3 => {
    return target
        .copy(worldVector)
        .applyQuaternion(
            new Quaternion()
                .copy(
                    object instanceof Object3D
                        ? object.quaternion
                        : (object.rotation() as Quaternion)
                )
                .conjugate()
        )
}

export const vectorToWorldFrame = (
    object: Rapier.RigidBody | Object3D,
    localVector: Vector3,
    target = new Vector3()
): Vector3 => {
    return target
        .copy(localVector)
        .applyQuaternion(
            new Quaternion().copy(
                object instanceof Object3D
                    ? object.quaternion
                    : (object.rotation() as Quaternion)
            )
        )
}

// get one of the wheel axes, world-oriented
export const getVehicleAxisWorld = (
    chassisBody: Rapier.RigidBody,
    axisIndex: number,
    result = new Vector3()
): Vector3 => {
    result.set(
        axisIndex === 0 ? 1 : 0,
        axisIndex === 1 ? 1 : 0,
        axisIndex === 2 ? 1 : 0
    )
    return vectorToWorldFrame(chassisBody, result, result)
}

// bilateral constraint between two dynamic objects
const resolveSingleBilateralConstraint_vel1 = new Vector3()
const resolveSingleBilateralConstraint_vel2 = new Vector3()
const resolveSingleBilateralConstraint_vel = new Vector3()

export const resolveSingleBilateralConstraint = (
    body1: Rapier.RigidBody,
    pos1: Vector3,
    body2: Rapier.RigidBody,
    pos2: Vector3,
    normal: Vector3
): number => {
    const normalLenSqr = normal.lengthSq()
    if (normalLenSqr > 1.1) {
        return 0 // no impulse
    }

    const vel1 = resolveSingleBilateralConstraint_vel1
    const vel2 = resolveSingleBilateralConstraint_vel2
    const vel = resolveSingleBilateralConstraint_vel

    getVelocityAtWorldPoint(body1, pos1, vel1)
    getVelocityAtWorldPoint(body2, pos2, vel2)

    vel.subVectors(vel1, vel2)

    const rel_vel = normal.dot(vel)

    const contactDamping = 0.2
    const massTerm = 1 / (body1.mass() + body2.mass())
    const impulse = -contactDamping * rel_vel * massTerm

    return impulse
}

// set Matrix3 rotation from quaternion
export const setMatrix3RotationFromQuaternion = (
    m: Matrix3,
    q: Quaternion
): void => {
    const x = q.x
    const y = q.y
    const z = q.z
    const w = q.w
    const x2 = x + x
    const y2 = y + y
    const z2 = z + z
    const xx = x * x2
    const xy = x * y2
    const xz = x * z2
    const yy = y * y2
    const yz = y * z2
    const zz = z * z2
    const wx = w * x2
    const wy = w * y2
    const wz = w * z2
    const e = m.elements

    e[3 * 0 + 0] = 1 - (yy + zz)
    e[3 * 0 + 1] = xy - wz
    e[3 * 0 + 2] = xz + wy

    e[3 * 1 + 0] = xy + wz
    e[3 * 1 + 1] = 1 - (xx + zz)
    e[3 * 1 + 2] = yz - wx

    e[3 * 2 + 0] = xz - wy
    e[3 * 2 + 1] = yz + wx
    e[3 * 2 + 2] = 1 - (xx + yy)
}

// matrix-vector multiplication
export const matrixVectorMultiplication = (
    m: Matrix3,
    v: Vector3,
    target = new Vector3()
): Vector3 => {
    const e = m.elements

    const x = v.x
    const y = v.y
    const z = v.z

    target.x = e[0] * x + e[1] * y + e[2] * z
    target.y = e[3] * x + e[4] * y + e[5] * z
    target.z = e[6] * x + e[7] * y + e[8] * z

    return target
}

// scale matrix3 columns of by vector3
const scaleMatrix3ByVector3 = (m: Matrix3, vector: Vector3): void => {
    const e = m.elements
    for (let i = 0; i !== 3; i++) {
        e[3 * i + 0] = vector.x * e[3 * i + 0]
        e[3 * i + 1] = vector.y * e[3 * i + 1]
        e[3 * i + 2] = vector.z * e[3 * i + 2]
    }
}

// calculate inertia for an aabb
export const calculateAABBInertia = (
    halfExtents: Vector3,
    mass: number
): Vector3 => {
    const e = halfExtents
    return new Vector3(
        (1.0 / 12.0) * mass * (2 * e.y * 2 * e.y + 2 * e.z * 2 * e.z),
        (1.0 / 12.0) * mass * (2 * e.x * 2 * e.x + 2 * e.z * 2 * e.z),
        (1.0 / 12.0) * mass * (2 * e.y * 2 * e.y + 2 * e.x * 2 * e.x)
    )
}

// calculate inertia world
const calculateInertiaWorld_uiw_m1 = new Matrix3()
const calculateInertiaWorld_uiw_m2 = new Matrix3()
const calculateInertiaWorld_uiw_m3 = new Matrix3()

export const calculateInvInertiaWorld = (
    rigidBody: Rapier.RigidBody,
    invInertia: Vector3
): Matrix3 => {
    // const inertiaWorld = new Vector3()
    const invInertiaWorld = new Matrix3()

    const m1 = calculateInertiaWorld_uiw_m1
    const m2 = calculateInertiaWorld_uiw_m2
    const m3 = calculateInertiaWorld_uiw_m3

    setMatrix3RotationFromQuaternion(m1, rigidBody.rotation() as Quaternion)
    m2.copy(m1).transpose()
    scaleMatrix3ByVector3(m1, invInertia)
    invInertiaWorld.copy(m1).multiply(m2)

    return invInertiaWorld
}

// compute impulse denominator
const computeImpulseDenominator_r0 = new Vector3()
const computeImpulseDenominator_c0 = new Vector3()
const computeImpulseDenominator_vec = new Vector3()
const computeImpulseDenominator_m = new Vector3()

export const computeImpulseDenominator = (
    body: Rapier.RigidBody,
    halfExtents: Vector3,
    pos: Vector3,
    normal: Vector3
): number => {
    const r0 = computeImpulseDenominator_r0
    const c0 = computeImpulseDenominator_c0
    const vec = computeImpulseDenominator_vec
    const m = computeImpulseDenominator_m

    r0.subVectors(pos, body.translation() as Vector3)
    c0.crossVectors(r0, normal)

    const inertia = calculateAABBInertia(halfExtents, body.mass())
    const invInertiaWorld = calculateInvInertiaWorld(body, inertia)

    matrixVectorMultiplication(invInertiaWorld, c0, m)
    vec.crossVectors(m, r0)

    return body.mass() + normal.dot(vec)
}

// calculate rolling friction
const calcRollingFriction_vel1 = new Vector3()
const calcRollingFriction_vel2 = new Vector3()
const calcRollingFriction_vel = new Vector3()

export const calcRollingFriction = (
    body0: Rapier.RigidBody,
    body1: Rapier.RigidBody,
    frictionPosWorld: Vector3,
    frictionDirectionWorld: Vector3,
    maxImpulse: number
): number => {
    let j1 = 0
    const contactPosWorld = frictionPosWorld

    const vel1 = calcRollingFriction_vel1
    const vel2 = calcRollingFriction_vel2
    const vel = calcRollingFriction_vel

    vel1.copy(getVelocityAtWorldPoint(body0, contactPosWorld))
    vel2.copy(getVelocityAtWorldPoint(body1, contactPosWorld))
    vel.subVectors(vel1, vel2)

    const vrel = frictionDirectionWorld.dot(vel)

    // hack: hard-coding incorrect half extents for estimated inertia
    const todoHalfExtents = new Vector3(2, 0.5, 1)

    const denom0 = computeImpulseDenominator(
        body0,
        todoHalfExtents,
        frictionPosWorld,
        frictionDirectionWorld
    )
    const denom1 = computeImpulseDenominator(
        body1,
        todoHalfExtents,
        frictionPosWorld,
        frictionDirectionWorld
    )
    const relaxation = 1
    const jacDiagABInv = relaxation / (denom0 + denom1)

    // calculate j that moves us to zero relative velocity
    j1 = -vrel * jacDiagABInv

    if (maxImpulse < j1) {
        j1 = maxImpulse
    }
    if (j1 < -maxImpulse) {
        j1 = -maxImpulse
    }

    return j1
}
