import Rapier from '@dimforge/rapier3d-compat'
import { Vector3, Object3D, Quaternion, ArrowHelper } from 'three'
import {
    calcRollingFriction,
    getVehicleAxisWorld,
    getVelocityAtWorldPoint,
    pointToWorldFrame,
    resolveSingleBilateralConstraint,
    vectorToLocalFrame,
    vectorToWorldFrame,
} from './utils'

const directions = [
    new Vector3(1, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, 0, 1),
]

const updateWheelTransform_up = new Vector3()
const updateWheelTransform_right = new Vector3()
const updateWheelTransform_fwd = new Vector3()
const updateWheelTransform_steeringOrn = new Quaternion()
const updateWheelTransform_rotatingOrn = new Quaternion()
const updateWheelTransform_chassisRigidBodyQuaternion = new Quaternion()

const updateCurrentSpeed_chassisVelocity = new Vector3()
const updateCurrentSpeed_forwardWorld = new Vector3()

const updateWheelSuspension_denominator = new Vector3()
const updateWheelSuspension_chassisVelocityAtContactPoint = new Vector3()
const updateWheelSuspension_direction = new Vector3()
const updateWheelSuspension_wheelRaycastArrowHelperDirection = new Vector3()

const applyWheelSuspensionForce_impulse = new Vector3()
const applyWheelSuspensionForce_rollInfluenceAdjustedWorldPos = new Vector3()

const updateFriction_surfNormalWS_scaled_proj = new Vector3()
const updateFriction_impulse = new Vector3()
const updateFriction_sideImp = new Vector3()
const updateFriction_worldPos = new Vector3()
const updateFriction_relPos = new Vector3()

const updateWheelRotation_hitNormalWorldScaledWithProj = new Vector3()
const updateWheelRotation_fwd = new Vector3()
const updateWheelRotation_vel = new Vector3()

export type VehicleState = {
    sliding: boolean

    currentVehicleSpeedKmHour: number
}

export type RaycastVehicleOptions = {
    world: Rapier.World
    indexRightAxis?: number
    indexForwardAxis?: number
    indexUpAxis?: number
    chassisHalfExtents: Vector3
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
    world: Rapier.World

    wheels: Wheel[] = []

    state: VehicleState

    chassisRigidBody: Rapier.RigidBody

    chassisHalfExtents: Vector3

    indexRightAxis: number
    indexForwardAxis: number
    indexUpAxis: number

    constructor({
        world,
        chassisRigidBody,
        chassisHalfExtents = new Vector3(1, 1, 1),
        indexRightAxis = 2,
        indexForwardAxis = 0,
        indexUpAxis = 1,
    }: RaycastVehicleOptions) {
        this.world = world

        this.chassisRigidBody = chassisRigidBody
        this.chassisHalfExtents = chassisHalfExtents

        this.state = {
            sliding: false,
            currentVehicleSpeedKmHour: 0,
        }

        this.indexRightAxis = indexRightAxis
        this.indexForwardAxis = indexForwardAxis
        this.indexUpAxis = indexUpAxis
    }

    addWheel(options: WheelOptions): number {
        const wheel: Wheel = {
            options,
            debug: {
                suspensionArrowHelper: new ArrowHelper(),
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
            const wheelState = this.wheels[i].state

            wheelState.inContactWithGround = false
            wheelState.groundRigidBody = null
        }
    }

    private updateWheelTransformWorld(wheel: Wheel): void {
        // update wheel transform world
        const chassisBody = this.chassisRigidBody

        pointToWorldFrame(
            chassisBody,
            wheel.options.chassisConnectionPointLocal,
            wheel.state.chassisConnectionPointWorld
        )
        vectorToWorldFrame(
            chassisBody,
            wheel.options.directionLocal,
            wheel.state.directionWorld
        )

        vectorToWorldFrame(
            chassisBody,
            wheel.options.axleLocal,
            wheel.state.axleWorld
        )
    }

    private updateWheelTransform(): void {
        for (let i = 0; i < this.wheels.length; i++) {
            const wheel = this.wheels[i]
            const wheelState = wheel.state

            const up = updateWheelTransform_up
            const right = updateWheelTransform_right
            const fwd = updateWheelTransform_fwd

            this.updateWheelTransformWorld(wheel)

            up.copy(wheel.options.directionLocal).multiplyScalar(-1)
            right.copy(wheel.options.axleLocal)
            fwd.crossVectors(up, right)
            fwd.normalize()
            right.normalize()

            // Rotate around steering over the wheelAxle
            const steering = wheelState.steering
            const steeringOrn = updateWheelTransform_steeringOrn
            steeringOrn.setFromAxisAngle(up, steering)

            const rotatingOrn = updateWheelTransform_rotatingOrn
            rotatingOrn.setFromAxisAngle(right, wheelState.rotation)

            // World rotation of the wheel
            const q = wheelState.worldTransform.quaternion
            q.multiplyQuaternions(
                updateWheelTransform_chassisRigidBodyQuaternion.copy(
                    this.chassisRigidBody.rotation() as Quaternion
                ),
                steeringOrn
            )
            q.multiplyQuaternions(q, rotatingOrn)
            q.normalize()

            // world position of the wheel
            const p = wheelState.worldTransform.position
            p.copy(wheelState.directionWorld)
            p.multiplyScalar(wheelState.suspensionLength)
            p.add(wheelState.chassisConnectionPointWorld)
        }
    }

    private updateCurrentSpeed(): void {
        const chassis = this.chassisRigidBody
        const chassisVelocity = updateCurrentSpeed_chassisVelocity.copy(
            chassis.linvel() as Vector3
        )

        this.state.currentVehicleSpeedKmHour =
            3.6 * chassisVelocity.length()

        const forwardWorld = updateCurrentSpeed_forwardWorld
        getVehicleAxisWorld(chassis, this.indexForwardAxis, forwardWorld)

        if (forwardWorld.dot(chassisVelocity) > 0) {
            this.state.currentVehicleSpeedKmHour *= -1
        }
    }

    private updateWheelSuspension(): void {
        const world = this.world

        for (let i = 0; i < this.wheels.length; i++) {
            const wheel = this.wheels[i]
            const wheelState = wheel.state
            const wheelRaycastArrowHelper = wheel.debug.suspensionArrowHelper

            this.updateWheelTransformWorld(wheel)

            const rayLength =
                wheel.options.radius + wheel.options.suspensionRestLength

            const origin = wheelState.chassisConnectionPointWorld

            const direction = updateWheelSuspension_direction
                .copy(wheelState.directionWorld)
                .normalize()

            const ray = new Rapier.Ray(origin, direction)
            const rayColliderIntersection = world.castRayAndGetNormal(
                ray,
                rayLength,
                false,
                undefined,
                undefined,
                undefined,
                this.chassisRigidBody
            )

            // if hit
            if (rayColliderIntersection && rayColliderIntersection.collider) {
                // store ground rigid body
                wheelState.groundRigidBody =
                    rayColliderIntersection.collider.parent()

                // update wheel state
                wheelState.inContactWithGround = true

                // store hit normal
                wheelState.hitNormalWorld.copy(
                    rayColliderIntersection.normal as Vector3
                )

                // store hit point
                wheelState.hitPointWorld.copy(
                    ray.pointAt(rayColliderIntersection.toi) as Vector3
                )

                // compute suspension length
                const hitDistance = rayColliderIntersection.toi
                wheelState.suspensionLength = hitDistance - wheel.options.radius

                // clamp on max suspension travel
                const minSuspensionLength =
                    wheel.options.suspensionRestLength -
                    wheel.options.maxSuspensionTravel
                const maxSuspensionLength =
                    wheel.options.suspensionRestLength +
                    wheel.options.maxSuspensionTravel

                if (wheelState.suspensionLength < minSuspensionLength) {
                    wheelState.suspensionLength = minSuspensionLength
                }
                if (wheelState.suspensionLength > maxSuspensionLength) {
                    wheelState.suspensionLength = maxSuspensionLength

                    wheelState.groundRigidBody = null
                    wheelState.inContactWithGround = false
                    wheelState.hitNormalWorld.set(0, 0, 0)
                    wheelState.hitPointWorld.set(0, 0, 0)
                }

                const denominator = updateWheelSuspension_denominator
                    .copy(wheelState.hitNormalWorld)
                    .dot(wheelState.directionWorld)

                const chassisVelocityAtContactPoint = getVelocityAtWorldPoint(
                    this.chassisRigidBody,
                    wheelState.hitPointWorld,
                    updateWheelSuspension_chassisVelocityAtContactPoint
                )

                const projVel = wheelState.hitNormalWorld.dot(
                    chassisVelocityAtContactPoint
                )

                if (denominator >= -0.1) {
                    wheelState.suspensionRelativeVelocity = 0
                    wheelState.clippedInvContactDotSuspension = 1 / 0.1
                } else {
                    const inv = -1 / denominator
                    wheelState.suspensionRelativeVelocity = projVel * inv
                    wheelState.clippedInvContactDotSuspension = inv
                }
            } else {
                // put wheel info as in rest position
                wheelState.suspensionLength =
                    wheel.options.suspensionRestLength +
                    0 * wheel.options.maxSuspensionTravel
                wheelState.suspensionRelativeVelocity = 0
                wheelState.hitNormalWorld
                    .copy(wheelState.directionWorld)
                    .multiplyScalar(-1)
                wheelState.clippedInvContactDotSuspension = 1.0
            }

            // update arrow helper
            wheelRaycastArrowHelper.setColor('red')
            wheelRaycastArrowHelper.position.copy(origin)
            wheelRaycastArrowHelper.setDirection(
                updateWheelSuspension_wheelRaycastArrowHelperDirection
                    .copy(direction)
                    .normalize()
            )
            wheelRaycastArrowHelper.setLength(wheelState.suspensionLength)

            // calculate suspension force
            wheelState.suspensionForce = 0

            if (wheelState.inContactWithGround) {
                // spring
                const suspensionRestLength = wheel.options.suspensionRestLength
                const currentLength = wheelState.suspensionLength
                const lengthDifference = suspensionRestLength - currentLength

                let force =
                    wheel.options.suspensionStiffness *
                    lengthDifference *
                    wheelState.clippedInvContactDotSuspension

                // damper
                const projectedRelativeVelocity =
                    wheelState.suspensionRelativeVelocity
                const suspensionDamping =
                    projectedRelativeVelocity < 0
                        ? wheel.options.dampingCompression
                        : wheel.options.dampingRelaxation
                force -= suspensionDamping * projectedRelativeVelocity

                wheelState.suspensionForce =
                    force * this.chassisRigidBody.mass()

                if (wheelState.suspensionForce < 0) {
                    wheelState.suspensionForce = 0
                }
            }
        }
    }

    private applyWheelSuspensionForce(delta: number): void {
        for (let i = 0; i < this.wheels.length; i++) {
            const wheel = this.wheels[i]
            const wheelState = wheel.state

            const impulse = applyWheelSuspensionForce_impulse

            let suspensionForce = wheelState.suspensionForce
            if (suspensionForce > wheel.options.maxSuspensionForce) {
                suspensionForce = wheel.options.maxSuspensionForce
            }

            impulse
                .copy(wheelState.hitNormalWorld)
                .multiplyScalar(suspensionForce * delta)

            this.chassisRigidBody.applyImpulseAtPoint(
                impulse,
                wheelState.hitPointWorld,
                true
            )
        }
    }

    private updateFriction(delta: number): void {
        const surfNormalWS_scaled_proj = updateFriction_surfNormalWS_scaled_proj

        for (let i = 0; i < this.wheels.length; i++) {
            const wheel = this.wheels[i]
            const wheelState = wheel.state

            wheelState.sideImpulse = 0
            wheelState.forwardImpulse = 0

            if (wheelState.inContactWithGround && wheelState.groundRigidBody) {
                const axle = wheelState.axle
                const wheelWorldTransform = wheelState.worldTransform
                const forwardWS = wheelState.forwardWS

                // get world axle
                vectorToWorldFrame(
                    wheelWorldTransform,
                    directions[this.indexRightAxis],
                    axle
                )

                const surfNormalWS = wheelState.hitNormalWorld
                const proj = axle.dot(surfNormalWS)

                surfNormalWS_scaled_proj.copy(surfNormalWS).multiplyScalar(proj)
                axle.subVectors(axle, surfNormalWS_scaled_proj)
                axle.normalize()

                forwardWS.crossVectors(surfNormalWS, axle)
                forwardWS.normalize()

                wheelState.sideImpulse = resolveSingleBilateralConstraint(
                    this.chassisRigidBody,
                    wheelState.hitPointWorld,
                    wheelState.groundRigidBody,
                    wheelState.hitPointWorld,
                    axle
                )

                wheelState.sideImpulse *= wheel.options.sideFrictionStiffness
            }
        }

        const sideFactor = 1
        const fwdFactor = 0.5

        this.state.sliding = false

        for (let i = 0; i < this.wheels.length; i++) {
            const wheel = this.wheels[i]
            const wheelState = wheel.state

            let rollingFriction = 0

            wheelState.slipInfo = 1

            if (wheelState.groundRigidBody) {
                const defaultRollingFrictionImpulse = 0

                const maxImpulse = wheelState.brakeForce
                    ? wheelState.brakeForce
                    : defaultRollingFrictionImpulse

                // brake
                rollingFriction = calcRollingFriction(
                    this.chassisHalfExtents,
                    this.chassisRigidBody,
                    wheelState.groundRigidBody,
                    wheelState.hitPointWorld,
                    wheelState.forwardWS,
                    maxImpulse
                )

                // acceleration
                rollingFriction += wheelState.engineForce * delta

                const factor = maxImpulse / rollingFriction
                wheelState.slipInfo *= factor
            }

            // switch between active rolling (throttle), braking and non-active rolling friction (nthrottle/break)
            wheelState.forwardImpulse = 0
            wheelState.skidInfo = 1

            if (wheelState.groundRigidBody) {
                const maxImp =
                    wheelState.suspensionForce *
                    delta *
                    wheel.options.frictionSlip
                const maxImpSide = maxImp

                const maxImpSquared = maxImp * maxImpSide

                wheelState.forwardImpulse = rollingFriction

                const x =
                    (wheelState.forwardImpulse * fwdFactor) /
                    wheel.options.forwardAcceleration
                const y =
                    (wheelState.sideImpulse * sideFactor) /
                    wheel.options.sideAcceleration

                const impulseSquared = x * x + y * y

                wheelState.sliding = false
                if (impulseSquared > maxImpSquared) {
                    this.state.sliding = true
                    wheelState.sliding = true

                    const factor = maxImp / Math.sqrt(impulseSquared)

                    wheelState.skidInfo *= factor
                }
            }
        }

        if (this.state.sliding) {
            for (let i = 0; i < this.wheels.length; i++) {
                const wheel = this.wheels[i]
                const wheelState = wheel.state

                if (wheelState.sideImpulse !== 0) {
                    if (wheelState.skidInfo < 1) {
                        wheelState.forwardImpulse *= wheelState.skidInfo
                        wheelState.sideImpulse *= wheelState.skidInfo
                    }
                }
            }
        }

        // apply the impulses
        for (let i = 0; i < this.wheels.length; i++) {
            const wheel = this.wheels[i]
            const wheelState = wheel.state

            const worldPos = updateFriction_worldPos.copy(
                wheelState.hitPointWorld
            )

            const relPos = updateFriction_relPos.copy(worldPos)
            relPos.sub(this.chassisRigidBody.translation() as Vector3)

            if (wheelState.forwardImpulse !== 0) {
                const impulse = updateFriction_impulse
                    .copy(wheelState.forwardWS)
                    .multiplyScalar(wheelState.forwardImpulse)

                this.chassisRigidBody.applyImpulseAtPoint(
                    impulse,
                    worldPos,
                    true
                )
            }

            if (wheelState.sideImpulse !== 0) {
                const chassisBody = this.chassisRigidBody
                const groundBody = wheelState.groundRigidBody!

                const world_pos2 = wheelState.hitPointWorld

                const sideImp = updateFriction_sideImp
                    .copy(wheelState.axle)
                    .multiplyScalar(wheelState.sideImpulse)

                const rollInfluenceAdjustedWorldPos =
                    applyWheelSuspensionForce_rollInfluenceAdjustedWorldPos

                // Scale the relative position in the up direction with rollInfluence.
                // If rollInfluence is 1, the impulse will be applied on the hitPoint (easy to roll over), if it is zero it will be applied in the same plane as the center of mass (not easy to roll over).
                vectorToLocalFrame(
                    this.chassisRigidBody,
                    relPos,
                    rollInfluenceAdjustedWorldPos
                )

                rollInfluenceAdjustedWorldPos[
                    'xyz'[this.indexUpAxis] as 'x' | 'y' | 'z'
                ] *= wheel.options.rollInfluence

                vectorToWorldFrame(
                    this.chassisRigidBody,
                    rollInfluenceAdjustedWorldPos,
                    rollInfluenceAdjustedWorldPos
                )

                // back to world pos
                rollInfluenceAdjustedWorldPos.add(
                    this.chassisRigidBody.translation() as Vector3
                )

                chassisBody.applyImpulseAtPoint(
                    sideImp,
                    rollInfluenceAdjustedWorldPos,
                    true
                )

                // apply friction impulse on the ground
                sideImp.multiplyScalar(-1)

                groundBody.applyImpulseAtPoint(sideImp, world_pos2, true)
            }
        }
    }

    private updateWheelRotation(delta: number): void {
        const hitNormalWorldScaledWithProj =
            updateWheelRotation_hitNormalWorldScaledWithProj.set(0, 0, 0)
        const fwd = updateWheelRotation_fwd.set(0, 0, 0)
        const vel = updateWheelRotation_vel.set(0, 0, 0)

        for (let i = 0; i < this.wheels.length; i++) {
            const wheel = this.wheels[i]
            const wheelState = wheel.state

            getVelocityAtWorldPoint(
                this.chassisRigidBody,
                wheelState.chassisConnectionPointWorld,
                vel
            )

            // Hack to get the rotation in the correct direction
            let m = 1
            switch (this.indexUpAxis) {
                case 1:
                    m = -1
                    break
            }

            if (wheelState.inContactWithGround) {
                getVehicleAxisWorld(
                    this.chassisRigidBody,
                    this.indexForwardAxis,
                    fwd
                )

                const proj = fwd.dot(wheelState.hitNormalWorld)

                hitNormalWorldScaledWithProj
                    .copy(wheelState.hitNormalWorld)
                    .multiplyScalar(proj)

                fwd.subVectors(fwd, hitNormalWorldScaledWithProj)

                const proj2 = fwd.dot(vel)

                wheelState.deltaRotation =
                    (m * proj2 * delta) / wheel.options.radius
            }

            if (
                (wheelState.sliding || !wheelState.inContactWithGround) &&
                wheelState.engineForce !== 0 &&
                wheel.options.useCustomSlidingRotationalSpeed
            ) {
                // Apply custom rotation when accelerating and sliding
                wheelState.deltaRotation =
                    (wheelState.engineForce > 0 ? 1 : -1) *
                    wheel.options.customSlidingRotationalSpeed *
                    delta
            }

            // Lock wheels
            if (
                Math.abs(wheelState.brakeForce) >
                Math.abs(wheelState.engineForce)
            ) {
                wheelState.deltaRotation = 0
            }

            wheelState.rotation += wheelState.deltaRotation // Use the old value
            wheelState.deltaRotation *= 0.99 // damping of rotation when not in contact
        }
    }
}
