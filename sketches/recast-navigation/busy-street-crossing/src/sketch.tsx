import { Canvas } from '@/common/components/canvas'
import cityEnvironment from '@pmndrs/assets/hdri/city.exr'
import { Environment, OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { World } from 'arancini'
import { createReactAPI } from 'arancini/react'
import { useControls } from 'leva'
import { CrowdAgent, Vector3, init as initRecast, vec3 } from 'recast-navigation'
import { suspend } from 'suspend-react'
import { Object3D } from 'three'
import { Agent, Navigation, Traversable } from './recast-react-api'

const targets = [
    // top left
    { x: 15, y: 0, z: -45 },
    // top right
    { x: -15, y: 0, z: -45 },
    // bottom left
    { x: 15, y: 0, z: 45 },
    // bottom right
    { x: -15, y: 0, z: 45 },
    // left top
    { x: -45, y: 0, z: 15 },
    // left bottom
    { x: -45, y: 0, z: -15 },
    // right top
    { x: 45, y: 0, z: 15 },
    // right bottom
    { x: 45, y: 0, z: -15 },
]

type EntityType = {
    agent?: CrowdAgent
    object3D?: Object3D
    target?: Vector3
}

const world = new World<EntityType>()

const queries = {
    agents: world.query((e) => e.is('agent')),
    agentsWithObject3D: world.query((e) => e.is('agent', 'object3D')),
}

const { useQuery, Entity, Entities, Component } = createReactAPI(world)

const App = () => {
    const { debugNavMesh } = useControls('ai-busy-crossing', {
        debugNavMesh: false,
    })

    const agents = useQuery(queries.agentsWithObject3D)

    /* update agent positions */
    useFrame(() => {
        for (const entity of agents) {
            const { agent, object3D } = entity
            const { x, y, z } = agent.position()
            const { x: vx, y: vy, z: vz } = agent.velocity()
            object3D.position.set(x, y, z)
            object3D.lookAt(x + vx, y + vy, z + vz)

            if (!entity.target) {
                const target = targets[Math.floor(Math.random() * targets.length)]

                agent.requestMoveTarget(target)
                entity.target = { ...target }
            }

            const { target } = entity

            const tolerance = 5

            if (Math.abs(x - target.x) < tolerance && Math.abs(y - target.y) < tolerance && Math.abs(z - target.z) < tolerance) {
                agent.resetMoveTarget()
                world.remove(entity, 'target')
            }
        }
    })

    return (
        <>
            <Navigation debug={debugNavMesh} generatorConfig={{ walkableRadius: 2 }}>
                {/* create some agents */}
                {Array.from({ length: 200 }).map((_, idx) => (
                    <Entity key={idx}>
                        <Component name="agent">
                            <Agent
                                initialPosition={vec3.toArray(targets[Math.floor(Math.random() * targets.length)])}
                                maxSpeed={4}
                                maxAcceleration={3}
                                separationWeight={10}
                            />
                        </Component>
                    </Entity>
                ))}

                {/* create a walkable surface */}
                <Traversable>
                    <mesh position-y={-0.2}>
                        <meshStandardMaterial color="#333" />
                        <boxGeometry args={[100, 0.2, 100]} />
                    </mesh>
                </Traversable>

                {/* buildings on street corners */}
                <Traversable>
                    <mesh position={[35, 20, 35]}>
                        <meshStandardMaterial color="#333" />
                        <boxGeometry args={[30, 40, 30]} />
                    </mesh>

                    <mesh position={[-35, 20, 35]}>
                        <meshStandardMaterial color="#333" />
                        <boxGeometry args={[30, 40, 30]} />
                    </mesh>

                    <mesh position={[35, 20, -35]}>
                        <meshStandardMaterial color="#333" />
                        <boxGeometry args={[30, 40, 30]} />
                    </mesh>

                    <mesh position={[-35, 20, -35]}>
                        <meshStandardMaterial color="#333" />
                        <boxGeometry args={[30, 40, 30]} />
                    </mesh>
                </Traversable>
            </Navigation>

            {/* render agents */}
            <Entities in={queries.agents}>
                <Component name="object3D">
                    <group>
                        <mesh position-y={0.5}>
                            <meshStandardMaterial color="orange" />
                            <cylinderGeometry args={[0.5, 0.5, 1]} />
                        </mesh>
                    </group>
                </Component>
            </Entities>

            {/* road */}
            <mesh position-y={0.001}>
                <meshBasicMaterial color="#333" />
                <boxGeometry args={[100, 0.001, 20]} />
            </mesh>
            <mesh position-y={0.001}>
                <meshBasicMaterial color="#333" />
                <boxGeometry args={[20, 0.001, 100]} />
            </mesh>

            {/* zebra crossings */}
            {Array.from({ length: 10 }).map((_, idx) => (
                <mesh
                    key={idx}
                    position={[-9 + idx * 2, 0.05, -15]}
                    rotation-x={-Math.PI / 2}
                    rotation-y={Math.PI / 2}
                    rotation-order="YXZ"
                >
                    <meshBasicMaterial color="#fff" />
                    <planeGeometry args={[10, 1]} />
                </mesh>
            ))}
            {Array.from({ length: 10 }).map((_, idx) => (
                <mesh
                    key={idx}
                    position={[-9 + idx * 2, 0.05, 15]}
                    rotation-x={-Math.PI / 2}
                    rotation-y={Math.PI / 2}
                    rotation-order="YXZ"
                >
                    <meshBasicMaterial color="#fff" />
                    <planeGeometry args={[10, 1]} />
                </mesh>
            ))}
            {Array.from({ length: 10 }).map((_, idx) => (
                <mesh key={idx} position={[15, 0.05, -9 + idx * 2]} rotation-x={-Math.PI / 2}>
                    <meshBasicMaterial color="#fff" />
                    <planeGeometry args={[10, 1]} />
                </mesh>
            ))}
            {Array.from({ length: 10 }).map((_, idx) => (
                <mesh key={idx} position={[-15, 0.05, -9 + idx * 2]} rotation-x={-Math.PI / 2}>
                    <meshBasicMaterial color="#fff" />
                    <planeGeometry args={[10, 1]} />
                </mesh>
            ))}

            <Environment files={cityEnvironment} />
        </>
    )
}

export function Sketch() {
    suspend(async () => {
        await initRecast()
    }, [])

    return (
        <Canvas camera={{ position: [5, 30, 10] }}>
            <App />
            <OrbitControls />
        </Canvas>
    )
}
