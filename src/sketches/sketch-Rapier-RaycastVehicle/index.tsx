import {
    ContactShadows,
    Environment,
    Lightformer,
    OrbitControls,
    Reflector,
    Stars,
} from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, Debug, Physics, RigidBody } from '@react-three/rapier'
import { useControls as useLeva } from 'leva'
import { useEffect, useRef, useState } from 'react'
import { MeshStandardMaterial, Object3D, Vector3 } from 'three'
import { Canvas } from '../Canvas'
import { ControlsText } from './components/controls-text'
import { SpeedText } from './components/speed-text'
import { SpeedTextTunnel } from './components/speed-text-tunnel'
import { Vehicle, VehicleRef } from './components/vehicle'
import {
    GameStateProvider,
    useGameState,
    useGameStateDispatch,
} from './game-state'
import { useControls } from './hooks/use-controls'
import { LEVA_KEY } from './util/leva-key'
import {
    AFTER_RAPIER_UPDATE,
    BEFORE_RAPIER_UPDATE,
    RAPIER_UPDATE_PRIORITY,
} from './util/rapier'

const LampPost = (props: JSX.IntrinsicElements['group']) => {
    const [target] = useState(() => {
        const object = new Object3D()
        object.position.set(-4, 0, 0)
        return object
    })

    return (
        <group {...props}>
            <RigidBody colliders="cuboid" type="fixed">
                <mesh position={[0, 5, 0]} castShadow receiveShadow>
                    <cylinderGeometry args={[0.1, 0.1, 10, 32]} />
                    <meshStandardMaterial color="#000" />
                </mesh>
            </RigidBody>
            <mesh position={[-0.4, 10, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.2, 0.2, 0.5]} />
                <meshStandardMaterial color="#000" />
            </mesh>
            <mesh position={[-0.6, 9.89, 0]} rotation-x={Math.PI / 2}>
                <planeGeometry args={[0.4, 0.2]} />
                <meshStandardMaterial color="#fff" />
            </mesh>
            <primitive object={target} />
            <spotLight
                position={[-0.6, 10, 0]}
                target={target}
                intensity={1}
                angle={1}
                penumbra={1}
                castShadow
            />
        </group>
    )
}

const TrafficCone = (props: JSX.IntrinsicElements['group']) => {
    return (
        <group {...props}>
            <RigidBody colliders="cuboid">
                <mesh position-y={-0.5} castShadow receiveShadow>
                    <boxGeometry args={[0.8, 0.1, 0.8]} />
                    <meshStandardMaterial color="orange" />
                </mesh>
                <mesh castShadow receiveShadow>
                    <cylinderGeometry args={[0.1, 0.3, 1, 32]} />
                    <meshStandardMaterial color="orange" />
                </mesh>
                <mesh position-y={-0.1} castShadow receiveShadow>
                    <cylinderGeometry args={[0.215, 0.235, 0.1, 32]} />
                    <meshStandardMaterial color="white" />
                </mesh>
            </RigidBody>
        </group>
    )
}

const Game = () => {
    const raycastVehicle = useRef<VehicleRef>(null)
    const currentSpeedTextDiv = useRef<HTMLDivElement>(null)

    const camera = useThree((state) => state.camera)
    const currentCameraPosition = useRef(new Vector3(15, 15, 0))
    const currentCameraLookAt = useRef(new Vector3())

    const controls = useControls()

    const gameState = useGameState()
    const { setDisplayMode } = useGameStateDispatch()

    const { maxForce, maxSteer, maxBrake } = useLeva(`${LEVA_KEY}-controls`, {
        maxForce: 500,
        maxSteer: 0.5,
        maxBrake: 10,
    })

    const { debug } = useLeva(`${LEVA_KEY}-physics`, {
        debug: false,
    })

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (['p', 'P'].includes(event.key)) {
                setDisplayMode('drive')
            } else if (['o', 'O'].includes(event.key)) {
                setDisplayMode('editor')
            }
        }

        document.addEventListener('keyup', handler)

        return () => {
            document.removeEventListener('keyup', handler)
        }
    }, [])

    useFrame((_, delta) => {
        if (
            !raycastVehicle.current ||
            !raycastVehicle.current.rapierRaycastVehicle.current
        ) {
            return
        }

        const {
            wheels,
            rapierRaycastVehicle: { current: vehicle },
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
        const clampedDelta = Math.min(delta, 1 / 60)
        vehicle.update(clampedDelta)

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
    }, BEFORE_RAPIER_UPDATE)

    useFrame((_, delta) => {
        if (gameState.displayMode !== 'drive') return

        const chassis = raycastVehicle.current?.chassisRigidBody
        if (!chassis?.current) return

        const t = 1.0 - Math.pow(0.01, delta)

        const idealOffset = new Vector3(-10, 5, 0)
        idealOffset.applyQuaternion(chassis.current.rotation())
        idealOffset.add(chassis.current.translation())
        if (idealOffset.y < 0) {
            idealOffset.y = 0
        }

        const idealLookAt = new Vector3(0, 1, 0)
        idealLookAt.applyQuaternion(chassis.current.rotation())
        idealLookAt.add(chassis.current.translation())

        currentCameraPosition.current.lerp(idealOffset, t)
        currentCameraLookAt.current.lerp(idealLookAt, t)

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
            <TrafficCone position={[4, 0, 6]} />
            <TrafficCone position={[2, 0, 8]} />
            <TrafficCone position={[4, 0, 10]} />

            <TrafficCone position={[-4, 0, 16]} />
            <TrafficCone position={[-2, 0, 18]} />
            <TrafficCone position={[-4, 0, 20]} />

            {/* ramp */}
            <RigidBody type="fixed">
                <mesh rotation-x={-0.3} position={[0, -1, 30]}>
                    <boxGeometry args={[10, 1, 10]} />
                    <meshStandardMaterial color="#888" />
                </mesh>
            </RigidBody>

            {/* boxes */}
            {Array.from({ length: 6 }).map((_, idx) => (
                <RigidBody key={idx} colliders="cuboid" mass={10}>
                    <mesh position={[0, 2 + idx * 4.1, 40]}>
                        <boxGeometry args={[2, 1, 2]} />
                        <meshStandardMaterial color="orange" />
                    </mesh>
                </RigidBody>
            ))}

            {/* bumps */}
            <group position={[0, 0, 50]}>
                {Array.from({ length: 6 }).map((_, idx) => (
                    <RigidBody
                        key={idx}
                        colliders={false}
                        type="fixed"
                        mass={10}
                        rotation={[0, 0, Math.PI / 2]}
                        position={[idx % 2 === 0 ? -0.8 : 0.8, -0.42, idx * 1.5]}
                    >
                        <CylinderCollider args={[1, 0.5]} />
                        <mesh>
                            <cylinderBufferGeometry args={[0.5, 0.5, 2]} />
                            <meshStandardMaterial color="#ccc" />
                        </mesh>
                    </RigidBody>
                ))}
            </group>

            {/* ground */}
            <RigidBody type="fixed" position-y={-5} colliders={false}>
                <CuboidCollider args={[150, 5, 150]} />
                <mesh receiveShadow>
                    <boxGeometry args={[300, 10, 300]} />
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
            <Environment preset='night' />
            
            <Stars />

            {gameState.displayMode === 'editor' && <OrbitControls />}
            
            {debug ? <Debug /> : null}
        </>
    )
}

export default () => {
    return (
        <>
            <h1>Rapier - Raycast Vehicle</h1>

            <Canvas camera={{ fov: 60, position: [0, 30, -20] }} shadows>
                <color attach="background" args={['#000']} />

                <GameStateProvider>
                    <Physics
                        gravity={[0, -9.81, 0]}
                        updatePriority={RAPIER_UPDATE_PRIORITY}
                        timeStep="vary"
                    >
                        <Game />
                    </Physics>
                </GameStateProvider>
            </Canvas>

            <SpeedTextTunnel.Out />

            <ControlsText>use wasd to drive</ControlsText>
        </>
    )
}
