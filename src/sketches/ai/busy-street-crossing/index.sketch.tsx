import cityEnvironment from '@pmndrs/assets/hdri/city.exr'
import { Environment, OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Component, World } from 'arancini'
import { createECS } from 'arancini/react'
import { useControls } from 'leva'
import { CrowdAgent, Vector3, vec3 } from 'recast-navigation'
import { Object3D } from 'three'
import { Canvas } from '../../../common'
import { AI, Agent, Traversable } from '../ai-react-api'

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

const AgentComponent = Component.object<CrowdAgent>('Crowd Agent')
const Object3DComponent = Component.object<Object3D>('Object3D')
const AgentTarget = Component.object<Vector3>('Agent Target')

const world = new World()
world.registerComponent(AgentComponent)
world.registerComponent(Object3DComponent)
world.registerComponent(AgentTarget)

world.init()

const ecs = createECS(world)

const App = () => {
    const { debugNavMesh } = useControls('ai-busy-crossing', {
        debugNavMesh: false,
    })

    const agents = ecs.useQuery([AgentComponent, Object3DComponent])

    /* update agent positions */
    useFrame(() => {
        for (const entity of agents) {
            const agent = entity.get(AgentComponent)
            const object = entity.get(Object3DComponent)

            const { x, y, z } = agent.position()
            const { x: vx, y: vy, z: vz } = agent.velocity()
            object.position.set(x, y, z)
            object.lookAt(x + vx, y + vy, z + vz)

            if (!entity.has(AgentTarget)) {
                const target = targets[Math.floor(Math.random() * targets.length)]

                agent.goto(target)
                entity.add(AgentTarget, { ...target })
            }

            const target = entity.get(AgentTarget)
            const tolerance = 5

            if (Math.abs(x - target.x) < tolerance && Math.abs(y - target.y) < tolerance && Math.abs(z - target.z) < tolerance) {
                agent.resetMoveTarget()
                entity.remove(AgentTarget)
            }
        }
    })

    return (
        <>
            <AI debug={debugNavMesh} generatorConfig={{ walkableRadius: 2 }}>
                {/* create some agents */}
                {Array.from({ length: 200 }).map((_, idx) => (
                    <ecs.Entity key={idx}>
                        <ecs.Component type={AgentComponent}>
                            <Agent
                                initialPosition={vec3.toArray(targets[Math.floor(Math.random() * targets.length)])}
                                maxSpeed={4}
                                maxAcceleration={3}
                                separationWeight={10}
                            />
                        </ecs.Component>
                    </ecs.Entity>
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
            </AI>

            {/* render agents */}
            <ecs.QueryEntities query={[AgentComponent]}>
                <ecs.Component type={Object3DComponent}>
                    <group>
                        <mesh position-y={0.5}>
                            <meshStandardMaterial color="orange" />
                            <cylinderGeometry args={[0.5, 0.5, 1]} />
                        </mesh>

                    </group>
                </ecs.Component>
            </ecs.QueryEntities>

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

export default () => (
    <>
        <Canvas camera={{ position: [5, 30, 10] }}>
            <App />
            <OrbitControls />
        </Canvas>
    </>
)
