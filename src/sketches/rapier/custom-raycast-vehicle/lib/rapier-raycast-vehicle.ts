import Rapier from '@dimforge/rapier3d-compat'
import { ArrowHelper, Matrix3, Object3D, Quaternion, Vector3 } from 'three'

const directions = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]

const _updateWheelTransform_up = new Vector3()
const _updateWheelTransform_right = new Vector3()
const _updateWheelTransform_fwd = new Vector3()
const _updateWheelTransform_steeringOrn = new Quaternion()
const _updateWheelTransform_rotatingOrn = new Quaternion()
const _updateWheelTransform_chassisRigidBodyQuaternion = new Quaternion()

const _updateCurrentSpeed_chassisVelocity = new Vector3()
const _updateCurrentSpeed_forwardWorld = new Vector3()

const _updateWheelSuspension_denominator = new Vector3()
const _updateWheelSuspension_chassisVelocityAtContactPoint = new Vector3()
const _updateWheelSuspension_direction = new Vector3()
const _updateWheelSuspension_wheelRaycastArrowHelperDirection = new Vector3()

const _applyWheelSuspensionForce_impulse = new Vector3()
const _applyWheelSuspensionForce_rollInfluenceAdjustedWorldPos = new Vector3()

const _updateFriction_surfNormalWS_scaled_proj = new Vector3()
const _updateFriction_impulse = new Vector3()
const _updateFriction_sideImp = new Vector3()
const _updateFriction_worldPos = new Vector3()
const _updateFriction_relPos = new Vector3()
const _updateWheelRotation_hitNormalWorldScaledWithProj = new Vector3()
const _updateWheelRotation_fwd = new Vector3()
const _updateWheelRotation_vel = new Vector3()

export type VehicleState = {
    sliding: boolean

    currentVehicleSpeedKmHour: number
}

export type RaycastVehicleOptions = {
    world: Rapier.World
    indexRightAxis?: number
    indexForwardAxis?: number
    indexUpAxis?: number
    chassisRigidBody: Rapier.RigidBody
}

export type WheelState = {
    suspensionLength: number
    suspensionRelativeVelocity: number
    suspensionForce: number
    clippedInvContactDotSuspension: number

    inContactWithGround: boolean
    hitPointWorld: Vector3
    hitNormalWorld: Vector3

    directionWorld: Vector3
    axleWorld: Vector3

    chassisConnectionPointWorld: Vector3

    sideImpulse: number
    forwardImpulse: number

    forwardWS: Vector3
    axle: Vector3

    worldTransform: Object3D

    engineForce: number
    brakeForce: number
    steering: number

    rotation: number
    deltaRotation: number

    groundRigidBody: Rapier.RigidBody | null

    slipInfo: number
    skidInfo: number

    sliding: boolean
}

export type WheelDebug = {
    suspensionArrowHelper: ArrowHelper
    wheelRaycastArrowHelper: ArrowHelper
}

export type WheelOptions = {
    radius: number

    directionLocal: Vector3
    axleLocal: Vector3

    suspensionStiffness: number
    suspensionRestLength: number
    maxSuspensionForce: number
    maxSuspensionTravel: number

    sideFrictionStiffness: number
    frictionSlip: number
    dampingRelaxation: number
    dampingCompression: number

    rollInfluence: number

    customSlidingRotationalSpeed: number
    useCustomSlidingRotationalSpeed: boolean

    forwardAcceleration: number
    sideAcceleration: number

    chassisConnectionPointLocal: Vector3
}

export type Wheel = {
    state: WheelState
    options: WheelOptions
    debug: WheelDebug
}

export class RapierRaycastVehicle {
    wheels: Wheel[] = []

    state: VehicleState = {
        sliding: false,
        currentVehicleSpeedKmHour: 0,
    }

    world: Rapier.World

    chassisRigidBody: Rapier.RigidBody

    indexRightAxis: number
    indexForwardAxis: number
    indexUpAxis: number

    constructor({ world, chassisRigidBody, indexRightAxis = 2, indexForwardAxis = 0, indexUpAxis = 1 }: RaycastVehicleOptions) {
        this.world = world

        this.chassisRigidBody = chassisRigidBody

        this.indexRightAxis = indexRightAxis
        this.indexForwardAxis = indexForwardAxis
        this.indexUpAxis = indexUpAxis
    }

    addWheel(options: WheelOptions): number {
        const wheel: Wheel = {
            options,
            debug: {
                suspensionArrowHelper: new ArrowHelper(),
                wheelRaycastArrowHelper: new ArrowHelper(),
            },
            state: {
                suspensionLength: 0,
                suspensionForce: 0,
                suspensionRelativeVelocity: 0,
                clippedInvContactDotSuspension: 1,
                directionWorld: new Vector3(),
                inContactWithGround: false,
                hitNormalWorld: new Vector3(),
                hitPointWorld: new Vector3(),
                chassisConnectionPointWorld: new Vector3(),
                axleWorld: new Vector3(),
                sideImpulse: 0,
                forwardImpulse: 0,
                forwardWS: new Vector3(),
                axle: new Vector3(),
                worldTransform: new Object3D(),
                steering: 0,
                brakeForce: 0,
                engineForce: 0,
                rotation: 0,
                deltaRotation: 0,
                groundRigidBody: null,
                slipInfo: 0,
                skidInfo: 0,
                sliding: false,
            },
        }
        this.wheels.push(wheel)

        return this.wheels.length - 1
    }

    applyEngineForce(force: number, wheelIndex: number): void {
        this.wheels[wheelIndex].state.engineForce = force
    }

    setSteeringValue(steering: number, wheelIndex: number): void {
        this.wheels[wheelIndex].state.steering = steering
    }

    setBrakeValue(brake: number, wheelIndex: number): void {
        this.wheels[wheelIndex].state.brakeForce = brake
    }

    update(delta: number): void {
        this.resetStates()
        this.updateWheelTransform()
        this.updateCurrentSpeed()
        this.updateWheelSuspension()
        this.applyWheelSuspensionForce(delta)
        this.updateFriction(delta)
        this.updateWheelRotation(delta)
    }

    private resetStates(): void {
        // reset vehicle state
        this.state.sliding = false

        // reset wheel states
        for (let i = 0; i < this.wheels.length; i++) {
            const wheel = this.wheels[i]

            wheel.state.inContactWithGround = false
            wheel.state.groundRigidBody = null
        }
    }

    private updateWheelTransformWorld(wheel: Wheel): void {
        // update wheel transform world
        const chassisBody = this.chassisRigidBody

        pointToWorldFrame(chassisBody, wheel.options.chassisConnectionPointLocal, wheel.state.chassisConnectionPointWorld)
        vectorToWorldFrame(chassisBody, wheel.options.directionLocal, wheel.state.directionWorld)

        vectorToWorldFrame(chassisBody, wheel.options.axleLocal, wheel.state.axleWorld)
    }

    private updateWheelTransform(): void {
        for (let i = 0; i < this.wheels.length; i++) {
            const wheel = this.wheels[i]

            const up = _updateWheelTransform_up
            const right = _updateWheelTransform_right
            const fwd = _updateWheelTransform_fwd

            this.updateWheelTransformWorld(wheel)

            up.copy(wheel.options.directionLocal).multiplyScalar(-1)
            right.copy(wheel.options.axleLocal)
            fwd.crossVectors(up, right)
            fwd.normalize()
            right.normalize()

            // Rotate around steering over the wheelAxle
            const steering = wheel.state.steering
            const steeringOrn = _updateWheelTransform_steeringOrn
            steeringOrn.setFromAxisAngle(up, steering)

            const rotatingOrn = _updateWheelTransform_rotatingOrn
            rotatingOrn.setFromAxisAngle(right, wheel.state.rotation)

            // World rotation of the wheel
            const q = wheel.state.worldTransform.quaternion
            q.multiplyQuaternions(
                _updateWheelTransform_chassisRigidBodyQuaternion.copy(this.chassisRigidBody.rotation() as Quaternion),
                steeringOrn,
            )
            q.multiplyQuaternions(q, rotatingOrn)
            q.normalize()

            // world position of the wheel
            const p = wheel.state.worldTransform.position
            p.copy(wheel.state.directionWorld)
            p.multiplyScalar(wheel.state.suspensionLength)
            p.add(wheel.state.chassisConnectionPointWorld)
        }
    }

    private updateCurrentSpeed(): void {
        const chassis = this.chassisRigidBody
        const chassisVelocity = _updateCurrentSpeed_chassisVelocity.copy(chassis.linvel() as Vector3)

        this.state.currentVehicleSpeedKmHour = 3.6 * chassisVelocity.length()

        const forwardWorld = _updateCurrentSpeed_forwardWorld
        getVehicleAxisWorld(chassis, this.indexForwardAxis, forwardWorld)

        if (forwardWorld.dot(chassisVelocity) > 0) {
            this.state.currentVehicleSpeedKmHour *= -1
        }
    }

    private updateWheelSuspension(): void {
        for (let i = 0; i < this.wheels.length; i++) {
            const wheel = this.wheels[i]

            this.updateWheelTransformWorld(wheel)

            const rayLength = wheel.options.radius + wheel.options.suspensionRestLength

            const origin = wheel.state.chassisConnectionPointWorld

            const direction = _updateWheelSuspension_direction.copy(wheel.state.directionWorld).normalize()

            const ray = new Rapier.Ray(origin, direction)
            const rayColliderIntersection = this.world.castRayAndGetNormal(
                ray,
                rayLength,
                false,
                undefined,
                undefined,
                undefined,
                this.chassisRigidBody,
            )

            // if hit
            if (rayColliderIntersection && rayColliderIntersection.collider) {
                // store ground rigid body
                wheel.state.groundRigidBody = rayColliderIntersection.collider.parent()

                // update wheel state
                wheel.state.inContactWithGround = true

                // store hit normal
                wheel.state.hitNormalWorld.copy(rayColliderIntersection.normal as Vector3)

                // store hit point
                wheel.state.hitPointWorld.copy(ray.pointAt(rayColliderIntersection.timeOfImpact) as Vector3)

                // compute suspension length
                const hitDistance = rayColliderIntersection.timeOfImpact
                wheel.state.suspensionLength = hitDistance - wheel.options.radius

                // clamp on max suspension travel
                const minSuspensionLength = wheel.options.suspensionRestLength - wheel.options.maxSuspensionTravel
                const maxSuspensionLength = wheel.options.suspensionRestLength + wheel.options.maxSuspensionTravel

                if (wheel.state.suspensionLength < minSuspensionLength) {
                    wheel.state.suspensionLength = minSuspensionLength
                }
                if (wheel.state.suspensionLength > maxSuspensionLength) {
                    wheel.state.suspensionLength = maxSuspensionLength

                    wheel.state.groundRigidBody = null
                    wheel.state.inContactWithGround = false
                    wheel.state.hitNormalWorld.set(0, 0, 0)
                    wheel.state.hitPointWorld.set(0, 0, 0)
                }

                const denominator = _updateWheelSuspension_denominator
                    .copy(wheel.state.hitNormalWorld)
                    .dot(wheel.state.directionWorld)

                const chassisVelocityAtContactPoint = getVelocityAtWorldPoint(
                    this.chassisRigidBody,
                    wheel.state.hitPointWorld,
                    _updateWheelSuspension_chassisVelocityAtContactPoint,
                )

                const projVel = wheel.state.hitNormalWorld.dot(chassisVelocityAtContactPoint)

                if (denominator >= -0.1) {
                    wheel.state.suspensionRelativeVelocity = 0
                    wheel.state.clippedInvContactDotSuspension = 1 / 0.1
                } else {
                    const inv = -1 / denominator
                    wheel.state.suspensionRelativeVelocity = projVel * inv
                    wheel.state.clippedInvContactDotSuspension = inv
                }
            } else {
                // put wheel info as in rest position
                wheel.state.suspensionLength = wheel.options.suspensionRestLength + 0 * wheel.options.maxSuspensionTravel
                wheel.state.suspensionRelativeVelocity = 0
                wheel.state.hitNormalWorld.copy(wheel.state.directionWorld).multiplyScalar(-1)
                wheel.state.clippedInvContactDotSuspension = 1.0
            }

            // update debug arrow helpers
            const debugWheelDirection = _updateWheelSuspension_wheelRaycastArrowHelperDirection.copy(direction).normalize()

            wheel.debug.suspensionArrowHelper.position.copy(origin)
            wheel.debug.suspensionArrowHelper.setDirection(debugWheelDirection)
            wheel.debug.suspensionArrowHelper.setLength(wheel.state.suspensionLength)

            wheel.debug.wheelRaycastArrowHelper.position.copy(origin)
            wheel.debug.wheelRaycastArrowHelper.setDirection(direction)
            wheel.debug.wheelRaycastArrowHelper.setLength(rayLength)

            // calculate suspension force
            wheel.state.suspensionForce = 0

            if (wheel.state.inContactWithGround) {
                // spring
                const suspensionRestLength = wheel.options.suspensionRestLength
                const currentLength = wheel.state.suspensionLength
                const lengthDifference = suspensionRestLength - currentLength

                let force = wheel.options.suspensionStiffness * lengthDifference * wheel.state.clippedInvContactDotSuspension

                // damper
                const projectedRelativeVelocity = wheel.state.suspensionRelativeVelocity
                const suspensionDamping =
                    projectedRelativeVelocity < 0 ? wheel.options.dampingCompression : wheel.options.dampingRelaxation
                force -= suspensionDamping * projectedRelativeVelocity

                wheel.state.suspensionForce = force * this.chassisRigidBody.mass()

                if (wheel.state.suspensionForce < 0) {
                    wheel.state.suspensionForce = 0
                }
            }
        }
    }

    private applyWheelSuspensionForce(delta: number): void {
        for (let i = 0; i < this.wheels.length; i++) {
            const wheel = this.wheels[i]

            const impulse = _applyWheelSuspensionForce_impulse

            let suspensionForce = wheel.state.suspensionForce
            if (suspensionForce > wheel.options.maxSuspensionForce) {
                suspensionForce = wheel.options.maxSuspensionForce
            }

            impulse.copy(wheel.state.hitNormalWorld).multiplyScalar(suspensionForce * delta)

            this.chassisRigidBody.applyImpulseAtPoint(impulse, wheel.state.hitPointWorld, true)
        }
    }

    private updateFriction(delta: number): void {
        const surfNormalWS_scaled_proj = _updateFriction_surfNormalWS_scaled_proj

        for (let i = 0; i < this.wheels.length; i++) {
            const wheel = this.wheels[i]

            wheel.state.sideImpulse = 0
            wheel.state.forwardImpulse = 0

            if (wheel.state.inContactWithGround && wheel.state.groundRigidBody) {
                const axle = wheel.state.axle
                const wheelWorldTransform = wheel.state.worldTransform
                const forwardWS = wheel.state.forwardWS

                // get world axle
                vectorToWorldFrame(wheelWorldTransform, directions[this.indexRightAxis], axle)

                const surfNormalWS = wheel.state.hitNormalWorld
                const proj = axle.dot(surfNormalWS)

                surfNormalWS_scaled_proj.copy(surfNormalWS).multiplyScalar(proj)
                axle.subVectors(axle, surfNormalWS_scaled_proj)
                axle.normalize()

                forwardWS.crossVectors(surfNormalWS, axle)
                forwardWS.normalize()

                wheel.state.sideImpulse = resolveSingleBilateralConstraint(
                    this.chassisRigidBody,
                    wheel.state.hitPointWorld,
                    wheel.state.groundRigidBody,
                    wheel.state.hitPointWorld,
                    axle,
                )

                wheel.state.sideImpulse *= wheel.options.sideFrictionStiffness
            }
        }

        const sideFactor = 1
        const fwdFactor = 0.5

        this.state.sliding = false

        for (let i = 0; i < this.wheels.length; i++) {
            const wheel = this.wheels[i]

            let rollingFriction = 0

            wheel.state.slipInfo = 1

            if (wheel.state.groundRigidBody) {
                const defaultRollingFrictionImpulse = 0

                const maxImpulse = wheel.state.brakeForce ? wheel.state.brakeForce : defaultRollingFrictionImpulse

                // brake
                rollingFriction = calcRollingFriction(
                    this.chassisRigidBody,
                    wheel.state.groundRigidBody,
                    wheel.state.hitPointWorld,
                    wheel.state.forwardWS,
                    maxImpulse,
                )

                // acceleration
                rollingFriction += wheel.state.engineForce * delta

                const factor = maxImpulse / rollingFriction
                wheel.state.slipInfo *= factor
            }

            // switch between active rolling (throttle), braking and non-active rolling friction (nthrottle/break)
            wheel.state.forwardImpulse = 0
            wheel.state.skidInfo = 1

            if (wheel.state.groundRigidBody) {
                const maxImp = wheel.state.suspensionForce * delta * wheel.options.frictionSlip
                const maxImpSide = maxImp

                const maxImpSquared = maxImp * maxImpSide

                wheel.state.forwardImpulse = rollingFriction

                const x = (wheel.state.forwardImpulse * fwdFactor) / wheel.options.forwardAcceleration
                const y = (wheel.state.sideImpulse * sideFactor) / wheel.options.sideAcceleration

                const impulseSquared = x * x + y * y

                wheel.state.sliding = false
                if (impulseSquared > maxImpSquared) {
                    this.state.sliding = true
                    wheel.state.sliding = true

                    const factor = maxImp / Math.sqrt(impulseSquared)

                    wheel.state.skidInfo *= factor
                }
            }
        }

        if (this.state.sliding) {
            for (let i = 0; i < this.wheels.length; i++) {
                const wheel = this.wheels[i]

                if (wheel.state.sideImpulse !== 0) {
                    if (wheel.state.skidInfo < 1) {
                        wheel.state.forwardImpulse *= wheel.state.skidInfo
                        wheel.state.sideImpulse *= wheel.state.skidInfo
                    }
                }
            }
        }

        // apply the impulses
        for (let i = 0; i < this.wheels.length; i++) {
            const wheel = this.wheels[i]

            const worldPos = _updateFriction_worldPos.copy(wheel.state.hitPointWorld)

            const relPos = _updateFriction_relPos.copy(worldPos)
            relPos.sub(this.chassisRigidBody.translation() as Vector3)

            if (wheel.state.forwardImpulse !== 0) {
                const impulse = _updateFriction_impulse.copy(wheel.state.forwardWS).multiplyScalar(wheel.state.forwardImpulse)

                this.chassisRigidBody.applyImpulseAtPoint(impulse, worldPos, true)
            }

            if (wheel.state.sideImpulse !== 0) {
                const chassisBody = this.chassisRigidBody
                const groundBody = wheel.state.groundRigidBody!

                const world_pos2 = wheel.state.hitPointWorld

                const sideImp = _updateFriction_sideImp.copy(wheel.state.axle).multiplyScalar(wheel.state.sideImpulse)

                const rollInfluenceAdjustedWorldPos = _applyWheelSuspensionForce_rollInfluenceAdjustedWorldPos

                // Scale the relative position in the up direction with rollInfluence.
                // If rollInfluence is 1, the impulse will be applied on the hitPoint (easy to roll over), if it is zero it will be applied in the same plane as the center of mass (not easy to roll over).
                vectorToLocalFrame(this.chassisRigidBody, relPos, rollInfluenceAdjustedWorldPos)

                rollInfluenceAdjustedWorldPos['xyz'[this.indexUpAxis] as 'x' | 'y' | 'z'] *= wheel.options.rollInfluence

                vectorToWorldFrame(this.chassisRigidBody, rollInfluenceAdjustedWorldPos, rollInfluenceAdjustedWorldPos)

                // back to world pos
                rollInfluenceAdjustedWorldPos.add(this.chassisRigidBody.translation() as Vector3)

                chassisBody.applyImpulseAtPoint(sideImp, rollInfluenceAdjustedWorldPos, true)

                // apply friction impulse on the ground
                sideImp.multiplyScalar(-1)

                groundBody.applyImpulseAtPoint(sideImp, world_pos2, true)
            }
        }
    }

    private updateWheelRotation(delta: number): void {
        const hitNormalWorldScaledWithProj = _updateWheelRotation_hitNormalWorldScaledWithProj.set(0, 0, 0)
        const fwd = _updateWheelRotation_fwd.set(0, 0, 0)
        const vel = _updateWheelRotation_vel.set(0, 0, 0)

        for (let i = 0; i < this.wheels.length; i++) {
            const wheel = this.wheels[i]

            getVelocityAtWorldPoint(this.chassisRigidBody, wheel.state.chassisConnectionPointWorld, vel)

            // Hack to get the rotation in the correct direction
            let m = 1
            switch (this.indexUpAxis) {
                case 1:
                    m = -1
                    break
            }

            if (wheel.state.inContactWithGround) {
                getVehicleAxisWorld(this.chassisRigidBody, this.indexForwardAxis, fwd)

                const proj = fwd.dot(wheel.state.hitNormalWorld)

                hitNormalWorldScaledWithProj.copy(wheel.state.hitNormalWorld).multiplyScalar(proj)

                fwd.subVectors(fwd, hitNormalWorldScaledWithProj)

                const proj2 = fwd.dot(vel)

                wheel.state.deltaRotation = (m * proj2 * delta) / wheel.options.radius
            }

            if (
                (wheel.state.sliding || !wheel.state.inContactWithGround) &&
                wheel.state.engineForce !== 0 &&
                wheel.options.useCustomSlidingRotationalSpeed
            ) {
                // Apply custom rotation when accelerating and sliding
                wheel.state.deltaRotation =
                    (wheel.state.engineForce > 0 ? 1 : -1) * wheel.options.customSlidingRotationalSpeed * delta
            }

            // Lock wheels
            if (Math.abs(wheel.state.brakeForce) > Math.abs(wheel.state.engineForce)) {
                wheel.state.deltaRotation = 0
            }

            wheel.state.rotation += wheel.state.deltaRotation // Use the old value
            wheel.state.deltaRotation *= 0.99 // damping of rotation when not in contact
        }
    }
}

const _getVelocityAtWorldPoint_r = new Vector3()
const _getVelocityAtWorldPoint_position = new Vector3()
const _getVelocityAtWorldPoint_angvel = new Vector3()
const _getVelocityAtWorldPoint_linvel = new Vector3()

function getVelocityAtWorldPoint(rigidBody: Rapier.RigidBody, worldPoint: Vector3, target = new Vector3()): Vector3 {
    const r = _getVelocityAtWorldPoint_r.set(0, 0, 0)

    const position = _getVelocityAtWorldPoint_position.copy(rigidBody.translation() as Vector3)
    const angvel = _getVelocityAtWorldPoint_angvel.copy(rigidBody.angvel() as Vector3)
    const linvel = _getVelocityAtWorldPoint_linvel.copy(rigidBody.linvel() as Vector3)

    r.subVectors(worldPoint, position)
    target.crossVectors(angvel, r)
    target.addVectors(linvel, target)

    return target
}

const _pointToWorldFrame_quaternion = new Quaternion()

function pointToWorldFrame(object: Rapier.RigidBody, localPoint: Vector3, target = new Vector3()): Vector3 {
    const quaternion = _pointToWorldFrame_quaternion.copy(object.rotation() as Quaternion)

    const position = object.translation() as Vector3

    return target.copy(localPoint).applyQuaternion(quaternion).add(position)
}

const _vectorToLocalFrame_quaternion = new Quaternion()

function vectorToLocalFrame(object: Rapier.RigidBody, worldVector: Vector3, target = new Vector3()): Vector3 {
    const quaternion = _vectorToLocalFrame_quaternion.copy(object.rotation() as Quaternion)

    quaternion.conjugate()

    return target.copy(worldVector).applyQuaternion(quaternion)
}

const vectorToWorldFrame_quaternion = new Quaternion()

function vectorToWorldFrame(object: Rapier.RigidBody | Object3D, localVector: Vector3, target = new Vector3()): Vector3 {
    const quaternion = vectorToWorldFrame_quaternion.copy(
        object instanceof Object3D ? object.quaternion : (object.rotation() as Quaternion),
    )

    return target.copy(localVector).applyQuaternion(quaternion)
}

// get one of the wheel axes, world-oriented
function getVehicleAxisWorld(chassisBody: Rapier.RigidBody, axisIndex: number, result = new Vector3()): Vector3 {
    result.set(axisIndex === 0 ? 1 : 0, axisIndex === 1 ? 1 : 0, axisIndex === 2 ? 1 : 0)
    return vectorToWorldFrame(chassisBody, result, result)
}

// bilateral constraint between two dynamic objects
const _resolveSingleBilateralConstraint_vel1 = new Vector3()
const _resolveSingleBilateralConstraint_vel2 = new Vector3()
const _resolveSingleBilateralConstraint_vel = new Vector3()

function resolveSingleBilateralConstraint(
    body1: Rapier.RigidBody,
    pos1: Vector3,
    body2: Rapier.RigidBody,
    pos2: Vector3,
    normal: Vector3,
): number {
    const normalLenSqr = normal.lengthSq()
    if (normalLenSqr > 1.1) {
        return 0 // no impulse
    }

    const vel1 = _resolveSingleBilateralConstraint_vel1
    const vel2 = _resolveSingleBilateralConstraint_vel2
    const vel = _resolveSingleBilateralConstraint_vel

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
const _computeImpulseDenominator_r0 = new Vector3()
const _computeImpulseDenominator_c0 = new Vector3()
const _computeImpulseDenominator_vec = new Vector3()
const _computeImpulseDenominator_m = new Vector3()
const _computeImpulseDenominator_effectiveWorldInvInertiaSqrt = new Matrix3()

function computeImpulseDenominator(body: Rapier.RigidBody, pos: Vector3, normal: Vector3): number {
    const r0 = _computeImpulseDenominator_r0
    const c0 = _computeImpulseDenominator_c0
    const vec = _computeImpulseDenominator_vec
    const m = _computeImpulseDenominator_m

    const effectiveWorldInvInertiaSqrtSpdMatrix3 = body.effectiveWorldInvInertiaSqrt()

    // prettier-ignore
    const effectiveWorldInvInertiaSqrt = _computeImpulseDenominator_effectiveWorldInvInertiaSqrt.set(
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
const _calcRollingFriction_vel1 = new Vector3()
const _calcRollingFriction_vel2 = new Vector3()
const _calcRollingFriction_vel = new Vector3()

function calcRollingFriction(
    body0: Rapier.RigidBody,
    body1: Rapier.RigidBody,
    frictionPosWorld: Vector3,
    frictionDirectionWorld: Vector3,
    maxImpulse: number,
): number {
    let j1 = 0
    const contactPosWorld = frictionPosWorld

    const vel1 = _calcRollingFriction_vel1
    const vel2 = _calcRollingFriction_vel2
    const vel = _calcRollingFriction_vel

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
