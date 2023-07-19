import { Physics, RapierRigidBody, RigidBody, useBeforePhysicsStep } from '@react-three/rapier'
import { useControls } from 'leva'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { Canvas, usePageVisible } from '../../../common'
import { Spring } from './spring'

const LEVA_KEY = 'rapier-spring'

const SpringDemo = () => {
    const { springRestLength, springStiffness, springDamping } = useControls(LEVA_KEY, {
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
        springStiffness: 2,
        springDamping: 1,
    })

    const postRigidBody = useRef<RapierRigidBody>(null!)
    const cubeRigidBody = useRef<RapierRigidBody>(null!)
    const spring = useRef<Spring | null>(null)

    useEffect(() => {
        spring.current = new Spring(cubeRigidBody.current, postRigidBody.current, {
            restLength: springRestLength,
            stiffness: springStiffness,
            damping: springDamping,
            localAnchorA: new Vector3(0, 1.2, 0),
        })
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
        </>
    )
}

const Scene = () => (
    <>
        <SpringDemo />

        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={0.5} />
    </>
)

export default () => {
    const visible = usePageVisible()

    const { debug } = useControls(`${LEVA_KEY}-physics`, {
        debug: false,
    })

    return (
        <>
            <Canvas camera={{ fov: 60, position: [0, 0, 10] }} shadows>
                <Physics paused={!visible} debug={debug}>
                    <Scene />
                </Physics>
            </Canvas>
        </>
    )
}
