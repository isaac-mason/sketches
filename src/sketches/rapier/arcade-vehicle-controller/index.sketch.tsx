import { KeyboardControls, OrbitControls, PerspectiveCamera, useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { BallCollider, Physics, RapierRigidBody, RigidBody } from '@react-three/rapier'
import { useControls } from 'leva'
import { useRef } from 'react'
import * as THREE from 'three'
import { Canvas } from '../../../common'

type KeyControls = {
    accelerate: boolean
    decelerate: boolean
    left: boolean
    right: boolean
    hop: boolean
}

const controls = [
    { name: 'accelerate', keys: ['KeyW'] },
    { name: 'decelerate', keys: ['KeyS'] },
    { name: 'left', keys: ['KeyA'] },
    { name: 'right', keys: ['KeyD'] },
    { name: 'hop', keys: ['Space'] },
]

const up = new THREE.Vector3(0, 1, 0)
const maxForwardSpeed = 8
const maxReverseSpeed = -1
const damping = -0.1

const wheels = [
    // front
    { position: new THREE.Vector3(-0.45, -0.15, -0.4) },
    { position: new THREE.Vector3(0.45, -0.15, -0.4) },
    // rear
    { position: new THREE.Vector3(-0.45, -0.15, 0.4) },
    { position: new THREE.Vector3(0.45, -0.15, 0.4) },
]

const _bodyPosition = new THREE.Vector3()
const _bodyQuaternion = new THREE.Quaternion()
const _bodyVelocity = new THREE.Vector3()
const _cameraPosition = new THREE.Vector3()
const _impulse = new THREE.Vector3()
const _steeringAngleQuat = new THREE.Quaternion()

const ArcadeVehicle = () => {
    const bodyRef = useRef<RapierRigidBody>(null!)
    const groupRef = useRef<THREE.Group>(null!)
    const wheelsRef = useRef<(THREE.Object3D | null)[]>([])

    const wheelRotation = useRef(0)

    const steeringAngle = useRef(0)
    const steeringSpeed = useRef(1)
    const speed = useRef(0)
    const grounded = useRef(false)

    const [, getKeyboardControls] = useKeyboardControls()

    useFrame((state, delta) => {
        const controls = getKeyboardControls() as KeyControls
        const { accelerate, decelerate, left, right, hop } = controls

        const bodyPosition = _bodyPosition.copy(bodyRef.current.translation())

        // steering and acceleration
        const steering = (Number(left) - Number(right)) * steeringSpeed.current
        steeringAngle.current += steering * 0.05
        const steeringAngleQuat = _steeringAngleQuat.setFromAxisAngle(up, steeringAngle.current)

        if (accelerate) {
            speed.current = THREE.MathUtils.lerp(speed.current, maxForwardSpeed, 1 - Math.pow(0.01, delta))
        } else if (decelerate) {
            speed.current = THREE.MathUtils.lerp(speed.current, -maxForwardSpeed, 1 - Math.pow(0.01, delta))
        } else {
            speed.current = THREE.MathUtils.lerp(speed.current, 0, 1 - Math.pow(0.01, delta))
        }

        speed.current = THREE.MathUtils.clamp(speed.current, maxReverseSpeed, maxForwardSpeed)

        const impulse = _impulse.set(0, 0, -speed.current).multiplyScalar(5)

        if (grounded.current && hop) {
            impulse.y = 8
        }

        impulse.applyQuaternion(steeringAngleQuat)

        if (impulse.length() > 0) {
            bodyRef.current.applyImpulse(impulse, true)
        }

        // apply damping
        bodyRef.current.applyImpulse(
            {
                x: -bodyRef.current.linvel().x * (1 - damping) * delta * 144,
                y: 0,
                z: -bodyRef.current.linvel().z * (1 - damping) * delta * 144,
            },
            true,
        )

        // car visuals
        groupRef.current.position.copy(bodyPosition)
        groupRef.current.quaternion.copy(steeringAngleQuat)

        wheelRotation.current -= speed.current / 100
        wheelsRef.current.forEach((wheel) => {
            if (!wheel) return

            wheel.rotation.order = 'YXZ'
            wheel.rotation.x = wheelRotation.current
        })

        const frontWheelsSteeringAngle = steering * 0.5
        wheelsRef.current[1]!.rotation.y = frontWheelsSteeringAngle
        wheelsRef.current[0]!.rotation.y = frontWheelsSteeringAngle

        // camera
        if (!state.controls) {
            const cameraPosition = _cameraPosition.set(0, 4, 10).applyQuaternion(steeringAngleQuat).add(bodyPosition)
            state.camera.position.copy(cameraPosition)
            state.camera.lookAt(bodyPosition)
        }
    })

    return (
        <>
            <RigidBody ref={bodyRef} colliders={false} position={[0, 2, 0]} mass={3} ccd name="player" type="dynamic">
                <BallCollider
                    args={[0.7]}
                    mass={3}
                    onCollisionEnter={() => {
                        grounded.current = true
                    }}
                    onCollisionExit={() => {
                        grounded.current = false
                    }}
                />
            </RigidBody>

            <group ref={groupRef}>
                <group position-y={-0.35}>
                    <mesh>
                        <boxGeometry args={[0.8, 0.4, 1.2]} />
                        <meshBasicMaterial color="#fff" />
                    </mesh>

                    {wheels.map((wheel, index) => (
                        <group key={index} ref={(ref) => ((wheelsRef.current as any)[index] = ref)} position={wheel.position}>
                            <group rotation-z={-Math.PI / 2}>
                                <mesh>
                                    <cylinderGeometry args={[0.15, 0.15, 0.25, 16]} />
                                    <meshStandardMaterial color="#222" />
                                </mesh>
                                <mesh scale={1.01}>
                                    <cylinderGeometry args={[0.15, 0.15, 0.25, 6]} />
                                    <meshStandardMaterial color="#fff" wireframe />
                                </mesh>
                            </group>
                        </group>
                    ))}
                </group>
            </group>
        </>
    )
}
export default function Sketch() {
    const { orbitControls } = useControls('rapier/arcade-vehicle-controller', {
        orbitControls: false,
    })

    return (
        <Canvas>
            <Physics debug>
                <KeyboardControls map={controls}>
                    <ArcadeVehicle />
                </KeyboardControls>

                <RigidBody type="fixed">
                    <mesh>
                        <boxGeometry args={[100, 1, 100]} />
                        <meshStandardMaterial color="#999" />
                    </mesh>
                </RigidBody>

                <gridHelper args={[100, 100]} position-y={0.51} />

                <ambientLight intensity={3} />
                <pointLight intensity={15} decay={1.5} position={[5, 5, 5]} />

                {orbitControls && <OrbitControls makeDefault />}
                <PerspectiveCamera makeDefault position={[0, 5, 10]} />
            </Physics>
        </Canvas>
    )
}
