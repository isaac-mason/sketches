import { Environment, OrbitControls, Stars } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
    CuboidCollider,
    CylinderCollider,
    Physics,
    RigidBody,
    useBeforePhysicsStep,
} from '@react-three/rapier'
import { useControls as useLeva } from 'leva'
import { useRef } from 'react'
import styled from 'styled-components'
import { Quaternion, Vector3 } from 'three'
import { useLoadingAssets } from '../../hooks/use-loading-assets'
import { usePageVisible } from '../../hooks/use-page-visible'
import { Canvas } from '../../components/canvas'
import { LampPost } from './components/lamp-post'
import { TrafficCone } from './components/traffic-cone'
import { Vehicle, VehicleRef } from './components/vehicle'
import {
    AFTER_RAPIER_UPDATE,
    LEVA_KEY,
    RAPIER_UPDATE_PRIORITY,
} from './constants'
import { SpeedTextTunnel } from './constants/speed-text-tunnel'
import { useControls } from './hooks/use-controls'

const Text = styled.div`
    width: 100%;
    text-align: center;
    font-size: 2em;
    color: white;
    font-family: monospace;
    text-shadow: 2px 2px black;
`

const ControlsText = styled(Text)`
    position: absolute;
    bottom: 4em;
    left: 0;
`

const SpeedText = styled(Text)`
    position: absolute;
    bottom: 2em;
    left: 0;
`

const cameraIdealOffset = new Vector3()
const cameraIdealLookAt = new Vector3()
const chassisTranslation = new Vector3()
const chassisRotation = new Quaternion()

const Game = () => {
    const raycastVehicle = useRef<VehicleRef>(null)
    const currentSpeedTextDiv = useRef<HTMLDivElement>(null)

    const camera = useThree((state) => state.camera)
    const currentCameraPosition = useRef(new Vector3(15, 15, 0))
    const currentCameraLookAt = useRef(new Vector3())

    const controls = useControls()

    const { cameraMode } = useLeva(`${LEVA_KEY}-camera`, {
        cameraMode: {
            value: 'drive',
            options: ['drive', 'orbit'],
        },
    })

    const { maxForce, maxSteer, maxBrake } = useLeva(`${LEVA_KEY}-controls`, {
        maxForce: 30,
        maxSteer: 10,
        maxBrake: 2,
    })

    useBeforePhysicsStep((world) => {
        if (
            !raycastVehicle.current ||
            !raycastVehicle.current.rapierRaycastVehicle.current
        ) {
            return
        }

        const {
            wheels,
            rapierRaycastVehicle: { current: vehicle },
            setBraking,
        } = raycastVehicle.current

        // update wheels from controls
        let engineForce = 0
        let steering = 0

        if (controls.current.forward) {
            engineForce += maxForce
        }
        if (controls.current.backward) {
            engineForce -= maxForce
        }

        if (controls.current.left) {
            steering += maxSteer
        }
        if (controls.current.right) {
            steering -= maxSteer
        }

        const brakeForce = controls.current.brake ? maxBrake : 0

        for (let i = 0; i < vehicle.wheels.length; i++) {
            vehicle.setBrakeValue(brakeForce, i)
        }

        // steer front wheels
        vehicle.setSteeringValue(steering, 0)
        vehicle.setSteeringValue(steering, 1)

        // apply engine force to back wheels
        vehicle.applyEngineForce(engineForce, 2)
        vehicle.applyEngineForce(engineForce, 3)

        // update the vehicle
        vehicle.update(world.timestep)

        // update the wheels
        for (let i = 0; i < vehicle.wheels.length; i++) {
            const wheelObject = wheels[i].object.current
            if (!wheelObject) continue

            const wheelState = vehicle.wheels[i].state
            wheelObject.position.copy(wheelState.worldTransform.position)
            wheelObject.quaternion.copy(wheelState.worldTransform.quaternion)
        }

        // update speed text
        if (currentSpeedTextDiv.current) {
            const km = Math.abs(
                vehicle.state.currentVehicleSpeedKmHour
            ).toFixed()
            currentSpeedTextDiv.current.innerText = `${km} km/h`
        }

        // update brake lights
        setBraking(brakeForce > 0)
    })

    useFrame((_, delta) => {
        if (cameraMode !== 'drive') return

        const chassis = raycastVehicle.current?.chassisRigidBody
        if (!chassis?.current) return

        chassisRotation.copy(chassis.current.rotation() as Quaternion)
        chassisTranslation.copy(chassis.current.translation() as Vector3)

        const t = 1.0 - Math.pow(0.01, delta)

        cameraIdealOffset.set(-10, 3, 0)
        cameraIdealOffset.applyQuaternion(chassisRotation)
        cameraIdealOffset.add(chassisTranslation)

        if (cameraIdealOffset.y < 0) {
            cameraIdealOffset.y = 0.5
        }

        cameraIdealLookAt.set(0, 1, 0)
        cameraIdealLookAt.applyQuaternion(chassisRotation)
        cameraIdealLookAt.add(chassisTranslation)

        currentCameraPosition.current.lerp(cameraIdealOffset, t)
        currentCameraLookAt.current.lerp(cameraIdealLookAt, t)

        camera.position.copy(currentCameraPosition.current)
        camera.lookAt(currentCameraLookAt.current)
    }, AFTER_RAPIER_UPDATE)

    return (
        <>
            <SpeedTextTunnel.In>
                <SpeedText ref={currentSpeedTextDiv} />
            </SpeedTextTunnel.In>

            {/* raycast vehicle */}
            <Vehicle
                ref={raycastVehicle}
                position={[0, 5, 0]}
                rotation={[0, -Math.PI / 2, 0]}
            />

            {/* lamp posts */}
            <LampPost position={[10, 0, 0]} />
            <LampPost position={[-10, 0, 25]} rotation-y={Math.PI} />
            <LampPost position={[10, 0, 50]} />
            <LampPost position={[-10, 0, 75]} rotation-y={Math.PI} />
            <LampPost position={[10, 0, 100]} />

            {/* traffic cones */}
            <TrafficCone position={[4, 0.2, 6]} />
            <TrafficCone position={[2, 0.2, 8]} />
            <TrafficCone position={[4, 0.2, 10]} />

            <TrafficCone position={[-4, 0.2, 16]} />
            <TrafficCone position={[-2, 0.2, 18]} />
            <TrafficCone position={[-4, 0.2, 20]} />

            {/* ramp */}
            <RigidBody type="fixed">
                <mesh rotation-x={-0.3} position={[0, -1, 30]}>
                    <boxGeometry args={[10, 1, 10]} />
                    <meshStandardMaterial color="orange" />
                </mesh>
            </RigidBody>

            {/* bumps */}
            <group position={[0, 0, 50]}>
                {Array.from({ length: 6 }).map((_, idx) => (
                    <RigidBody
                        key={idx}
                        colliders={false}
                        type="fixed"
                        mass={10}
                        rotation={[0, 0, Math.PI / 2]}
                        position={[
                            idx % 2 === 0 ? -0.8 : 0.8,
                            -0.42,
                            idx * 1.5,
                        ]}
                    >
                        <CylinderCollider args={[1, 0.5]} />
                        <mesh>
                            <cylinderGeometry args={[0.5, 0.5, 2]} />
                            <meshStandardMaterial color="orange" />
                        </mesh>
                    </RigidBody>
                ))}
            </group>

            {/* boxes */}
            {Array.from({ length: 6 }).map((_, idx) => (
                <RigidBody key={idx} colliders="cuboid" mass={0.2}>
                    <mesh position={[0, 2 + idx * 2.5, 70]}>
                        <boxGeometry args={[2, 1, 2]} />
                        <meshStandardMaterial color="orange" />
                    </mesh>
                </RigidBody>
            ))}

            {/* ground */}
            <RigidBody
                type="fixed"
                position-z={75}
                position-y={-5}
                colliders={false}
                friction={1}
            >
                <CuboidCollider args={[120, 5, 120]} />
                <mesh receiveShadow>
                    <boxGeometry args={[240, 10, 240]} />
                    <meshStandardMaterial color="#303030" />
                </mesh>
            </RigidBody>

            <mesh
                position={[0, 0.02, 50]}
                rotation-x={-Math.PI / 2}
                receiveShadow
            >
                <planeGeometry args={[15, 150]} />
                <meshStandardMaterial color="#222" depthWrite={false} />
            </mesh>

            <hemisphereLight intensity={0.25} />
            <ambientLight intensity={0.1} />
            <Environment preset="night" />

            <Stars />

            {cameraMode === 'orbit' && <OrbitControls />}
        </>
    )
}

export default () => {
    const loading = useLoadingAssets()
    const visible = usePageVisible()

    const { debug } = useLeva(`${LEVA_KEY}-physics`, {
        debug: false,
    })

    return (
        <>
            <h1>Rapier - Raycast Vehicle</h1>

            <Canvas camera={{ fov: 60, position: [0, 30, -20] }} shadows>
                <color attach="background" args={['#000']} />

                <Physics
                    gravity={[0, -9.81, 0]}
                    updatePriority={RAPIER_UPDATE_PRIORITY}
                    // todo: support fixed timestepping
                    // right now if timeStep is not "vary", the wheel positions will be incorrect and will visually jitter
                    timeStep="vary"
                    paused={!visible || loading}
                    debug={debug}
                >
                    <Game />
                </Physics>
            </Canvas>

            <SpeedTextTunnel.Out />

            <ControlsText>use wasd to drive, space to break</ControlsText>
        </>
    )
}
