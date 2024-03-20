import { Canvas, Crosshair, useInterval, useLoadingAssets } from '@/common'
import cityEnvironment from '@pmndrs/assets/hdri/city.exr'
import { Environment } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Physics, RigidBody } from '@react-three/rapier'
import { useControls } from 'leva'
import { init } from 'recast-navigation'
import * as THREE from 'three'
import { Vector3Tuple } from 'three'
import { BoxTool } from './box-tool'
import { SKETCH } from './const'
import { Component, Entity, crowdAgentQuery, followersQuery, playerQuery } from './ecs'
import { Level } from './level/level'
import { Agent } from './navigation/crowd-agent'
import { Navigation, useNav } from './navigation/navigation'
import { Player, PlayerControls } from './player'

await init()

const Scene = () => {
    return (
        <>
            <Entity traversable>
                <RigidBody type="fixed" colliders="trimesh">
                    <Component name="three">
                        <group>
                            <Level />
                        </group>
                    </Component>
                </RigidBody>
            </Entity>
        </>
    )
}

type FollowerProps = {
    position: Vector3Tuple
}

const Follower = (props: FollowerProps) => {
    return (
        <Entity followPlayer>
            <Component name="crowdAgent">
                <Agent initialPosition={props.position} />
            </Component>
            <Component name="three">
                <group>
                    <mesh position-y={1}>
                        <capsuleGeometry args={[0.5, 1, 2]} />
                        <meshStandardMaterial color="red" />
                    </mesh>
                </group>
            </Component>
        </Entity>
    )
}

const Followers = () => {
    const n = 5

    const followers = []

    for (let i = 0; i < n; i++) {
        followers.push(<Follower key={i} position={[3, 17, -0.55]} />)
    }

    return <>{followers}</>
}

const CrowdAgentSystem = () => {
    const { navMeshQuery } = useNav()
    useFrame(() => {
        if (!navMeshQuery) return

        for (const entity of crowdAgentQuery) {
            if (!entity.three) continue

            const agent = entity.crowdAgent

            if (agent.state() === 0) {
                const { isOverPoly } = navMeshQuery.findNearestPoly(agent.position())

                if (isOverPoly) {
                    const closest = navMeshQuery.getClosestPoint(agent.position())
                    agent.teleport(closest)
                }
            }

            entity.three.position.copy(agent.position())

            const velocity = agent.velocity()
            const direction = new THREE.Vector3(velocity.x, velocity.y, velocity.z)
            const yaw = Math.atan2(direction.x, direction.z)

            entity.three.rotation.y = yaw
        }
    })

    useInterval(() => {
        if (!navMeshQuery) return

        const player = playerQuery.first
        if (!player) return

        const playerPosition = player.rigidBody.translation()

        const target = navMeshQuery.getClosestPoint(playerPosition, { halfExtents: { x: 10, y: 10, z: 10 } })

        for (const follower of followersQuery) {
            follower.crowdAgent.goto(target)
        }
    }, 100)

    return null
}

export default function Sketch() {
    const { physicsDebug } = useControls(`${SKETCH}-physics`, {
        physicsDebug: false,
    })

    const loading = useLoadingAssets()

    return (
        <>
            <Canvas>
                <Physics paused={loading} debug={physicsDebug} colliders={false}>
                    <Navigation />

                    <Scene />

                    <PlayerControls>
                        <Player position={[0, 30, 0]} />
                    </PlayerControls>

                    <BoxTool />
                </Physics>

                <Followers />

                <CrowdAgentSystem />

                <Environment files={cityEnvironment} />
            </Canvas>

            <Crosshair />
        </>
    )
}
