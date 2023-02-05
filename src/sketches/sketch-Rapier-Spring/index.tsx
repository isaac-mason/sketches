import { OrbitControls } from '@react-three/drei'
import {
    Debug,
    Physics,
    RigidBody,
    RigidBodyApi,
    useBeforePhysicsStep,
} from '@react-three/rapier'
import { useControls } from 'leva'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { usePageVisible } from '../../hooks/use-page-visible'
import { Canvas } from '../Canvas'
import { Spring } from './Spring'

const LEVA_KEY = 'rapier-spring'

const SpringDemo = () => {
    const { debug, springRestLength, springStiffness, springDamping } =
        useControls(LEVA_KEY, {
            debug: false,
            postPosition: {
                value: [0, 2],
                onChange: (value) => {
                    postRigidBody.current.setTranslation({
                        x: value[0],
                        y: value[1],
                        z: 0,
                    })
                },
            },
            springRestLength: 2,
            springStiffness: 1,
            springDamping: 1,
        })

    const postRigidBody = useRef<RigidBodyApi>(null!)
    const cubeRigidBody = useRef<RigidBodyApi>(null!)
    const spring = useRef<Spring | null>(null)

    useEffect(() => {
        spring.current = new Spring(
            cubeRigidBody.current.raw(),
            postRigidBody.current.raw(),
            {
                restLength: springRestLength,
                stiffness: springStiffness,
                damping: springDamping,
                localAnchorA: new Vector3(-1.2, 1.2, 0),
            }
        )
    }, [springRestLength, springStiffness, springDamping])

    useBeforePhysicsStep(() => {
        if (!spring.current) return
        spring.current.applyForce()
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

            {/* cube rigid body */}
            <RigidBody
                position={[0, 0, 0]}
                colliders="cuboid"
                type="dynamic"
                ref={cubeRigidBody}
                mass={5}
                rotation={[0, 0, -Math.PI / 4]}
            >
                <mesh
                    castShadow
                    receiveShadow
                    onClick={() => {
                        // apply impulse on click
                        cubeRigidBody.current.applyImpulse(
                            {
                                x: -5,
                                y: -10,
                                z: -20,
                            },
                            true
                        )
                    }}
                >
                    <boxGeometry args={[1.2, 1.2, 1.2]} />
                    <meshStandardMaterial color="orange" />
                </mesh>
            </RigidBody>

            {debug && <Debug />}
        </>
    )
}

const Scene = () => (
    <>
        <SpringDemo />

        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={0.5} />

        <OrbitControls />
    </>
)

export default () => {
    const visible = usePageVisible()

    return (
        <>
            <h1>Rapier - Spring</h1>

            <Canvas camera={{ fov: 60, position: [0, 0, 10] }} shadows>
                <Physics paused={!visible}>
                    <Scene />
                </Physics>
            </Canvas>
        </>
    )
}
