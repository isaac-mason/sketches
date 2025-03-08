import { Canvas } from '@react-three/fiber'
import { Crosshair } from '@/common/components/crosshair'
import { Instructions } from '@/common/components/instructions'
import { useLoadingAssets } from '@/common/hooks/use-loading-assets'
import cityEnvironment from '@pmndrs/assets/hdri/city.exr'
import { Environment, MeshReflectorMaterial, PerspectiveCamera } from '@react-three/drei'
import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier'
import { useControls } from 'leva'
import { Agent } from './agent/agent'
import { BoxTool } from './box-tool'
import { Component, Entity } from './ecs'
import { NavMeshDebug, NavMeshGenerator } from './navmesh/navmesh'
import { Player, PlayerControls } from './player'
import { init as initRecast } from 'recast-navigation'
import { suspend } from 'suspend-react'

const Scene = () => {
    return (
        <>
            <Entity traversable>
                <RigidBody type="fixed" position={[0, -1, 0]} colliders={false}>
                    <CuboidCollider args={[25, 1, 25]} position={[0, -1, 0]} />

                    <Component name="three">
                        <mesh rotation={[-Math.PI / 2, 0, 0]}>
                            <planeGeometry args={[50, 50]} />
                            <MeshReflectorMaterial
                                mirror={0}
                                blur={[300, 30]}
                                resolution={1024}
                                mixBlur={1}
                                mixStrength={80}
                                roughness={0.8}
                                depthScale={0.5}
                                minDepthThreshold={0.4}
                                maxDepthThreshold={1.4}
                                color="#111"
                                metalness={0.2}
                            />
                        </mesh>
                    </Component>
                </RigidBody>
            </Entity>
        </>
    )
}

export function Sketch() {
    suspend(async () => {
        await initRecast()
    }, [])

    const loading = useLoadingAssets()

    const { physicsDebug, navMeshDebug } = useControls('physics', {
        physicsDebug: false,
        navMeshDebug: true,
    })

    return (
        <>
            <Canvas>
                <Physics debug={physicsDebug} paused={loading}>
                    <PlayerControls>
                        <Player position={[0, 10, 10]} />
                    </PlayerControls>

                    <Agent position={[0, 10, -10]} />

                    <Scene />

                    <BoxTool />

                    <NavMeshGenerator />
                </Physics>

                {navMeshDebug && <NavMeshDebug />}

                <Environment files={cityEnvironment} />

                <PerspectiveCamera makeDefault position={[0, 10, 10]} rotation={[0, 0, 0]} />
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
