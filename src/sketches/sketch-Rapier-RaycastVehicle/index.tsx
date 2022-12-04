import { useFrame, useThree } from '@react-three/fiber'
import { Debug, Physics, RigidBody } from '@react-three/rapier'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { Canvas } from '../Canvas'
import { ControlsText } from './components/controls-text'
import { RaycastVehicle, RaycastVehicleRef } from './components/raycast-vehicle'
import { SpeedTextTunnel } from './components/speed-text-tunnel'
import {
    GameStateProvider,
    useGameState,
    useGameStateDispatch,
} from './game-state'
import { useControls } from './hooks/use-controls'
import {
    AFTER_RAPIER_UPDATE,
    BEFORE_RAPIER_UPDATE,
    RAPIER_UPDATE_PRIORITY,
} from './util/rapier'
import { useControls as useLeva } from 'leva'
import { LEVA_KEY } from './util/leva-key'
import { SpeedText } from './components/speed-text'
import { OrbitControls } from '@react-three/drei'

const Game = () => {
    const raycastVehicle = useRef<RaycastVehicleRef>(null)
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
            <RaycastVehicle
                ref={raycastVehicle}
                position={[0, 3, 0]}
                rotation={[0, -Math.PI / 2, 0]}
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

            {/* controls */}
            {gameState.displayMode === 'editor' && <OrbitControls />}
        </>
    )
}

export default () => {
    return (
        <>
            <h1>Rapier - Raycast Vehicle</h1>

            <Canvas camera={{ fov: 60, position: [0, 30, -20] }}>
                <GameStateProvider>
                    <Physics
                        gravity={[0, -9.81, 0]}
                        updatePriority={RAPIER_UPDATE_PRIORITY}
                        timeStep="vary"
                    >
                        <Game />
                        <Debug />
                    </Physics>
                </GameStateProvider>
            </Canvas>

            <SpeedTextTunnel.Out />

            <ControlsText>use wasd to drive</ControlsText>
        </>
    )
}
