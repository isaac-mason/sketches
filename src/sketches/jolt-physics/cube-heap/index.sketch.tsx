import cityEnvironment from '@pmndrs/assets/hdri/city.exr'
import { Environment, OrbitControls } from '@react-three/drei'
import { World } from 'arancini'
import { createReactAPI } from 'arancini/react'
import Jolt from 'jolt-physics'
import { useRef } from 'react'
import { Canvas, useInterval } from '../../../common'
import { Physics, RigidBody, usePhysics } from '../jolt-react-api'

const world = new World<{
    body: Jolt.Body
    teleport: true
}>()

const { Entity, Component } = createReactAPI(world)

const teleportingBodies = world.query((e) => e.has('body', 'teleport'))

const COLORS = ['orange', 'white', 'pink', 'skyblue']

const Scene = () => {
    const nextToTeleport = useRef(0)

    const { jolt, bodyInterface } = usePhysics()

    useInterval(() => {
        if (teleportingBodies.entities.length <= 0) return

        const index = nextToTeleport.current % teleportingBodies.entities.length

        const body = teleportingBodies.entities[index].body
        const bodyId = body.GetID()

        const x = (0.5 - Math.random()) * 10
        const y = 40
        const z = (0.5 - Math.random()) * 10

        bodyInterface.SetPosition(bodyId, new jolt.Vec3(x, y, z), jolt.EActivation_Activate)
        body.SetLinearVelocity(new jolt.Vec3(0, 0, 0))

        nextToTeleport.current++
    }, 30)

    return (
        <>
            {Array.from({ length: 500 }).map((_, idx) => (
                <Entity teleport>
                    <Component name="body">
                        <RigidBody key={idx} shape="box" position={[0, -100 - idx * 3, 0]}>
                            <mesh receiveShadow castShadow>
                                <meshStandardMaterial color={COLORS[idx % COLORS.length]} />
                                <boxGeometry args={[2, 2, 2]} />
                            </mesh>
                        </RigidBody>
                    </Component>
                </Entity>
            ))}

            {/* ground */}
            <RigidBody type="static" shape="box">
                <mesh receiveShadow castShadow>
                    <meshStandardMaterial color="#333" />
                    <boxGeometry args={[100, 1, 100]} />
                </mesh>
            </RigidBody>

            <spotLight position={[50, 50, 50]} angle={0.3} intensity={100} distance={1000} decay={1} penumbra={0.5} castShadow />

            <Environment files={cityEnvironment} />
        </>
    )
}

export default () => {
    return (
        <>
            <Canvas shadows camera={{ position: [-10, 30, 40] }}>
                <Physics gravity={[0, -9.81, 0]}>
                    <Scene />
                </Physics>

                <OrbitControls target={[0, 10, 0]} />
            </Canvas>
        </>
    )
}
