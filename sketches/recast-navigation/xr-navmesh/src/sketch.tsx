import { Canvas } from '@/common'
import { OrbitControls, PerspectiveCamera, useGLTF } from '@react-three/drei'
import { createXRStore, PointerEvents, XR, XROrigin } from '@react-three/xr'
import { Suspense, useState } from 'react'
import * as THREE from 'three'
import { NavMeshProvider, NavMeshTeleportTarget, Walkable } from './navmesh'
import levelGlbUrl from './sands_location.glb?url'
import { TiledNavMeshGeneratorConfig } from 'recast-navigation/generators'

const Level = () => {
    const { scene } = useGLTF(levelGlbUrl)

    return <primitive object={scene} />
}

const store = createXRStore({
    hand: { teleportPointer: true },
    controller: { teleportPointer: true },
    secondaryInputSources: true,
})

const SPAWN_POSITION: THREE.Vector3Tuple = [-0.5920812728872339, 9.83978923780684, -1.5619062958282723]
const CAMERA_POSITION: THREE.Vector3Tuple = [SPAWN_POSITION[0] + 20, SPAWN_POSITION[1] + 20, SPAWN_POSITION[2] + 20]

const CELL_SIZE_WORLD = 0.2
const CELL_HEIGHT_WORLD = 0.2

const NAVMESH_GENERATOR_CONFIG: Partial<TiledNavMeshGeneratorConfig> = {
    cs: CELL_SIZE_WORLD,
    ch: CELL_HEIGHT_WORLD,
    walkableRadius: Math.ceil(0.2 / CELL_SIZE_WORLD),
    walkableClimb: Math.ceil(0.8 / CELL_HEIGHT_WORLD),
    walkableSlopeAngle: 60,
    tileSize: 16,
}

export function Sketch() {
    const [position, setPosition] = useState<THREE.Vector3>(() => new THREE.Vector3().fromArray(SPAWN_POSITION))

    return (
        <>
            <Canvas>
                <OrbitControls target={SPAWN_POSITION} />
                <PerspectiveCamera position={CAMERA_POSITION} makeDefault />

                <PointerEvents batchEvents={false} />

                <XR store={store}>
                    <ambientLight intensity={2} />
                    <directionalLight intensity={2} position={[5, 5, 0]} />
                    <XROrigin position={position} />

                    <Suspense>
                        <NavMeshProvider config={NAVMESH_GENERATOR_CONFIG} floodFillPoint={SPAWN_POSITION}>
                            <Walkable>
                                <Level />
                            </Walkable>

                            <NavMeshTeleportTarget onTeleport={setPosition} visible />
                        </NavMeshProvider>
                    </Suspense>
                </XR>
            </Canvas>

            <button
                onClick={() => store.enterVR()}
                style={{
                    position: 'absolute',
                    top: '1em',
                    left: '1em',
                    zIndex: 1,
                    padding: '1em',
                    color: 'black',
                    background: 'white',
                    borderRadius: '0.5em',
                    border: 'none',
                    fontSize: '1em',
                }}
            >
                Enter VR
            </button>
        </>
    )
}
