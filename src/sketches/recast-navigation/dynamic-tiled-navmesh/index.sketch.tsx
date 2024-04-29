import { Canvas, Crosshair, Instructions, useInterval, useLoadingAssets } from '@/common'
import cityEnvironment from '@pmndrs/assets/hdri/city.exr'
import { Environment } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Physics, RigidBody } from '@react-three/rapier'
import { useControls } from 'leva'
import { NavMeshQuery, init } from 'recast-navigation'
import * as THREE from 'three'
import { Vector3Tuple } from 'three'
import { BoxTool } from './box-tool'
import { SKETCH } from './const'
import { Duck } from './duck'
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
    const radius = 0.5
    const height = 0.5

    const agentProps = {
        initialPosition: props.position,
        radius,
        height,
        maxAcceleration: 5.5,
        maxSpeed: 5.5,
    }

    return (
        <Entity followPlayer>
            <Component name="crowdAgent">
                <Agent {...agentProps} />
            </Component>
            <Component name="three">
                <group>
                    <Duck position-y={0.5} scale={0.5} />

                    {/* <mesh position-y={1}>
                        <capsuleGeometry args={[radius, height, 12]} />
                        <meshStandardMaterial color="red" />
                    </mesh> */}
                </group>
            </Component>
        </Entity>
    )
}

const Followers = () => {
    const n = 20

    const followers = []

    for (let i = 0; i < n; i++) {
        followers.push(<Follower key={i} position={[3, 17, -0.55]} />)
    }

    const { navMeshQuery } = useNav()

    useFrame((_, delta) => {
        updateCrowdAgents(delta, navMeshQuery)
    })

    useInterval(() => {
        updateFollowers(navMeshQuery)
    }, 1000)

    return <>{followers}</>
}

const _crowdAgentDirection = new THREE.Vector3()
const _crowdAgentQuaternion = new THREE.Quaternion()

const updateCrowdAgents = (delta: number, navMeshQuery: NavMeshQuery | undefined) => {
    if (!navMeshQuery) return

    for (const entity of crowdAgentQuery) {
        if (!entity.three) continue

        const agent = entity.crowdAgent

        if (agent.state() === 0) {
            const { isOverPoly } = navMeshQuery.findNearestPoly(agent.position())

            if (isOverPoly) {
                const { point: closest } = navMeshQuery.findClosestPoint(agent.position())
                agent.teleport(closest)
            }
        }

        if (entity.three.position.length() === 0) {
            entity.three.position.copy(agent.position())
        } else {
            entity.three.position.lerp(agent.position(), delta * 40)
        }

        const velocity = agent.velocity()
        const direction = _crowdAgentDirection.set(velocity.x, velocity.y, velocity.z)
        const yRotation = Math.atan2(direction.x, direction.z)
        const quaternion = _crowdAgentQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yRotation)
        entity.three.quaternion.slerp(quaternion, delta * 30)
    }
}

const updateFollowers = (navMeshQuery: NavMeshQuery | undefined) => {
    if (!navMeshQuery) return

    const player = playerQuery.first
    if (!player) return

    const playerPosition = player.rigidBody.translation()

    for (const follower of followersQuery) {
        const { point: target } = navMeshQuery.findClosestPoint(playerPosition, { halfExtents: { x: 10, y: 10, z: 10 } })
        const { randomPoint: pointAround } = navMeshQuery.findRandomPointAroundCircle(target, 1)

        follower.crowdAgent.requestMoveTarget(pointAround)
    }
}

export default function Sketch() {
    const { physicsDebug } = useControls(`${SKETCH}-physics`, {
        physicsDebug: false,
    })

    const loading = useLoadingAssets()

    return (
        <>
            <Canvas>
                <Physics paused={loading} debug={physicsDebug}>
                    <Navigation />

                    <Scene />

                    <PlayerControls>
                        <Player position={[0, 30, 0]} />
                    </PlayerControls>

                    <BoxTool />
                </Physics>

                <Followers />

                <Environment files={cityEnvironment} />
            </Canvas>

            <Crosshair />

            <Instructions>
                * wasd and mouse to move
                <br />
                click to place boxes
            </Instructions>
        </>
    )
}
