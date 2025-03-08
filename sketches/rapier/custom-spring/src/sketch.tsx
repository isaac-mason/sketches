import { usePageVisible } from '@/common'
import { OrbitControls, Text } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Physics, RapierRigidBody, RigidBody, useAfterPhysicsStep, useBeforePhysicsStep } from '@react-three/rapier'
import { useControls } from 'leva'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { create } from 'zustand'
import { Spring } from './spring'

const usePointer = create<{ pointerDown: boolean; setPointerDown: (pointerDown: boolean) => void }>((set) => ({
    pointerDown: false,
    setPointerDown: (pointerDown) => set({ pointerDown }),
}))

const SpringDemo = () => {
    const { pointerDown } = usePointer()

    const { springRestLength, springStiffness, springDamping } = useControls({
        postPosition: {
            value: [0, 2],
            onChange: (value) => {
                postRigidBody.current?.setTranslation(
                    {
                        x: value[0],
                        y: value[1],
                        z: 0,
                    },
                    true,
                )
            },
        },
        springRestLength: 1,
        springStiffness: 50,
        springDamping: 10,
    })

    const postRigidBody = useRef<RapierRigidBody>(null!)
    const cubeRigidBody = useRef<RapierRigidBody>(null!)
    const spring = useRef<Spring | null>(null)

    useEffect(() => {
        spring.current = new Spring(cubeRigidBody.current, postRigidBody.current, {
            localAnchorA: new Vector3(0, 1.2, 0),
        })
    }, [springRestLength, springStiffness, springDamping])

    useEffect(() => {
        if (!spring.current) return

        spring.current.stiffness = pointerDown ? springStiffness * 5 : springStiffness
        spring.current.restLength = pointerDown ? 0 : springRestLength
        spring.current.damping = springDamping
    }, [pointerDown, springRestLength, springStiffness, springDamping])

    useBeforePhysicsStep(() => {
        if (!spring.current) return
        spring.current.preStep()
    })

    useAfterPhysicsStep(() => {
        if (!spring.current) return
        spring.current.postStep()
    })

    return (
        <>
            {/* post rigid body */}
            <RigidBody ref={postRigidBody} type="fixed" colliders={false}>
                <mesh>
                    <sphereGeometry args={[0.1]} />
                    <meshStandardMaterial color="#999" />
                </mesh>
            </RigidBody>

            {/* ball rigid body */}
            <RigidBody position={[0, 0, 0]} colliders="ball" type="dynamic" ref={cubeRigidBody} mass={5} rotation={[0, 0, 0]}>
                <mesh
                    castShadow
                    receiveShadow
                    onClick={() => {
                        // apply impulse on click
                        cubeRigidBody.current.applyImpulse(
                            {
                                x: Math.random() < 0.5 ? 10 : -10,
                                y: -200,
                                z: 0,
                            },
                            true,
                        )
                    }}
                >
                    <sphereGeometry args={[1.2, 32, 32]} />
                    <meshStandardMaterial color="orange" wireframe />
                </mesh>
            </RigidBody>

            <Text position-y={2.5} fontSize={0.3}>
                Click to tighten spring
            </Text>
        </>
    )
}

export function Sketch() {
    const { setPointerDown } = usePointer()

    const visible = usePageVisible()

    const { debug } = useControls('physics', {
        debug: false,
    })

    return (
        <>
            <Canvas
                camera={{ fov: 60, position: [0, 0, 10] }}
                shadows
                onPointerDown={() => setPointerDown(true)}
                onPointerUp={() => setPointerDown(false)}
            >
                <Physics paused={!visible} debug={debug}>
                    <SpringDemo />

                    <ambientLight intensity={1.5} />

                    <OrbitControls />
                </Physics>
            </Canvas>
        </>
    )
}
