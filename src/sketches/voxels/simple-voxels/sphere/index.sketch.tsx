import { Bounds, OrbitControls } from '@react-three/drei'
import { useControls } from 'leva'
import { useLayoutEffect } from 'react'
import { Color } from 'three'
import { Canvas } from '../../../../common'
import { CorePlugin } from '../engine/core'
import { CulledMesherPlugin, VoxelChunkCulledMeshes, VoxelChunkMeshComponent } from '../engine/culled-mesher'
import { VoxelEngine, useVoxelEngine } from '../engine/voxel-engine'

const orange = new Color('orange').getHex()
const hotpink = new Color('hotpink').getHex()

const App = () => {
    const { world, setBlock } = useVoxelEngine<[CorePlugin, CulledMesherPlugin]>()

    useLayoutEffect(() => {
        // sphere
        for (let x = -10; x < 10; x++) {
            for (let y = -10; y < 10; y++) {
                for (let z = -10; z < 10; z++) {
                    if (x * x + y * y + z * z < 10 * 10) {
                        setBlock([x, y, z], {
                            solid: true,
                            color: Math.random() > 0.5 ? orange : hotpink,
                        })
                    }
                }
            }
        }
    }, [world])

    useControls(
        'voxels-culled-mesher-basic',
        {
            wireframe: {
                value: false,
                onChange: (value) => {
                    world.find([VoxelChunkMeshComponent]).forEach((entity) => {
                        entity.get(VoxelChunkMeshComponent).material.wireframe = value
                    })
                },
            },
        },
        [world],
    )

    return (
        <>
            <Bounds fit margin={1.5}>
                <VoxelChunkCulledMeshes />
            </Bounds>

            <ambientLight intensity={0.6} />
            <pointLight decay={1.5} intensity={200} position={[20, 20, 20]} />
            <pointLight decay={1.5} intensity={200} position={[-20, 20, -20]} />
        </>
    )
}

export default () => (
    <Canvas camera={{ position: [10, 10, 10] }}>
        <VoxelEngine plugins={[CorePlugin, CulledMesherPlugin]}>
            <App />
        </VoxelEngine>
        <OrbitControls makeDefault />
    </Canvas>
)
