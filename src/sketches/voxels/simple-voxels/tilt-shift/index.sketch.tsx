import { Canvas } from '@/common'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { EffectComposer, TiltShift, ToneMapping } from '@react-three/postprocessing'
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

                <group onPointerDown={console.log}>

                <VoxelChunkMeshes />
                </group>
            </Voxels>

            <EffectComposer stencilBuffer enableNormalPass={false} autoClear={false} multisampling={4}>
                <TiltShift focusArea={0.6} />
                <ToneMapping />
            </EffectComposer>

            <PerspectiveCamera makeDefault fov={40} position={[300, 60, 200]} />
            <OrbitControls makeDefault target={[78, -30, 36]} />

            <ambientLight intensity={1.5} />

            <color attach="background" args={['#f0f0f0']} />
        </Canvas>
    )
}
