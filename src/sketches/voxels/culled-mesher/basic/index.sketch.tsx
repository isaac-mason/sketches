import { Bounds, OrbitControls } from '@react-three/drei'
import { useControls } from 'leva'
import { Color, MeshStandardMaterial } from 'three'
import { Canvas } from '../../../../common'
import { useVoxelWorld } from '../voxel-world'
import { useEffect } from 'react'

const orange = new Color('orange').getHex()
const hotpink = new Color('hotpink').getHex()

const Sphere = () => {
    const world = useVoxelWorld()

    useEffect(() => {
        if (!world) return

        // sphere
        for (let x = -10; x < 10; x++) {
            for (let y = -10; y < 10; y++) {
                for (let z = -10; z < 10; z++) {
                    if (x * x + y * y + z * z < 10 * 10) {
                        world.setBlock([x, y, z], {
                            solid: true,
                            color: Math.random() > 0.5 ? orange : hotpink,
                        })
                    }
                }
            }
        }
    }, [world])

    useControls(
        'voxels-culled-mesher-sphere',
        {
            wireframe: {
                value: false,
                onChange: (value) => {
                    world?.chunkMeshes.forEach((chunkMesh) => {
                        ;(chunkMesh.mesh.material as MeshStandardMaterial).wireframe = value
                    })
                },
            },
        },
        [world],
    )

    return (
        <>
            <Bounds fit margin={1.5}>
                {world && <primitive object={world.group} />}
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
