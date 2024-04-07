import { Canvas } from '@/common'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { EffectComposer, TiltShift2, ToneMapping } from '@react-three/postprocessing'
import { VoxelChunkMeshes, Voxels } from '../lib/react'
import { useGoxelLevel } from '../use-goxel-level'
import metropolisMapUrl from './metropolis.txt?url'

const VoxelMap = () => {
    useGoxelLevel(metropolisMapUrl)

    return null
}

export default function Sketch() {
    return (
        <Canvas>
            <Voxels>
                <VoxelMap />
                <VoxelChunkMeshes />
            </Voxels>

            <EffectComposer stencilBuffer enableNormalPass={false} autoClear={false} multisampling={4}>
                <TiltShift2 samples={5} blur={0.1} />
                <ToneMapping />
            </EffectComposer>

            <PerspectiveCamera makeDefault fov={40} position={[300, 60, 200]} />
            <OrbitControls makeDefault target={[50, -50, 0]} />

            <ambientLight intensity={1.5} />

            <color attach="background" args={['#f0f0f0']} />
        </Canvas>
    )
}
