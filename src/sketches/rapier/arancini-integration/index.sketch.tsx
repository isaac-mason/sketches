import { OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Physics, RapierRigidBody, RigidBody, quat, vec3 } from '@react-three/rapier'
import { World } from 'arancini'
import { createReactAPI } from 'arancini/react'
import { useRef } from 'react'
import { Canvas, usePageVisible } from '../../../common'

type EntityType = {
    rigidBody: RapierRigidBody
}

const world = new World<EntityType>({
    components: ['rigidBody'],
})

const rigidBodyQuery = world.query((e) => e.has('rigidBody'))

const { Entity, Component } = createReactAPI(world)

const RESET_INTERVAL = 3

const Scene = () => {
    const resetCountDown = useRef(1)

    useFrame((_, delta) => {
        resetCountDown.current -= delta

        if (resetCountDown.current <= 0) {
            resetCountDown.current = RESET_INTERVAL

            let i = 0

            for (const entity of rigidBodyQuery) {
                i++

                entity.rigidBody.setTranslation(vec3({ x: 0, y: 4 + i * 2, z: 0 }), true)
                entity.rigidBody.setLinvel(vec3({ x: 0, y: 0, z: 0 }), true)
                entity.rigidBody.setAngvel(vec3({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 }), true)
                entity.rigidBody.setRotation(quat({ x: 0, y: 4, z: 0, w: 1 }), true)
            }
        }
    })
    
    return (
        <>
            {Array.from({ length: 10 }).map((_, i) => (
                <Entity key={i}>
                    <Component name="rigidBody">
                        <RigidBody
                            /* initial position out of sight */
                            position={[0, -100, 0]}
                            colliders="ball"
                            type="dynamic"
                            mass={0.5}
                            rotation={[0, 0, 0]}
                        >
                            <mesh>
                                <sphereGeometry args={[0.2]} />
                                <meshStandardMaterial color="orange" />
                            </mesh>
                        </RigidBody>
                    </Component>
                </Entity>
            ))}

            <RigidBody position={[0, -1, 0]} colliders="cuboid" type="fixed" mass={0.5} rotation={[0, 0, 0]}>
                <mesh>
                    <boxGeometry args={[10, 1, 10]} />
                    <meshStandardMaterial color="#333" />
                </mesh>
            </RigidBody>

            <ambientLight intensity={1.5} />
            <pointLight position={[10, 10, 10]} decay={1.5} intensity={150} />

            <OrbitControls makeDefault />
        </>
    )}

export default () => {
    const visible = usePageVisible()

    return (
        <>
            <Canvas camera={{ position: [5, 5, 5] }}>
                <Physics paused={!visible} debug>
                    <Scene />
                </Physics>
            </Canvas>
        </>
    )
}
