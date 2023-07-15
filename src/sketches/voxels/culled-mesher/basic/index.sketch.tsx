import { Bounds, OrbitControls } from '@react-three/drei'
import { useControls } from 'leva'
import { Color, MeshStandardMaterial } from 'three'
import { Canvas } from '../../../../common'
import { createVoxelWorld } from '../culled-mesher-voxel-world'

const orange = new Color('orange').getHex()
const hotpink = new Color('hotpink').getHex()

const { world, updateVoxelChunkMeshes, useVoxelWorld } = createVoxelWorld()

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

updateVoxelChunkMeshes()

const Sphere = () => {
    const { chunkMeshes } = useVoxelWorld()

    useControls(
        'voxels-culled-mesher-sphere',
        {
            wireframe: {
                value: false,
                onChange: (value) => {
                    chunkMeshes.forEach((chunkMesh) => {
                        ;(chunkMesh.mesh.material as MeshStandardMaterial).wireframe = value
                    })
                },
            },
        },
        [chunkMeshes],
    )

    return (
        <>
            <Bounds fit margin={1.5}>
                {chunkMeshes.map((chunkMesh) => (
                    <primitive key={chunkMesh.mesh.id} object={chunkMesh.mesh} />
                ))}
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
