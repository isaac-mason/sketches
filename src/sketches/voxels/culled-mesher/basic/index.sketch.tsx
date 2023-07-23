import { Bounds, OrbitControls } from '@react-three/drei'
import { useControls } from 'leva'
import { useEffect } from 'react'
import { Color } from 'three'
import { Canvas } from '../../../../common'
import { CorePlugin } from '../../engine/core'
import { CulledMesherPlugin, VoxelChunkMeshComponent } from '../../engine/culled-mesher'
import { useVoxelEngine } from '../../engine/use-voxel-engine'

const orange = new Color('orange').getHex()
const hotpink = new Color('hotpink').getHex()

const Sphere = () => {
    const { ecs, setBlock, CulledMeshes } = useVoxelEngine([CorePlugin, CulledMesherPlugin])

    useEffect(() => {
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
    }, [ecs])

    useControls(
        'voxels-culled-mesher-basic',
        {
            wireframe: {
                value: false,
                onChange: (value) => {
                    ecs.world.query([VoxelChunkMeshComponent]).forEach((entity) => {
                        entity.get(VoxelChunkMeshComponent).material.wireframe = value
                    })
                },
            },
        },
        [ecs],
    )

    return (
        <>
            <Bounds fit margin={1.5}>
                <CulledMeshes />
            </Bounds>

            <ambientLight intensity={0.2} />
            <pointLight intensity={0.5} position={[20, 20, 20]} />
            <pointLight intensity={0.5} position={[-20, 20, -20]} />
        </>
    )
}

export default () => {
    return (
        <Canvas camera={{ position: [20, 20, 20] }}>
            <Sphere />
            <OrbitControls makeDefault />
        </Canvas>
    )
}
