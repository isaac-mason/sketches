import Rapier from '@dimforge/rapier3d-compat'
import { useFrame, useThree } from '@react-three/fiber'
import {
    CuboidCollider,
    Debug,
    Physics,
    RigidBody,
    RigidBodyProps,
    useRapier,
} from '@react-three/rapier'
import { RigidBodyApi } from '@react-three/rapier/dist/declarations/src/types'
import { useControls as useLeva } from 'leva'
import { useMemo, useRef } from 'react'
import styled from 'styled-components'
import { ArrowHelper, Group, Object3D, Quaternion, Vector3 } from 'three'
import { Canvas } from '../Canvas'
import { useControls } from './use-controls'
import {
    calcRollingFriction,
    getVehicleAxisWorld,
    getVelocityAtWorldPoint,
    pointToWorldFrame,
    resolveSingleBilateralConstraint,
    vectorToLocalFrame,
    vectorToWorldFrame,
} from './utils'

const LEVA_KEY = 'rapier-raycast-vehicle'

const Controls = styled.div`
    position: absolute;
    bottom: 4em;
    left: 0;
    width: 100%;
    text-align: center;
    font-size: 2em;
    color: white;
    font-family: monospace;
    text-shadow: 2px 2px black;
`

const CHASSIS_CUBOID_HALF_EXTENTS = new Vector3(2, 0.5, 1)
const RAPIER_UPDATE_PRIORITY = -50
const BEFORE_RAPIER_UPDATE = RAPIER_UPDATE_PRIORITY + 1
const AFTER_RAPIER_UPDATE = RAPIER_UPDATE_PRIORITY - 1

const directions = [
    new Vector3(1, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, 0, 1),
]

type RaycastVehicleProps = RigidBodyProps & {
    indexRightAxis?: number
    indexForwardAxis?: number
    indexUpAxis?: number
}

type VehicleState = {
    sliding: boolean

    currentVehicleSpeedKmHour: number
}

type WheelState = {
    suspensionLength: number
    suspensionRelativeVelocity: number
    suspensionForce: number
    clippedInvContactDotSuspension: number

    inContactWithGround: boolean
    hitPointWorld: Vector3
    hitNormalWorld: Vector3

    directionWorld: Vector3
    axleWorld: Vector3
    chassisConnectionPointLocal: Vector3
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

const updateWheelTransform_up = new Vector3()
const updateWheelTransform_right = new Vector3()
const updateWheelTransform_fwd = new Vector3()
const updateWheelTransform_steeringOrn = new Quaternion()
const updateWheelTransform_rotatingOrn = new Quaternion()

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

const RaycastVehicle = ({
    children,
    indexRightAxis = 2,
    indexForwardAxis = 0,
    indexUpAxis = 1,
    ...groupProps
}: RaycastVehicleProps) => {
    const {
        directionLocal: directionLocalArray,
        axleLocal: axleLocalArray,
        chassisConnectionPointLocalTopLeft:
            chassisConnectionPointLocalTopLeftArray,
        chassisConnectionPointLocalTopRight:
            chassisConnectionPointLocalTopRightArray,
        chassisConnectionPointLocalBottomLeft:
            chassisConnectionPointLocalBottomLeftArray,
        chassisConnectionPointLocalBottomRight:
            chassisConnectionPointLocalBottomRightArray,
        ...wheelOptions
    } = useLeva(`${LEVA_KEY}-wheel-options`, {
        radius: 0.5,

        directionLocal: [0, -1, 0],
        axleLocal: [0, 0, 1],

        suspensionStiffness: 30,
        suspensionRestLength: 0.3,
        maxSuspensionForce: 100000,
        maxSuspensionTravel: 0.3,

        sideFrictionStiffness: 1,
        frictionSlip: 1.4,
        dampingRelaxation: 2.3,
        dampingCompression: 4.4,

        rollInfluence: 0.01,

        customSlidingRotationalSpeed: -30,
        useCustomSlidingRotationalSpeed: true,

        forwardAcceleration: 1,
        sideAcceleration: 1,

        chassisConnectionPointLocalTopLeft: [-1, 0, -1],
        chassisConnectionPointLocalTopRight: [-1, 0, 1],
        chassisConnectionPointLocalBottomLeft: [1, 0, -1],
        chassisConnectionPointLocalBottomRight: [1, 0, 1],

        maxForce: 500,
        maxSteer: 0.5,
        maxBrake: 10,
    })

    const directionLocal = useMemo(
        () => new Vector3(...directionLocalArray),
        [directionLocalArray]
    )
    const axleLocal = useMemo(
        () => new Vector3(...axleLocalArray),
        [axleLocalArray]
    )

    const topLeftChassisConnectionPointLocal = useMemo(
        () => new Vector3(...chassisConnectionPointLocalTopLeftArray),
        [chassisConnectionPointLocalTopLeftArray]
    )
    const topRightChassisConnectionPointLocal = useMemo(
        () => new Vector3(...chassisConnectionPointLocalTopRightArray),
        [chassisConnectionPointLocalTopRightArray]
    )
    const bottomLeftChassisConnectionPointLocal = useMemo(
        () => new Vector3(...chassisConnectionPointLocalBottomLeftArray),
        [chassisConnectionPointLocalBottomLeftArray]
    )
    const bottomRightChassisConnectionPointLocal = useMemo(
        () => new Vector3(...chassisConnectionPointLocalBottomRightArray),
        [chassisConnectionPointLocalBottomRightArray]
    )

    const wheel = {
        ...wheelOptions,
        directionLocal,
        axleLocal,
    }

    const chassisConnectionPoints = [
        topLeftChassisConnectionPointLocal,
        topRightChassisConnectionPointLocal,
        bottomLeftChassisConnectionPointLocal,
        bottomRightChassisConnectionPointLocal,
    ]

    const rapier = useRapier()

    const vehicleState = useRef<VehicleState>({
        sliding: false,
        currentVehicleSpeedKmHour: 0,
    })

    const wheelStates = useRef<WheelState[]>(
        Array.from({ length: 4 })
            .fill(0)
            .map((_, idx) => ({
                suspensionLength: 0,
                suspensionForce: 0,
                suspensionRelativeVelocity: 0,
                clippedInvContactDotSuspension: 1,
                directionWorld: new Vector3(),
                inContactWithGround: false,
                hitNormalWorld: new Vector3(),
                hitPointWorld: new Vector3(),
                chassisConnectionPointLocal: chassisConnectionPoints[idx],
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
            }))
    )

    const wheelArrowHelperTopLeft = useRef<ArrowHelper>(null)
    const wheelArrowHelperTopRight = useRef<ArrowHelper>(null)
    const wheelArrowHelperBottomLeft = useRef<ArrowHelper>(null)
    const wheelArrowHelperBottomRight = useRef<ArrowHelper>(null)

    const wheelRaycastArrowHelpers = [
        wheelArrowHelperTopLeft,
        wheelArrowHelperTopRight,
        wheelArrowHelperBottomLeft,
        wheelArrowHelperBottomRight,
    ]

    const topLeftWheelObject = useRef<Group>(null!)
    const topRightWheelObject = useRef<Group>(null!)
    const bottomLeftWheelObject = useRef<Group>(null!)
    const bottomRightWheelObject = useRef<Group>(null!)

    const wheelObjects = [
        topLeftWheelObject,
        topRightWheelObject,
        bottomLeftWheelObject,
        bottomRightWheelObject,
    ]

    const chassisRigidBody = useRef<RigidBodyApi>(null!)
    const chassisCollider = useRef<Rapier.Collider[]>(null!)

    const camera = useThree((state) => state.camera)
    const currentCameraPosition = useRef(new Vector3(15, 15, 0))
    const currentCameraLookAt = useRef(new Vector3())

    const controls = useControls()

    const updateWheelTransformWorld = (wheelState: WheelState) => {
        // update wheel transform world
        const chassisBody = chassisRigidBody.current.raw()
        pointToWorldFrame(
            chassisBody,
            wheelState.chassisConnectionPointLocal,
            wheelState.chassisConnectionPointWorld
        )
        vectorToWorldFrame(
            chassisBody,
            wheel.directionLocal,
            wheelState.directionWorld
        )

        vectorToWorldFrame(chassisBody, wheel.axleLocal, wheelState.axleWorld)
    }

    const resetStates = () => {
        // reset vehicle state
        vehicleState.current.sliding = false

        // reset wheel states
        for (let i = 0; i < wheelStates.current.length; i++) {
            const wheelState = wheelStates.current[i]

            wheelState.inContactWithGround = false
            wheelState.groundRigidBody = null
        }
    }

    const updateStatesFromControls = () => {
        let engineForce = 0
        let steering = 0

        // read input
        if (controls.current.forward) {
            engineForce -= wheelOptions.maxForce
        }
        if (controls.current.backward) {
            engineForce += wheelOptions.maxForce
        }

        if (controls.current.left) {
            steering += wheelOptions.maxSteer
        }
        if (controls.current.right) {
            steering -= wheelOptions.maxSteer
        }

        const brakeForce = controls.current.brake ? wheelOptions.maxBrake : 0

        for (let i = 0; i < wheelStates.current.length; i++) {
            const wheelState = wheelStates.current[i]
            wheelState.brakeForce = brakeForce
        }

        // steer front wheels
        wheelStates.current[0].steering = steering
        wheelStates.current[1].steering = steering

        // apply engine force to back wheels
        wheelStates.current[2].engineForce = engineForce
        wheelStates.current[3].engineForce = engineForce
    }

    const updateWheelTransform = () => {
        for (let i = 0; i < wheelStates.current.length; i++) {
            const wheelState = wheelStates.current[i]
            const wheelObject = wheelObjects[i].current

            const up = updateWheelTransform_up
            const right = updateWheelTransform_right
            const fwd = updateWheelTransform_fwd

            updateWheelTransformWorld(wheelState)

            up.copy(wheel.directionLocal).multiplyScalar(-1)
            right.copy(wheel.axleLocal)
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
                chassisRigidBody.current.rotation(),
                steeringOrn
            )
            q.multiplyQuaternions(q, rotatingOrn)
            q.normalize()

            // world position of the wheel
            const p = wheelState.worldTransform.position
            p.copy(wheelState.directionWorld)
            p.multiplyScalar(wheelState.suspensionLength)
            p.add(wheelState.chassisConnectionPointWorld)

            wheelObject.position.copy(p)
            wheelObject.quaternion.copy(q)
        }
    }

    const updateCurrentSpeed = () => {
        const chassis = chassisRigidBody.current.raw()
        const chassisVelocity = updateCurrentSpeed_chassisVelocity.copy(
            chassis.linvel() as Vector3
        )

        vehicleState.current.currentVehicleSpeedKmHour =
            3.6 * chassisVelocity.length()

        const forwardWorld = updateCurrentSpeed_forwardWorld
        getVehicleAxisWorld(chassis, indexForwardAxis, forwardWorld)

        if (forwardWorld.dot(chassisVelocity) > 0) {
            vehicleState.current.currentVehicleSpeedKmHour *= -1
        }
    }

    const updateWheelSuspension = () => {
        const world = rapier.world.raw()

        for (let i = 0; i < wheelStates.current.length; i++) {
            const wheelRaycastArrowHelper = wheelRaycastArrowHelpers[i].current
            const wheelState = wheelStates.current[i]

            updateWheelTransformWorld(wheelState)

            const rayLength = wheel.radius + wheel.suspensionRestLength

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
                chassisRigidBody.current.raw()
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
                wheelState.suspensionLength = hitDistance - wheel.radius

                // clamp on max suspension travel
                const minSuspensionLength =
                    wheel.suspensionRestLength - wheel.maxSuspensionTravel
                const maxSuspensionLength =
                    wheel.suspensionRestLength + wheel.maxSuspensionTravel

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
                    chassisRigidBody.current.raw(),
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
                    wheel.suspensionRestLength + 0 * wheel.maxSuspensionTravel
                wheelState.suspensionRelativeVelocity = 0
                wheelState.hitNormalWorld
                    .copy(wheelState.directionWorld)
                    .multiplyScalar(-1)
                wheelState.clippedInvContactDotSuspension = 1.0
            }

            // update arrow helper
            if (wheelRaycastArrowHelper) {
                wheelRaycastArrowHelper.setColor('red')
                wheelRaycastArrowHelper.position.copy(origin)
                wheelRaycastArrowHelper.setDirection(
                    updateWheelSuspension_wheelRaycastArrowHelperDirection
                        .copy(direction)
                        .normalize()
                )
                wheelRaycastArrowHelper.setLength(wheelState.suspensionLength)
            }

            // calculate suspension force
            wheelState.suspensionForce = 0

            if (wheelState.inContactWithGround) {
                // spring
                const suspensionRestLength = wheel.suspensionRestLength
                const currentLength = wheelState.suspensionLength
                const lengthDifference = suspensionRestLength - currentLength

                let force =
                    wheel.suspensionStiffness *
                    lengthDifference *
                    wheelState.clippedInvContactDotSuspension

                // damper
                const projectedRelativeVelocity =
                    wheelState.suspensionRelativeVelocity
                const suspensionDamping =
                    projectedRelativeVelocity < 0
                        ? wheel.dampingCompression
                        : wheel.dampingRelaxation
                force -= suspensionDamping * projectedRelativeVelocity

                wheelState.suspensionForce =
                    force * chassisRigidBody.current.mass()

                if (wheelState.suspensionForce < 0) {
                    wheelState.suspensionForce = 0
                }
            }
        }
    }

    const applyWheelSuspensionForce = (delta: number) => {
        for (let i = 0; i < wheelStates.current.length; i++) {
            const wheelState = wheelStates.current[i]

            const impulse = applyWheelSuspensionForce_impulse

            let suspensionForce = wheelState.suspensionForce
            if (suspensionForce > wheel.maxSuspensionForce) {
                suspensionForce = wheel.maxSuspensionForce
            }

            impulse
                .copy(wheelState.hitNormalWorld)
                .multiplyScalar(suspensionForce * delta)

            chassisRigidBody.current.applyImpulseAtPoint(
                impulse,
                wheelState.hitPointWorld,
                true
            )
        }
    }

    const updateFriction = (delta: number) => {
        const surfNormalWS_scaled_proj = updateFriction_surfNormalWS_scaled_proj

        for (let i = 0; i < wheelStates.current.length; i++) {
            const wheelState = wheelStates.current[i]

            wheelState.sideImpulse = 0
            wheelState.forwardImpulse = 0

            if (wheelState.inContactWithGround && wheelState.groundRigidBody) {
                const axle = wheelState.axle
                const wheelWorldTransform = wheelState.worldTransform
                const forwardWS = wheelState.forwardWS

                // get world axle
                vectorToWorldFrame(
                    wheelWorldTransform,
                    directions[indexRightAxis],
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
                    chassisRigidBody.current.raw(),
                    wheelState.hitPointWorld,
                    wheelState.groundRigidBody,
                    wheelState.hitPointWorld,
                    axle,
                )

                wheelState.sideImpulse *= wheel.sideFrictionStiffness
            }
        }

        const sideFactor = 1
        const fwdFactor = 0.5

        vehicleState.current.sliding = false

        for (let i = 0; i < wheelStates.current.length; i++) {
            const wheelState = wheelStates.current[i]

            let rollingFriction = 0

            wheelState.slipInfo = 1

            if (wheelState.groundRigidBody) {
                const defaultRollingFrictionImpulse = 0

                const maxImpulse = wheelState.brakeForce
                    ? wheelState.brakeForce
                    : defaultRollingFrictionImpulse

                // brake
                rollingFriction = calcRollingFriction(
                    CHASSIS_CUBOID_HALF_EXTENTS,
                    chassisRigidBody.current.raw(),
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
                    wheelState.suspensionForce * delta * wheel.frictionSlip
                const maxImpSide = maxImp

                const maxImpSquared = maxImp * maxImpSide

                wheelState.forwardImpulse = rollingFriction

                const x =
                    (wheelState.forwardImpulse * fwdFactor) /
                    wheel.forwardAcceleration
                const y =
                    (wheelState.sideImpulse * sideFactor) /
                    wheel.sideAcceleration

                const impulseSquared = x * x + y * y

                wheelState.sliding = false
                if (impulseSquared > maxImpSquared) {
                    vehicleState.current.sliding = true
                    wheelState.sliding = true

                    const factor = maxImp / Math.sqrt(impulseSquared)

                    wheelState.skidInfo *= factor
                }
            }
        }

        if (vehicleState.current.sliding) {
            for (let i = 0; i < wheelStates.current.length; i++) {
                const wheelState = wheelStates.current[i]

                if (wheelState.sideImpulse !== 0) {
                    if (wheelState.skidInfo < 1) {
                        wheelState.forwardImpulse *= wheelState.skidInfo
                        wheelState.sideImpulse *= wheelState.skidInfo
                    }
                }
            }
        }

        // apply the impulses
        for (let i = 0; i < wheelStates.current.length; i++) {
            const wheelState = wheelStates.current[i]

            const worldPos = updateFriction_worldPos.copy(
                wheelState.hitPointWorld
            )

            const relPos = updateFriction_relPos.copy(worldPos)
            relPos.sub(chassisRigidBody.current.translation())

            if (wheelState.forwardImpulse !== 0) {
                const impulse = updateFriction_impulse
                    .copy(wheelState.forwardWS)
                    .multiplyScalar(wheelState.forwardImpulse)

                chassisRigidBody.current.applyImpulseAtPoint(
                    impulse,
                    worldPos,
                    true
                )
            }

            if (wheelState.sideImpulse !== 0) {
                const chassisBody = chassisRigidBody.current.raw()
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
                    chassisRigidBody.current.raw(),
                    relPos,
                    rollInfluenceAdjustedWorldPos
                )

                rollInfluenceAdjustedWorldPos[
                    'xyz'[indexUpAxis] as 'x' | 'y' | 'z'
                ] *= wheel.rollInfluence

                vectorToWorldFrame(
                    chassisRigidBody.current.raw(),
                    rollInfluenceAdjustedWorldPos,
                    rollInfluenceAdjustedWorldPos
                )

                // back to world pos
                rollInfluenceAdjustedWorldPos.add(
                    chassisRigidBody.current.translation()
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

    const updateWheelRotation = (delta: number) => {
        const hitNormalWorldScaledWithProj =
            updateWheelRotation_hitNormalWorldScaledWithProj.set(0, 0, 0)
        const fwd = updateWheelRotation_fwd.set(0, 0, 0)
        const vel = updateWheelRotation_vel.set(0, 0, 0)

        for (let i = 0; i < wheelStates.current.length; i++) {
            const wheelState = wheelStates.current[i]

            getVelocityAtWorldPoint(
                chassisRigidBody.current.raw(),
                wheelState.chassisConnectionPointWorld,
                vel
            )

            // Hack to get the rotation in the correct direction
            let m = 1
            switch (indexUpAxis) {
                case 1:
                    m = -1
                    break
            }

            if (wheelState.inContactWithGround) {
                getVehicleAxisWorld(
                    chassisRigidBody.current.raw(),
                    indexForwardAxis,
                    fwd
                )

                const proj = fwd.dot(wheelState.hitNormalWorld)

                hitNormalWorldScaledWithProj
                    .copy(wheelState.hitNormalWorld)
                    .multiplyScalar(proj)

                fwd.subVectors(fwd, hitNormalWorldScaledWithProj)

                const proj2 = fwd.dot(vel)

                wheelState.deltaRotation = (m * proj2 * delta) / wheel.radius
            }

            if (
                (wheelState.sliding || !wheelState.inContactWithGround) &&
                wheelState.engineForce !== 0 &&
                wheel.useCustomSlidingRotationalSpeed
            ) {
                // Apply custom rotation when accelerating and sliding
                wheelState.deltaRotation =
                    (wheelState.engineForce > 0 ? 1 : -1) *
                    wheel.customSlidingRotationalSpeed *
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

    useFrame((_, delta) => {
        const clampedDelta = Math.min(delta, 1 / 60)
        resetStates()
        updateStatesFromControls()
        updateWheelTransform()
        updateCurrentSpeed()
        updateWheelSuspension()
        applyWheelSuspensionForce(clampedDelta)
        updateFriction(clampedDelta)
        updateWheelRotation(clampedDelta)
    }, BEFORE_RAPIER_UPDATE)

    useFrame((_, delta) => {
        const chassis = chassisRigidBody.current
        if (!chassis) {
            return
        }

        const t = 1.0 - Math.pow(0.01, delta)

        const idealOffset = new Vector3(10, 5, 0)
        idealOffset.applyQuaternion(chassis.rotation())
        idealOffset.add(chassis.translation())
        if (idealOffset.y < 0) {
            idealOffset.y = 0
        }

        const idealLookAt = new Vector3(0, 1, 0)
        idealLookAt.applyQuaternion(chassis.rotation())
        idealLookAt.add(chassis.translation())

        currentCameraPosition.current.lerp(idealOffset, t)
        currentCameraLookAt.current.lerp(idealLookAt, t)

        camera.position.copy(currentCameraPosition.current)
        camera.lookAt(currentCameraLookAt.current)
    }, AFTER_RAPIER_UPDATE)

    return (
        <>
            <RigidBody
                {...groupProps}
                colliders={false}
                ref={chassisRigidBody}
                mass={150}
            >
                {/* chassis */}
                <mesh>
                    <boxGeometry args={[4, 1, 2]} />
                    <meshStandardMaterial color="#888" />
                </mesh>

                <CuboidCollider
                    ref={chassisCollider}
                    args={[
                        CHASSIS_CUBOID_HALF_EXTENTS.x,
                        CHASSIS_CUBOID_HALF_EXTENTS.y,
                        CHASSIS_CUBOID_HALF_EXTENTS.z,
                    ]}
                />
            </RigidBody>

            {/* wheel raycast arrow helpers */}
            <arrowHelper ref={wheelArrowHelperTopLeft} />
            <arrowHelper ref={wheelArrowHelperTopRight} />
            <arrowHelper ref={wheelArrowHelperBottomLeft} />
            <arrowHelper ref={wheelArrowHelperBottomRight} />

            {/* top left wheel */}
            <group ref={topLeftWheelObject}>
                <mesh rotation-x={Math.PI / 2}>
                    <cylinderGeometry args={[0.5, 0.5, 0.3, 16]} />
                    <meshStandardMaterial color="#444" wireframe />
                </mesh>
            </group>

            {/* top right wheel */}
            <group ref={topRightWheelObject}>
                <mesh rotation-x={Math.PI / 2}>
                    <cylinderGeometry args={[0.5, 0.5, 0.3, 16]} />
                    <meshStandardMaterial color="#444" wireframe />
                </mesh>
            </group>

            {/* bottom left wheel */}
            <group ref={bottomLeftWheelObject}>
                <mesh rotation-x={Math.PI / 2}>
                    <cylinderGeometry args={[0.5, 0.5, 0.3, 16]} />
                    <meshStandardMaterial color="#444" wireframe />
                </mesh>
            </group>

            {/* bottom right wheel */}
            <group ref={bottomRightWheelObject}>
                <mesh rotation-x={Math.PI / 2}>
                    <cylinderGeometry args={[0.5, 0.5, 0.3, 16]} />
                    <meshStandardMaterial color="#444" wireframe />
                </mesh>
            </group>
        </>
    )
}

export default () => {
    return (
        <>
            <h1>Rapier - Raycast Vehicle</h1>
            <Canvas camera={{ fov: 60, position: [0, 30, -20] }}>
                <Physics
                    gravity={[0, -9.81, 0]}
                    updatePriority={RAPIER_UPDATE_PRIORITY}
                    timeStep={'vary'}
                >
                    <RaycastVehicle
                        position={[0, 3, 0]}
                        rotation={[0, Math.PI / 2, 0]}
                    />

                    {/* boxes */}
                    {Array.from({ length: 6 }).map((_, idx) => (
                        <RigidBody key={idx} colliders="cuboid" mass={10}>
                            <mesh position={[0, 2 + idx * 4.1, 25]}>
                                <boxGeometry args={[2, 1, 2]} />
                                <meshNormalMaterial />
                            </mesh>
                        </RigidBody>
                    ))}

                    {/* ramp */}
                    <RigidBody type="fixed">
                        <mesh rotation-x={-0.3} position={[0, -1, 15]}>
                            <boxGeometry args={[10, 1, 10]} />
                            <meshStandardMaterial color="#888" />
                        </mesh>
                    </RigidBody>

                    {/* ground */}
                    <RigidBody type="fixed" position-y={-5} colliders="cuboid">
                        <mesh>
                            <boxGeometry args={[300, 10, 300]} />
                            <meshStandardMaterial color="#ccc" />
                        </mesh>
                    </RigidBody>
                    <gridHelper args={[150, 15]} position-y={0.01} />

                    {/* lights */}
                    <ambientLight intensity={1} />
                    <pointLight intensity={0.5} position={[0, 5, 5]} />

                    <Debug />
                </Physics>
            </Canvas>
            <Controls>use wasd to drive</Controls>
        </>
    )
}
