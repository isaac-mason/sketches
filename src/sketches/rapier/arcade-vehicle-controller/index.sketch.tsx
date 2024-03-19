import { KeyboardControls, OrbitControls, PerspectiveCamera, useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { BallCollider, Physics, RapierRigidBody, RigidBody, RigidBodyProps, useBeforePhysicsStep } from '@react-three/rapier'
import { useControls } from 'leva'
import { useRef } from 'react'
import * as THREE from 'three'
import { Canvas } from '@/common'

const SKETCH = 'rapier/arcade-vehicle-controller'

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

const wheels = [
    // front
    { position: new THREE.Vector3(-0.45, -0.15, -0.4) },
    { position: new THREE.Vector3(0.45, -0.15, -0.4) },
    // rear
    { position: new THREE.Vector3(-0.45, -0.15, 0.4) },
    { position: new THREE.Vector3(0.45, -0.15, 0.4) },
]

const _bodyPosition = new THREE.Vector3()
const _bodyEuler = new THREE.Euler()
const _cameraPosition = new THREE.Vector3()
const _impulse = new THREE.Vector3()

const ArcadeVehicle = (props: RigidBodyProps) => {
    const bodyRef = useRef<RapierRigidBody>(null!)
    const groupRef = useRef<THREE.Group>(null!)
    const wheelsRef = useRef<(THREE.Object3D | null)[]>([])

    const wheelRotation = useRef(0)
    const steering = useRef(0)
    const steeringAngle = useRef(0)
    const steeringAngleQuat = useRef(new THREE.Quaternion())
    const driftSteering = useRef(0)
    const driftSteeringLerped = useRef(0)
    const driftingLeft = useRef(false)
    const driftingRight = useRef(false)
    const angle = useRef(0)
    const steeringSpeed = useRef(1)
    const speed = useRef(0)
    const grounded = useRef(false)
    const holdingJump = useRef(false)

    const [, getKeyboardControls] = useKeyboardControls()

    useBeforePhysicsStep(() => {
        const controls = getKeyboardControls() as KeyControls
        const { accelerate, decelerate, left, right, hop } = controls

        // steering and drifting
        steering.current = (Number(left) - Number(right)) * steeringSpeed.current
        steeringAngle.current += steering.current * 0.02

        if (holdingJump.current && !hop) {
            holdingJump.current = false
            driftingLeft.current = false
            driftingRight.current = false
        }

        if (holdingJump.current && grounded.current && speed.current >= 0.1) {
            if (left) {
                driftingLeft.current = true
            }
            if (right) {
                driftingRight.current = true
            }

            if ((driftingLeft.current && driftingRight.current) || (!left && !right)) {
                driftingLeft.current = false
                driftingRight.current = false
            }
        }

        if (driftingLeft.current) {
            driftSteering.current = THREE.MathUtils.lerp(driftSteering.current, 1, 0.5)
        } else if (driftingRight.current) {
            driftSteering.current = THREE.MathUtils.lerp(driftSteering.current, -1, 0.5)
        } else {
            driftSteering.current = 0
        }

        driftSteeringLerped.current = THREE.MathUtils.lerp(driftSteeringLerped.current, driftSteering.current, 0.3)

        angle.current = steeringAngle.current + driftSteering.current * 0.05

        steeringAngleQuat.current.setFromAxisAngle(up, steeringAngle.current)

        // acceleration and deceleration
        if (accelerate) {
            speed.current = THREE.MathUtils.lerp(speed.current, maxForwardSpeed, 0.03)
        } else if (decelerate) {
            speed.current = THREE.MathUtils.lerp(speed.current, -maxForwardSpeed, 0.03)
        } else {
            speed.current = THREE.MathUtils.lerp(speed.current, 0, 0.03)
        }

        speed.current = THREE.MathUtils.clamp(speed.current, maxReverseSpeed, maxForwardSpeed)

        const impulse = _impulse.set(0, 0, -speed.current).multiplyScalar(5)

        impulse.applyQuaternion(steeringAngleQuat.current)

        // jump
        if (grounded.current && hop && !holdingJump.current) {
            impulse.y = 12
            holdingJump.current = true
        }

        // apply impulse
        if (impulse.length() > 0) {
            bodyRef.current.applyImpulse(impulse, true)
        }

        // damping
        bodyRef.current.applyImpulse(
            {
                x: -bodyRef.current.linvel().x * 1.5,
                y: 0,
                z: -bodyRef.current.linvel().z * 1.5,
            },
            true,
        )
    })

    useFrame((state, delta) => {
        const bodyPosition = _bodyPosition.copy(bodyRef.current.translation())

        // car visuals
        groupRef.current.position.copy(bodyPosition)
        groupRef.current.quaternion.copy(steeringAngleQuat.current)
        groupRef.current.updateMatrix()
        const bodyEuler = _bodyEuler.setFromQuaternion(groupRef.current.quaternion, 'YXZ')
        bodyEuler.y = bodyEuler.y + driftSteeringLerped.current * 0.4
        groupRef.current.rotation.copy(bodyEuler)

        wheelRotation.current -= (speed.current / 50) * delta * 100
        wheelsRef.current.forEach((wheel) => {
            if (!wheel) return

            wheel.rotation.order = 'YXZ'
            wheel.rotation.x = wheelRotation.current
        })

        const frontWheelsSteeringAngle = steering.current * 0.5
        wheelsRef.current[1]!.rotation.y = frontWheelsSteeringAngle
        wheelsRef.current[0]!.rotation.y = frontWheelsSteeringAngle

        // camera
        if (!state.controls) {
            const cameraPosition = _cameraPosition.set(0, 3, 10).applyQuaternion(steeringAngleQuat.current).add(bodyPosition)
            state.camera.position.copy(cameraPosition)
            state.camera.lookAt(bodyPosition)
        }
    })

    return (
        <>
            {/* body */}
            <RigidBody {...props} ref={bodyRef} colliders={false} mass={3} ccd name="player" type="dynamic">
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

            {/* vehicle */}
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

const Cone = (props: RigidBodyProps) => {
    return (
        <RigidBody {...props} type="dynamic" colliders="hull">
            <mesh>
                <coneGeometry args={[0.5, 1, 16]} />
                <meshStandardMaterial color="orange" />
            </mesh>
        </RigidBody>
    )
}

const racetrackCones: THREE.Vector3[] = []

const boxLength = 20
const trackWidth = 20
const numConesInner = 30
const numConesOuter = 50
const innerTrackRadius = boxLength / 2 - trackWidth
const outerTrackRadius = boxLength / 2 + trackWidth

for (let i = 0; i < numConesInner; i++) {
    const angle = (i / numConesInner) * Math.PI * 2
    racetrackCones.push(new THREE.Vector3(Math.cos(angle) * innerTrackRadius, 1, Math.sin(angle) * innerTrackRadius))
}

for (let i = 0; i < numConesOuter; i++) {
    const angle = (i / numConesOuter) * Math.PI * 2
    racetrackCones.push(new THREE.Vector3(Math.cos(angle) * outerTrackRadius, 1, Math.sin(angle) * outerTrackRadius))
}

export default function Sketch() {
    const { orbitControls, physicsDebug } = useControls(SKETCH, {
        orbitControls: false,
        physicsDebug: false,
    })

    return (
        <Canvas>
            <Physics debug={physicsDebug}>
                <KeyboardControls map={controls}>
                    <ArcadeVehicle position={[15, 2, 0]} />
                </KeyboardControls>

                <RigidBody type="fixed" position={[0, -1, 0]}>
                    <mesh>
                        <boxGeometry args={[100, 1, 100]} />
                        <meshStandardMaterial color="#999" />
                    </mesh>
                </RigidBody>

                {racetrackCones.map((point, index) => (
                    <Cone key={index} position={point} />
                ))}

                <gridHelper args={[100, 100]} position-y={-0.49} />

                <ambientLight intensity={3} />
                <pointLight intensity={15} decay={1.5} position={[5, 5, 5]} />

                {orbitControls && <OrbitControls makeDefault />}
                <PerspectiveCamera makeDefault position={[0, 5, 10]} fov={60} />
            </Physics>
        </Canvas>
    )
}
