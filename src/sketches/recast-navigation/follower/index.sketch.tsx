import { Canvas, Crosshair, Instructions, useLoadingAssets } from '@/common'
import cityEnvironment from '@pmndrs/assets/hdri/city.exr'
import { Environment, MeshReflectorMaterial, PerspectiveCamera } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Physics, RigidBody, RigidBodyProps } from '@react-three/rapier'
import { useControls } from 'leva'
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { Agent } from './agent/agent'
import { SKETCH } from './const'
import { NavMeshDebug, NavMeshGenerator, Traversable, getTraversableMeshes } from './navmesh/navmesh'
import { Player, PlayerControls } from './player'

const Scene = () => {
    return (
        <>
            <RigidBody type="fixed" position={[0, -1, 0]}>
                <Traversable>
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
                </Traversable>
            </RigidBody>
        </>
    )
}

const Box = (props: RigidBodyProps) => {
    return (
        <RigidBody {...props}>
            <Traversable>
                <mesh>
                    <boxGeometry args={[1, 1, 1]} />
                    <meshStandardMaterial color="hotpink" />
                </mesh>
            </Traversable>
        </RigidBody>
    )
}

const BoxTool = () => {
    const camera = useThree((s) => s.camera)
    const scene = useThree((s) => s.scene)

    const [boxes, setBoxes] = useState<THREE.Vector3[]>([])

    const onPointerDown = () => {
        const pointerLocked = document.pointerLockElement !== null
        if (!pointerLocked) return

        const raycaster = new THREE.Raycaster(camera.position, camera.getWorldDirection(new THREE.Vector3()).normalize())

        const traversableMeshes = getTraversableMeshes(scene)
        const intersects = raycaster.intersectObjects(traversableMeshes, true)

        if (intersects.length > 0) {
            const intersect = intersects[0]
            const position = intersect.point
            position.y += 1

            setBoxes((prev) => [...prev, position])
        }
    }

    useEffect(() => {
        window.addEventListener('pointerdown', onPointerDown)
        return () => window.removeEventListener('pointerdown', onPointerDown)
    }, [scene, camera])

    return (
        <>
            {boxes.map((position, index) => (
                <Box key={index} position={position} />
            ))}
        </>
    )
}

export default function Sketch() {
    const loading = useLoadingAssets()

    const { physicsDebug, navMeshDebug } = useControls(`${SKETCH}-physics`, {
        physicsDebug: false,
        navMeshDebug: false,
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
                </Physics>

                <NavMeshGenerator />
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
