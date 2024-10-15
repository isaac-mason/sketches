import { Canvas, Instructions } from '@/common'
import { animated, useSpring } from '@react-spring/three'
import { PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import {
    BallCollider,
    InstancedRigidBodies,
    Physics,
    RapierRigidBody,
    RigidBody,
    useBeforePhysicsStep,
} from '@react-three/rapier'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { InstancedMesh } from 'three'

const randomBetween = (a: number, b: number) => {
    const min = Math.min(a, b)
    const max = Math.max(a, b)
    return Math.random() * (max - min) + min
}

const _vector3 = new THREE.Vector3()
const _color = new THREE.Color()

const N = 300
const size = 1
const colors = ['orange', 'hotpink', '#fff']

const pointOfGravity = new THREE.Vector3(0, 0, 0)
let pointOfGravityIntensity = 0.1

const Cluster = () => {
    const api = useRef<RapierRigidBody[]>(null)
    const ref = useRef<InstancedMesh>(null)

    useBeforePhysicsStep(() => {
        api.current?.forEach((body) => {
            const impulse = _vector3.copy(pointOfGravity).sub(body.translation()).multiplyScalar(pointOfGravityIntensity)
            body.applyImpulse(impulse, true)
        })
    })

    useEffect(() => {
        if (ref.current) {
            for (let i = 0; i < N; i++) {
                ref.current!.setColorAt(i, _color.set(colors[i % colors.length]))
            }

            ref.current!.instanceColor!.needsUpdate = true
        }
    }, [])

    const instances = useMemo(() => {
        return Array.from({ length: N }, (_, i) => {
            const side = Math.random() > 0.5 ? 1 : -1

            return {
                key: i,
                position: [side * randomBetween(50, 100), randomBetween(-50, 50), randomBetween(10, -10)] as THREE.Vector3Tuple,
            }
        })
    }, [])

    return (
        <group>
            <InstancedRigidBodies
                ref={api}
                instances={instances}
                colliders="cuboid"
                linearDamping={4}
                angularDamping={10}
                friction={0.5}
            >
                <instancedMesh ref={ref} args={[undefined, undefined, N]} frustumCulled={false}>
                    <boxGeometry args={[size, size, size]} />
                    <meshPhysicalMaterial roughness={0.4} />
                </instancedMesh>
            </InstancedRigidBodies>
        </group>
    )
}

const Pointer = ({ vec = new THREE.Vector3() }) => {
    const rigidBody = useRef<RapierRigidBody>(null!)

    const [pointerDown, setPointerDown] = useState(false)

    const { intensity } = useSpring({
        intensity: pointerDown ? 10 : 3,
    })

    useFrame(({ pointer, viewport }) => {
        if (pointer.x === 0 && pointer.y === 0) return

        if (pointerDown) {
            pointOfGravity.set((pointer.x * viewport.width) / 2, (pointer.y * viewport.height) / 2, 0)
            pointOfGravityIntensity = 0.3
        } else {
            pointOfGravity.set(0, 0, 0)
            pointOfGravityIntensity = 0.2
        }

        rigidBody.current?.setNextKinematicTranslation(
            vec.set((pointer.x * viewport.width) / 2, (pointer.y * viewport.height) / 2, 0),
        )
    })

    useEffect(() => {
        const onPointerDown = () => {
            setPointerDown(true)
        }

        const onPointerUp = () => {
            setPointerDown(false)
        }

        window.addEventListener('pointerdown', onPointerDown)
        window.addEventListener('pointerup', onPointerUp)

        return () => {
            window.removeEventListener('pointerdown', onPointerDown)
            window.removeEventListener('pointerup', onPointerUp)
        }
    }, [])

    return (
        <RigidBody position={[1000, 1000, 1000]} type="kinematicPosition" colliders={false} mass={2} ref={rigidBody}>
            <BallCollider args={[4]} />

            <animated.pointLight decay={1} intensity={intensity} />
        </RigidBody>
    )
}

export function Sketch() {
    return (
        <>
            <Canvas>
                <Physics gravity={[0, 0, 0]}>
                    <Cluster />

                    <Pointer />

                    <ambientLight intensity={1.2} />
                    <directionalLight position={[5, 5, 5]} intensity={0.5} />

                    <PerspectiveCamera makeDefault position={[0, 0, 30]} />
                </Physics>
            </Canvas>

            <Instructions>
                * displace with pointer
                <br />
                click and drag to attract
            </Instructions>
        </>
    )
}
