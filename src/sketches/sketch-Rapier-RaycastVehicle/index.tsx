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
import { useControls as useLevaControls } from 'leva'
import { useRef } from 'react'
import styled from 'styled-components'
import { ArrowHelper, Quaternion, Vector3 } from 'three'
import { Canvas } from '../Canvas'
import { useControls } from './use-controls'

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

const RAPIER_UPDATE_PRIORITY = -50
const BEFORE_RAPIER_UPDATE = RAPIER_UPDATE_PRIORITY + 1
const AFTER_RAPIER_UPDATE = RAPIER_UPDATE_PRIORITY - 1

const getVelocityAtWorldPoint = (
    rigidBody: Rapier.RigidBody,
    worldPoint: Vector3
): Vector3 => {
    const r = new Vector3()

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
            new Quaternion().copy(
                rigidBody.rotation() as Quaternion
            )
        )
        .add(rigidBody.translation() as Vector3)
    return result
}

const vectorToWorldFrame = (
    rigidBody: Rapier.RigidBody,
    localVector: Vector3
): Vector3 => {
    return localVector.applyQuaternion(
        new Quaternion().copy(rigidBody.rotation() as Quaternion)
    )
}

type RevoluteJointVehicleProps = RigidBodyProps

type WheelState = {
    suspensionLength: number
    suspensionRelativeVelocity: number
    suspensionForce: number
    clippedInvContactDotSuspension: number
    directionWorld: Vector3
    inContactWithGround: boolean
    hitNormalWorld: Vector3
    chassisConnectionPointWorld: Vector3
    axleWorld: Vector3
}

const wheel = {
    radius: 0.5,
    directionLocal: new Vector3(0, -1, 0),
    suspensionStiffness: 30,
    suspensionRestLength: 0.3,
    frictionSlip: 1.4,
    dampingRelaxation: 2.3,
    dampingCompression: 4.4,
    maxSuspensionForce: 100000,
    rollInfluence: 0.01,
    axleLocal: new Vector3(0, 0, 1),
    maxSuspensionTravel: 0.3,
    customSlidingRotationalSpeed: -30,
    useCustomSlidingRotationalSpeed: true,
}

const minSuspensionLength =
    wheel.suspensionRestLength - wheel.maxSuspensionTravel
const maxSuspensionLength =
    wheel.suspensionRestLength + wheel.maxSuspensionTravel

const wheelPositions: Vector3[] = [
    // top left wheel
    new Vector3(-0.75, -0.2, 1.2),
    // top right wheel
    new Vector3(0.75, -0.2, 1.2),
    // back left wheel
    new Vector3(-0.75, -0.2, -1.2),
    // back right wheel
    new Vector3(0.75, -0.2, -1.2),
]

const topLeftWheelPosition = wheelPositions[0]
const topRightWheelPosition = wheelPositions[1]
const bottomLeftWheelPosition = wheelPositions[2]
const bottomRightWheelPosition = wheelPositions[3]

const RaycastVehicle = ({
    children,
    ...groupProps
}: RevoluteJointVehicleProps) => {
    const { orbitControls } = useLevaControls(LEVA_KEY, {
        orbitControls: false,
    })
    const rapier = useRapier()

    const camera = useThree((state) => state.camera)
    const currentCameraPosition = useRef(new Vector3(15, 15, 0))
    const currentCameraLookAt = useRef(new Vector3())

    const wheelStates = useRef<WheelState[]>(
        Array.from({ length: 4 })
            .fill(0)
            .map(() => ({
                suspensionLength: 0,
                suspensionForce: 0,
                suspensionRelativeVelocity: 0,
                clippedInvContactDotSuspension: 1,
                directionWorld: new Vector3(),
                inContactWithGround: false,
                hitNormalWorld: new Vector3(),
                chassisConnectionPointWorld: new Vector3(),
                axleWorld: new Vector3(),
            }))
    )

    const topLeftWheelArrowHelper = useRef<ArrowHelper>(null!)
    const topRightWheelArrowHelper = useRef<ArrowHelper>(null!)
    const bottomLeftWheelArrowHelper = useRef<ArrowHelper>(null!)
    const bottomRightWheelArrowHelper = useRef<ArrowHelper>(null!)

    const wheelRaycastArrowHelpers = [
        topLeftWheelArrowHelper,
        topRightWheelArrowHelper,
        bottomLeftWheelArrowHelper,
        bottomRightWheelArrowHelper,
    ]

    const chassisRigidBody = useRef<RigidBodyApi>(null!)
    const chassisCollider = useRef<Rapier.Collider[]>(null!)

    const controls = useControls()

    useFrame((_, delta) => {
        const world = rapier.world.raw()

        // read input
        let forward = 0
        let right = 0

        if (controls.current.forward) {
            forward += 5000 * delta
        }
        if (controls.current.backward) {
            forward -= 5000 * delta
        }

        if (controls.current.left) {
            right -= 20
        }
        if (controls.current.right) {
            right += 20
        }

        // get current speed
        // ...

        for (let i = 0; i < wheelPositions.length; i++) {
            const wheelPosition = wheelPositions[i]
            const wheelRaycastArrowHelper = wheelRaycastArrowHelpers[i]
            const wheelState = wheelStates.current[i]

            // reset wheel states
            wheelState.inContactWithGround = false
            
            // update wheel transform
            const chassisBody = chassisRigidBody.current.raw()
            wheelState.chassisConnectionPointWorld = pointToWorldFrame(
                chassisBody,
                wheelPosition
            )
            wheelState.directionWorld = vectorToWorldFrame(
                chassisBody,
                wheel.directionLocal
            )
            wheelState.axleWorld = vectorToWorldFrame(chassisBody, wheel.axleLocal)

            // simulate wheel suspension
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
            wheelRaycastArrowHelper.current.setDirection(direction)
            wheelRaycastArrowHelper.current.setLength(maxToi)
            wheelRaycastArrowHelper.current.setLength(
                wheelState.suspensionLength
            )

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

            // apply suspension force
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

        // update friction
        // ...

        // update wheel rotation
        // ...
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
                <mesh>
                    <boxGeometry args={[1, 0.8, 1.5]} />
                    <meshStandardMaterial color="#888" />
                </mesh>

                <CuboidCollider ref={chassisCollider} args={[0.5, 0.4, 0.75]} />

                {/* wheel raycast arrow helpers */}
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
            </RigidBody>
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
    const { debug, orbitControls } = useLevaControls(LEVA_KEY, {
        debug: false,
        orbitControls: false,
    })
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
