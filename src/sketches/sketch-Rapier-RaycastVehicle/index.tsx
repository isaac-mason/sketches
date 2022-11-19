import Rapier from '@dimforge/rapier3d-compat'
import { OrbitControls } from '@react-three/drei'
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
import { NumberInput } from 'leva/dist/declarations/src/components/Number/number-types'
import { useRef } from 'react'
import styled from 'styled-components'
import {
    ArrowHelper,
    Group,
    Matrix3,
    Mesh,
    Object3D,
    Quaternion,
    Vector3,
} from 'three'
import { Canvas } from '../Canvas'
import { useControls } from './use-controls'

const useLevaControls = () => {
    return useLeva('rapier-raycast-vehicle', {
        debug: false,
        orbitControls: false,
    })
}

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

const RAPIER_UPDATE_PRIORITY = -50
const BEFORE_RAPIER_UPDATE = RAPIER_UPDATE_PRIORITY + 1
const AFTER_RAPIER_UPDATE = RAPIER_UPDATE_PRIORITY - 1

const directions = [
    new Vector3(1, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, 0, 1),
]

const getVelocityAtWorldPoint = (
    rigidBody: Rapier.RigidBody,
    worldPoint: Vector3,
    target = new Vector3()
): Vector3 => {
    const r = target

    const position = new Vector3().copy(rigidBody.translation() as Vector3)
    const angvel = new Vector3().copy(rigidBody.angvel() as Vector3)
    const linvel = new Vector3().copy(rigidBody.linvel() as Vector3)

    r.subVectors(worldPoint, position)
    r.crossVectors(angvel, r)
    r.add(linvel)

    const result = linvel.add(new Vector3().copy(r).cross(angvel))
    return result
}

const pointToWorldFrame = (
    rigidBody: Rapier.RigidBody,
    localPoint: Vector3
): Vector3 => {
    const result = new Vector3().copy(localPoint)
    result
        .applyQuaternion(
            new Quaternion().copy(rigidBody.rotation() as Quaternion)
        )
        .add(rigidBody.translation() as Vector3)
    return result
}

const vectorToLocalFrame = (
    rigidBody: Rapier.RigidBody,
    worldVector: Vector3
): Vector3 => {
    return new Vector3()
        .copy(worldVector)
        .applyQuaternion(
            new Quaternion()
                .copy(rigidBody.rotation() as Quaternion)
                .conjugate()
        )
}

const vectorToWorldFrame = (
    rigidBody: Rapier.RigidBody | Object3D,
    localVector: Vector3,
    target = new Vector3()
): Vector3 => {
    return target
        .copy(localVector)
        .applyQuaternion(
            new Quaternion().copy(
                rigidBody instanceof Object3D
                    ? rigidBody.quaternion
                    : (rigidBody.rotation() as Quaternion)
            )
        )
}

// get one of the wheel axes, world-oriented
const getVehicleAxisWorld = (
    chassisBody: Rapier.RigidBody,
    axisIndex: number,
    result = new Vector3()
): void => {
    result.set(
        axisIndex === 0 ? 1 : 0,
        axisIndex === 1 ? 1 : 0,
        axisIndex === 2 ? 1 : 0
    )
    vectorToWorldFrame(chassisBody, result, result)
}

// bilateral constraint between two dynamic objects
const resolveSingleBilateral_vel1 = new Vector3()
const resolveSingleBilateral_vel2 = new Vector3()
const resolveSingleBilateral_vel = new Vector3()

function resolveSingleBilateral(
    body1: Rapier.RigidBody,
    pos1: Vector3,
    body2: Rapier.RigidBody,
    pos2: Vector3,
    normal: Vector3
): number {
    const normalLenSqr = normal.lengthSq()
    if (normalLenSqr > 1.1) {
        return 0 // no impulse
    }

    const vel1 = resolveSingleBilateral_vel1
    const vel2 = resolveSingleBilateral_vel2
    const vel = resolveSingleBilateral_vel

    vel1.copy(getVelocityAtWorldPoint(body1, pos1))
    vel2.copy(getVelocityAtWorldPoint(body2, pos2))

    vel.subVectors(vel1, vel2)

    const rel_vel = normal.dot(vel)

    const contactDamping = 0.2
    const massTerm = 1 / (body1.mass() + body2.mass())
    const impulse = -contactDamping * rel_vel * massTerm

    return impulse
}

// set Matrix3 rotation from quaternion
const setMatrix3RotationFromQuaternion = (m: Matrix3, q: Quaternion): void => {
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

// scale matrix3 columns of by vector3
const scaleMatrix3ByVector3 = (m: Matrix3, vector: Vector3): void => {
    const e = m.elements
    for (let i = 0; i !== 3; i++) {
        e[3 * i + 0] = vector.x * e[3 * i + 0]
        e[3 * i + 1] = vector.y * e[3 * i + 1]
        e[3 * i + 2] = vector.z * e[3 * i + 2]
    }
}

//Matrix-Vector multiplication
const matrixVectorMultiplication = (
    m: Matrix3,
    v: Vector3,
    target: Vector3
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

// calculate inertia world
const calculateInertiaWorld_uiw_m1 = new Matrix3()
const calculateInertiaWorld_uiw_m2 = new Matrix3()
const calculateInertiaWorld_uiw_m3 = new Matrix3()

const calculateInvInertiaWorld = (
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

// calculate inertia for an aabb
const calculateAABBInertia = (halfExtents: Vector3, mass: number): Vector3 => {
    const e = halfExtents
    return new Vector3(
        (1.0 / 12.0) * mass * (2 * e.y * 2 * e.y + 2 * e.z * 2 * e.z),
        (1.0 / 12.0) * mass * (2 * e.x * 2 * e.x + 2 * e.z * 2 * e.z),
        (1.0 / 12.0) * mass * (2 * e.y * 2 * e.y + 2 * e.x * 2 * e.x)
    )
}

// compute impulse denominator
const computeImpulseDenominator_r0 = new Vector3()
const computeImpulseDenominator_c0 = new Vector3()
const computeImpulseDenominator_vec = new Vector3()
const computeImpulseDenominator_m = new Vector3()
function computeImpulseDenominator(
    body: Rapier.RigidBody,
    halfExtents: Vector3,
    pos: Vector3,
    normal: Vector3
): number {
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

function calcRollingFriction(
    body0: Rapier.RigidBody,
    body1: Rapier.RigidBody,
    frictionPosWorld: Vector3,
    frictionDirectionWorld: Vector3,
    maxImpulse: number
): number {
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
    const todoHalfExtents = new Vector3(1, 1, 1)

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

type RevoluteJointVehicleProps = RigidBodyProps & {
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

const wheel = {
    radius: 0.5,

    directionLocal: new Vector3(0, -1, 0),
    axleLocal: new Vector3(0, 0, 1),

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
}

const minSuspensionLength =
    wheel.suspensionRestLength - wheel.maxSuspensionTravel
const maxSuspensionLength =
    wheel.suspensionRestLength + wheel.maxSuspensionTravel

const topLeftWheelPosition = new Vector3(-0.75, -0.2, 1.2)
const topRightWheelPosition = new Vector3(0.75, -0.2, 1.2)
const bottomLeftWheelPosition = new Vector3(-0.75, -0.2, -1.2)
const bottomRightWheelPosition = new Vector3(0.75, -0.2, -1.2)

const wheelPositions: Vector3[] = [
    topLeftWheelPosition,
    topRightWheelPosition,
    bottomLeftWheelPosition,
    bottomRightWheelPosition,
]

const RaycastVehicle = ({
    children,
    indexRightAxis = 2,
    indexForwardAxis = 0,
    indexUpAxis = 1,
    ...groupProps
}: RevoluteJointVehicleProps) => {
    const { orbitControls, debug } = useLevaControls()

    const rapier = useRapier()

    const camera = useThree((state) => state.camera)
    const currentCameraPosition = useRef(new Vector3(15, 15, 0))
    const currentCameraLookAt = useRef(new Vector3())

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

    const topLeftWheelArrowHelper = useRef<ArrowHelper>(null)
    const topRightWheelArrowHelper = useRef<ArrowHelper>(null)
    const bottomLeftWheelArrowHelper = useRef<ArrowHelper>(null)
    const bottomRightWheelArrowHelper = useRef<ArrowHelper>(null)

    const wheelRaycastArrowHelpers = [
        topLeftWheelArrowHelper,
        topRightWheelArrowHelper,
        bottomLeftWheelArrowHelper,
        bottomRightWheelArrowHelper,
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

    const controls = useControls()

    const resetStates = () => {
        // reset vehicle state
        vehicleState.current.sliding = false

        // reset wheel states
        for (let i = 0; i < wheelPositions.length; i++) {
            const wheelState = wheelStates.current[i]

            wheelState.inContactWithGround = false
            wheelState.groundRigidBody = null
        }
    }

    const updateStatesFromControls = () => {
        // read input
        let engineForce = 0
        let steering = 0

        if (controls.current.forward) {
            engineForce += 10
        }
        if (controls.current.backward) {
            engineForce -= 10
        }

        if (controls.current.left) {
            steering -= 10
        }
        if (controls.current.right) {
            steering += 10
        }

        const brakeForce = controls.current.brake ? 1000000 : 0

        for (let i = 0; i < wheelStates.current.length; i++) {
            const wheelState = wheelStates.current[i]
            wheelState.brakeForce = brakeForce
            wheelState.engineForce = engineForce
            wheelState.steering = steering
        }
    }

    const updateWheelTransform = () => {
        for (let i = 0; i < wheelPositions.length; i++) {
            const wheelPosition = wheelPositions[i]
            const wheelState = wheelStates.current[i]
            const wheelObject = wheelObjects[i].current

            const up = new Vector3()
            const right = new Vector3()
            const fwd = new Vector3()

            // update wheel transform world
            const chassisBody = chassisRigidBody.current.raw()
            wheelState.chassisConnectionPointWorld = pointToWorldFrame(
                chassisBody,
                wheelPosition
            )
            wheelState.directionWorld = vectorToWorldFrame(
                chassisBody,
                wheel.directionLocal
            )
            wheelState.axleWorld = vectorToWorldFrame(
                chassisBody,
                wheel.axleLocal
            )

            up.copy(wheel.directionLocal).multiplyScalar(-1)
            right.copy(wheel.axleLocal)
            fwd.copy(up).cross(right)
            fwd.normalize()
            right.normalize()

            // Rotate around steering over the wheelAxle
            const steering = wheelState.steering
            const steeringOrn = new Quaternion()
            steeringOrn.setFromAxisAngle(up, steering)

            const rotatingOrn = new Quaternion()
            rotatingOrn.setFromAxisAngle(right, wheelState.rotation)

            // World rotation of the wheel
            const q = wheelState.worldTransform.quaternion
            q.copy(chassisRigidBody.current.rotation()).multiply(steeringOrn)
            q.multiply(rotatingOrn)

            q.normalize()

            // world position of the wheel
            const p = wheelState.worldTransform.position
            p.copy(wheelState.directionWorld)
            p.multiplyScalar(wheelState.suspensionLength)
            p.add(wheelState.chassisConnectionPointWorld)

            wheelObject.position.copy(wheelState.worldTransform.position)
            wheelObject.quaternion.copy(wheelState.worldTransform.quaternion)
        }
    }

    const updateCurrentSpeed = () => {
        const chassis = chassisRigidBody.current.raw()
        const chassisVelocity = new Vector3().copy(chassis.linvel() as Vector3)

        vehicleState.current.currentVehicleSpeedKmHour =
            3.6 * chassisVelocity.length()

        const forwardWorld = new Vector3()
        getVehicleAxisWorld(chassis, indexForwardAxis, forwardWorld)

        if (forwardWorld.dot(chassisVelocity) < 0) {
            vehicleState.current.currentVehicleSpeedKmHour *= -1
        }
    }

    const updateWheelSuspension = () => {
        for (let i = 0; i < wheelPositions.length; i++) {
            const wheelPosition = wheelPositions[i]
            const wheelRaycastArrowHelper = wheelRaycastArrowHelpers[i].current
            const wheelState = wheelStates.current[i]

            const world = rapier.world.raw()

            const origin = chassisRigidBody.current
                .translation()
                .add(wheelPosition)

            const direction = new Vector3(0, -1, 0).applyQuaternion(
                chassisRigidBody.current.rotation()
            )

            const maxToi = wheel.radius + wheel.suspensionRestLength
            const ray = world.castRayAndGetNormal(
                new Rapier.Ray(origin, direction),
                maxToi,
                false,
                undefined,
                undefined,
                undefined,
                chassisRigidBody.current.raw()
            )

            // if hit
            if (ray && ray.collider) {
                // store ground rigid body
                wheelState.groundRigidBody = ray.collider.parent()

                // update wheel state
                wheelState.inContactWithGround = true
                wheelState.hitNormalWorld
                    .copy(chassisRigidBody.current.translation())
                    .add(ray.normal as Vector3)

                // compute suspension length
                const hitDistance = ray.toi
                wheelState.suspensionLength = hitDistance - wheel.radius

                // clamp on max suspension travel
                if (wheelState.suspensionLength < minSuspensionLength) {
                    wheelState.suspensionLength = minSuspensionLength
                }
                if (wheelState.suspensionLength > maxSuspensionLength) {
                    wheelState.suspensionLength = maxSuspensionLength
                }

                const denominator = new Vector3()
                    .copy(wheelState.hitNormalWorld)
                    .dot(wheelState.directionWorld)

                const chassisVelocityAtContactPoint = getVelocityAtWorldPoint(
                    chassisRigidBody.current.raw(),
                    wheelState.hitNormalWorld
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
            wheelRaycastArrowHelper?.setDirection(direction)
            wheelRaycastArrowHelper?.setLength(maxToi)
            wheelRaycastArrowHelper?.setLength(wheelState.suspensionLength)

            // calculate suspension force
            wheelState.suspensionForce = 0

            if (wheelState.inContactWithGround) {
                // spring
                const suspensionLength = wheel.suspensionRestLength
                const currentLength = wheelState.suspensionLength
                const lengthDifference = suspensionLength - currentLength

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
        for (let i = 0; i < wheelPositions.length; i++) {
            const wheelState = wheelStates.current[i]

            const impulse = new Vector3()
            const relpos = new Vector3()

            let suspensionForce = wheelState.suspensionForce
            if (suspensionForce > wheel.maxSuspensionForce) {
                suspensionForce = wheel.maxSuspensionForce
            }

            impulse
                .copy(wheelState.hitNormalWorld)
                .multiplyScalar(suspensionForce * delta)

            relpos
                .copy(wheelState.hitNormalWorld)
                .sub(chassisRigidBody.current.translation())

            chassisRigidBody.current.applyImpulseAtPoint(impulse, relpos)
        }
    }

    const updateFriction = (delta: number) => {
        const surfNormalWS_scaled_proj = new Vector3()

        for (let i = 0; i < wheelPositions.length; i++) {
            const wheelState = wheelStates.current[i]

            wheelState.sideImpulse = 0
            wheelState.forwardImpulse = 0

            if (wheelState.inContactWithGround && wheelState.groundRigidBody) {
                // get world axle
                wheelState.axle.copy(directions[indexRightAxis])
                vectorToWorldFrame(wheelState.worldTransform, wheelState.axle)

                const surfNormalWS = wheelState.hitNormalWorld
                const proj = wheelState.axle.dot(surfNormalWS)
                surfNormalWS_scaled_proj.copy(surfNormalWS).multiplyScalar(proj)
                wheelState.axle.sub(surfNormalWS_scaled_proj)
                wheelState.axle.normalize()

                wheelState.forwardWS.copy(surfNormalWS).cross(wheelState.axle)
                wheelState.forwardWS.normalize()

                wheelState.sideImpulse = resolveSingleBilateral(
                    chassisRigidBody.current.raw(),
                    wheelState.hitNormalWorld,
                    wheelState.groundRigidBody,
                    wheelState.hitNormalWorld,
                    wheelState.axle
                )

                wheelState.sideImpulse *= wheel.sideFrictionStiffness
            }
        }

        const sideFactor = 1
        const fwdFactor = 0.5

        vehicleState.current.sliding = false

        for (let i = 0; i < wheelPositions.length; i++) {
            const wheelState = wheelStates.current[i]

            let rollingFriction = 0

            wheelState.slipInfo = 1

            if (wheelState.groundRigidBody) {
                const defaultRollingFrictionImpulse = 0
                const maxImpulse = wheelState.brakeForce
                    ? wheelState.brakeForce
                    : defaultRollingFrictionImpulse

                rollingFriction = calcRollingFriction(
                    chassisRigidBody.current.raw(),
                    wheelState.groundRigidBody,
                    wheelState.hitNormalWorld,
                    wheelState.forwardWS,
                    maxImpulse
                )

                rollingFriction += wheelState.engineForce * delta

                const factor = maxImpulse / rollingFriction
                wheelState.slipInfo *= factor
            }

            // switch between active rolling (throttle), braking and non-active rolling friction (nthrottle/break)
            wheelState.forwardImpulse = 0
            wheelState.skidInfo = 1

            if (wheelState.groundRigidBody) {
                wheelState.skidInfo = 1

                const maximp =
                    wheelState.suspensionForce * delta * wheel.frictionSlip
                const maximpSide = maximp

                const maximpSquared = maximp * maximpSide

                wheelState.forwardImpulse = rollingFriction

                const x =
                    (wheelState.forwardImpulse * fwdFactor) /
                    wheel.forwardAcceleration
                const y =
                    (wheelState.sideImpulse * sideFactor) /
                    wheel.sideAcceleration

                const impulseSquared = x * x + y * y

                wheelState.sliding = false
                if (impulseSquared > maximpSquared) {
                    wheelState.sliding = true
                    wheelState.sliding = true

                    const factor = maximp / Math.sqrt(impulseSquared)

                    wheelState.skidInfo *= factor
                }
            }
        }

        if (vehicleState.current.sliding) {
            for (let i = 0; i < wheelPositions.length; i++) {
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
        for (let i = 0; i < wheelPositions.length; i++) {
            const wheelPosition = wheelPositions[i]
            const wheelRaycastArrowHelper = wheelRaycastArrowHelpers[i]
            const wheelState = wheelStates.current[i]

            const rel_pos = new Vector3().subVectors(
                wheelState.hitNormalWorld,
                chassisRigidBody.current.translation()
            )

            // rapier applyimpulse is using world coord for the position
            if (wheelState.forwardImpulse !== 0) {
                const impulse = new Vector3()
                    .copy(wheelState.forwardWS)
                    .multiplyScalar(wheelState.forwardImpulse)

                chassisRigidBody.current.applyImpulseAtPoint(
                    impulse,
                    rel_pos,
                    true
                )
            }

            if (wheelState.sideImpulse !== 0) {
                const groundObject = wheelState.groundRigidBody!

                const rel_pos2 = new Vector3().subVectors(
                    wheelState.hitNormalWorld,
                    groundObject.translation() as Vector3
                )

                const sideImp = new Vector3()
                    .copy(wheelState.axle)
                    .multiplyScalar(wheelState.sideImpulse)

                // Scale the relative position in the up direction with rollInfluence.
                // If rollInfluence is 1, the impulse will be applied on the hitPoint (easy to roll over), if it is zero it will be applied in the same plane as the center of mass (not easy to roll over).
                const localFrame = vectorToLocalFrame(
                    chassisRigidBody.current.raw(),
                    rel_pos
                )

                localFrame['xyz'[indexUpAxis] as 'x' | 'y' | 'z'] *=
                    wheel.rollInfluence

                const worldFrame = vectorToWorldFrame(
                    chassisRigidBody.current.raw(),
                    localFrame
                )

                chassisRigidBody.current
                    .raw()
                    .applyImpulseAtPoint(sideImp, worldFrame, true)

                //apply friction impulse on the ground
                sideImp.multiplyScalar(-1)
                groundObject.applyImpulseAtPoint(sideImp, rel_pos2, true)
            }
        }
    }

    const updateWheelRotation = (delta: number) => {
        const hitNormalWorldScaledWithProj = new Vector3()
        const fwd = new Vector3()
        const vel = new Vector3()

        for (let i = 0; i < wheelPositions.length; i++) {
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
        resetStates()

        updateStatesFromControls()

        updateWheelTransform()

        updateCurrentSpeed()

        updateWheelSuspension()

        applyWheelSuspensionForce(delta)

        updateFriction(delta)

        updateWheelRotation(delta)
    }, BEFORE_RAPIER_UPDATE)

    useFrame((_, delta) => {
        if (orbitControls || !chassisRigidBody.current) {
            return
        }

        const t = 1.0 - Math.pow(0.01, delta)

        const idealOffset = new Vector3(0, 5, -10)
        idealOffset.applyQuaternion(chassisRigidBody.current.rotation())
        idealOffset.add(chassisRigidBody.current.translation())
        if (idealOffset.y < 0) {
            idealOffset.y = 0
        }

        const idealLookAt = new Vector3(0, 1, 0)
        idealLookAt.applyQuaternion(chassisRigidBody.current.rotation())
        idealLookAt.add(chassisRigidBody.current.translation())

        currentCameraPosition.current.lerp(idealOffset, t)
        camera.position.copy(currentCameraPosition.current)

        currentCameraLookAt.current.lerp(idealLookAt, t)
        camera.lookAt(currentCameraLookAt.current)
    }, AFTER_RAPIER_UPDATE)

    return (
        <>
            <RigidBody {...groupProps} colliders={false} ref={chassisRigidBody}>
                {/* chassis */}
                <mesh>
                    <boxGeometry args={[1, 0.8, 1.5]} />
                    <meshStandardMaterial color="#888" />
                </mesh>

                <CuboidCollider ref={chassisCollider} args={[0.5, 0.4, 0.75]} />

                {/* wheel raycast arrow helpers */}
                {debug && (
                    <>
                        <arrowHelper
                            ref={topLeftWheelArrowHelper}
                            position={topLeftWheelPosition}
                        />
                        <arrowHelper
                            ref={topRightWheelArrowHelper}
                            position={topRightWheelPosition}
                        />
                        <arrowHelper
                            ref={bottomLeftWheelArrowHelper}
                            position={bottomLeftWheelPosition}
                        />
                        <arrowHelper
                            ref={bottomRightWheelArrowHelper}
                            position={bottomRightWheelPosition}
                        />
                    </>
                )}
            </RigidBody>

            {/* top left wheel */}
            <group ref={topLeftWheelObject}>
                <mesh rotation-z={-Math.PI / 2}>
                    <cylinderGeometry args={[0.5, 0.5, 0.3, 16]} />
                    <meshStandardMaterial color="#888" />
                </mesh>
            </group>

            {/* top right wheel */}
            <group ref={topRightWheelObject}>
                <mesh rotation-z={-Math.PI / 2}>
                    <cylinderGeometry args={[0.5, 0.5, 0.3, 16]} />
                    <meshStandardMaterial color="#888" />
                </mesh>
            </group>

            {/* bottom left wheel */}
            <group ref={bottomLeftWheelObject}>
                <mesh rotation-z={-Math.PI / 2}>
                    <cylinderGeometry args={[0.5, 0.5, 0.3, 16]} />
                    <meshStandardMaterial color="#888" />
                </mesh>
            </group>

            {/* bottom right wheel */}
            <group ref={bottomRightWheelObject}>
                <mesh rotation-z={-Math.PI / 2}>
                    <cylinderGeometry args={[0.5, 0.5, 0.3, 16]} />
                    <meshStandardMaterial color="#888" />
                </mesh>
            </group>
        </>
    )
}

const Scene = () => (
    <>
        {/* ramp */}
        <RigidBody type="fixed">
            <mesh rotation-x={-0.2} position={[0, -1, 15]}>
                <boxGeometry args={[5, 1, 5]} />
                <meshStandardMaterial color="#888" />
            </mesh>
        </RigidBody>

        {/* ground */}
        <RigidBody type="fixed" friction={2} position-y={-2}>
            <mesh>
                <boxGeometry args={[150, 2, 150]} />
                <meshStandardMaterial color="#ccc" />
            </mesh>
        </RigidBody>
        <gridHelper args={[150, 15]} position-y={-0.99} />

        {/* lights */}
        <ambientLight intensity={1} />
        <pointLight intensity={0.5} position={[0, 5, 5]} />
    </>
)

export default () => {
    const { debug, orbitControls } = useLevaControls()

    return (
        <>
            <h1>Rapier - Raycast Vehicle</h1>
            <Canvas camera={{ fov: 60, position: [30, 30, 0] }}>
                <Physics
                    gravity={[0, -9.81, 0]}
                    updatePriority={RAPIER_UPDATE_PRIORITY}
                >
                    <RaycastVehicle position={[0, 3, 0]}></RaycastVehicle>

                    <Scene />
                    {debug && <Debug />}

                    {orbitControls && <OrbitControls />}
                </Physics>
            </Canvas>
            <Controls>use wasd to drive</Controls>
        </>
    )
}
