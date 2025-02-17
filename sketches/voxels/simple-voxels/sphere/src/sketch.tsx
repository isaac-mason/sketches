import { Canvas } from '@/common'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useEffect } from 'react'
import * as THREE from 'three'
import { VoxelChunkMeshes, Voxels, useVoxels } from '../../lib/react'

const orange = new THREE.Color('orange').getHex()
const hotpink = new THREE.Color('hotpink').getHex()

const Sphere = () => {
    const { voxels } = useVoxels()

    useEffect(() => {
        for (let x = -10; x < 10; x++) {
            for (let y = -10; y < 10; y++) {
                for (let z = -10; z < 10; z++) {
                    if (x * x + y * y + z * z < 10 * 10) {
                        voxels.setBlock(x, y, z, true, Math.random() > 0.5 ? orange : hotpink)
                    }
                }
            }
        }
    }, [voxels])

    return null
}

export function Sketch() {
    return (
        <Canvas>
            <Voxels>
                <Sphere />

                <VoxelChunkMeshes chunkHelper />
            </Voxels>

            <PerspectiveCamera makeDefault position={[30, 30, 30]} />
            <OrbitControls makeDefault />

            <ambientLight intensity={1.5} />
        </Canvas>
    )
}
