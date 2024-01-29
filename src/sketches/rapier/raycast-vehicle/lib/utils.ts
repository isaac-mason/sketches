import Rapier from '@dimforge/rapier3d-compat'
import { Matrix3, Object3D, Quaternion, Vector3 } from 'three'

const getVelocityAtWorldPoint_r = new Vector3()
const getVelocityAtWorldPoint_position = new Vector3()
const getVelocityAtWorldPoint_angvel = new Vector3()
const getVelocityAtWorldPoint_linvel = new Vector3()

export const getVelocityAtWorldPoint = (rigidBody: Rapier.RigidBody, worldPoint: Vector3, target = new Vector3()): Vector3 => {
    const r = getVelocityAtWorldPoint_r.set(0, 0, 0)

    const position = getVelocityAtWorldPoint_position.copy(rigidBody.translation() as Vector3)
    const angvel = getVelocityAtWorldPoint_angvel.copy(rigidBody.angvel() as Vector3)
    const linvel = getVelocityAtWorldPoint_linvel.copy(rigidBody.linvel() as Vector3)

    r.subVectors(worldPoint, position)
    target.crossVectors(angvel, r)
    target.addVectors(linvel, target)

    return target
}

const pointToWorldFrame_quaternion = new Quaternion()

export const pointToWorldFrame = (object: Rapier.RigidBody | Object3D, localPoint: Vector3, target = new Vector3()): Vector3 => {
    target.copy(localPoint)

    const quaternion = pointToWorldFrame_quaternion.copy(
        object instanceof Object3D ? object.quaternion : (object.rotation() as Quaternion),
    )

    const position = object instanceof Object3D ? object.position : (object.translation() as Vector3)

    return target.copy(localPoint).applyQuaternion(quaternion).add(position)
}

const vectorToLocalFrame_quaternion = new Quaternion()

export const vectorToLocalFrame = (
    object: Rapier.RigidBody | Object3D,
    worldVector: Vector3,
    target = new Vector3(),
): Vector3 => {
    const quaternion = vectorToLocalFrame_quaternion.copy(
        object instanceof Object3D ? object.quaternion : (object.rotation() as Quaternion),
    )

    quaternion.conjugate()

    return target.copy(worldVector).applyQuaternion(quaternion)
}

const vectorToWorldFrame_quaternion = new Quaternion()

export const vectorToWorldFrame = (
    object: Rapier.RigidBody | Object3D,
    localVector: Vector3,
    target = new Vector3(),
): Vector3 => {
    const quaternion = vectorToWorldFrame_quaternion.copy(
        object instanceof Object3D ? object.quaternion : (object.rotation() as Quaternion),
    )

    return target.copy(localVector).applyQuaternion(quaternion)
}

// get one of the wheel axes, world-oriented
export const getVehicleAxisWorld = (chassisBody: Rapier.RigidBody, axisIndex: number, result = new Vector3()): Vector3 => {
    result.set(axisIndex === 0 ? 1 : 0, axisIndex === 1 ? 1 : 0, axisIndex === 2 ? 1 : 0)
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
    normal: Vector3,
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

    const body1InvMass = body1.invMass()
    const body2InvMass = body2.invMass()

    const massTerm = 1 / (body1InvMass + body2InvMass)
    const impulse = -contactDamping * rel_vel * massTerm

    return impulse
}

// compute impulse denominator
const computeImpulseDenominator_r0 = new Vector3()
const computeImpulseDenominator_c0 = new Vector3()
const computeImpulseDenominator_vec = new Vector3()
const computeImpulseDenominator_m = new Vector3()
const computeImpulseDenominator_effectiveWorldInvInertiaSqrt = new Matrix3()

const computeImpulseDenominator = (body: Rapier.RigidBody, pos: Vector3, normal: Vector3): number => {
    const r0 = computeImpulseDenominator_r0
    const c0 = computeImpulseDenominator_c0
    const vec = computeImpulseDenominator_vec
    const m = computeImpulseDenominator_m

    const effectiveWorldInvInertiaSqrtSpdMatrix3 = body.effectiveWorldInvInertiaSqrt()

    // prettier-ignore
    const effectiveWorldInvInertiaSqrt = computeImpulseDenominator_effectiveWorldInvInertiaSqrt.set(
        effectiveWorldInvInertiaSqrtSpdMatrix3.m11, effectiveWorldInvInertiaSqrtSpdMatrix3.m12, effectiveWorldInvInertiaSqrtSpdMatrix3.m13,
        effectiveWorldInvInertiaSqrtSpdMatrix3.m23, effectiveWorldInvInertiaSqrtSpdMatrix3.m22, effectiveWorldInvInertiaSqrtSpdMatrix3.m23,
        effectiveWorldInvInertiaSqrtSpdMatrix3.m33, effectiveWorldInvInertiaSqrtSpdMatrix3.m12, effectiveWorldInvInertiaSqrtSpdMatrix3.m33,
    )

    r0.subVectors(pos, body.translation() as Vector3)

    c0.crossVectors(r0, normal)

    m.copy(c0).applyMatrix3(effectiveWorldInvInertiaSqrt)

    vec.crossVectors(m, r0)

    return body.invMass() + normal.dot(vec)
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
    maxImpulse: number,
): number => {
    let j1 = 0
    const contactPosWorld = frictionPosWorld

    const vel1 = calcRollingFriction_vel1
    const vel2 = calcRollingFriction_vel2
    const vel = calcRollingFriction_vel

    getVelocityAtWorldPoint(body0, contactPosWorld, vel1)
    getVelocityAtWorldPoint(body1, contactPosWorld, vel2)
    vel.subVectors(vel1, vel2)

    const vrel = frictionDirectionWorld.dot(vel)

    const denom0 = computeImpulseDenominator(body0, frictionPosWorld, frictionDirectionWorld)

    const denom1 = computeImpulseDenominator(body1, frictionPosWorld, frictionDirectionWorld)

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
