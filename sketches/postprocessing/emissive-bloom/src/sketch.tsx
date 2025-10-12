import { WebGPUCanvas } from '@sketches/common'
import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { blendColor, mrt, output, pass } from 'three/tsl'
import * as THREE from 'three/webgpu'
import { PostProcessing, WebGPURenderer } from 'three/webgpu'

const App = () => {
    return (
        <>
            <mesh>
                <meshStandardMaterial color="#ffffff" emissiveIntensity={1.2} />
                <sphereGeometry args={[1]} />
            </mesh>

            <ambientLight intensity={0.7} />
            <directionalLight intensity={2.5} position={[5, 5, 0]} />
        </>
    )
}

const RenderPipeline = () => {
    const { gl, scene, camera } = useThree()

    const [postProcessing, setPostProcessing] = useState<PostProcessing | null>(null)

    useEffect(() => {
        const scenePass = pass(scene, camera, {
            magFilter: THREE.NearestFilter,
            minFilter: THREE.NearestFilter,
        })

        scenePass.setMRT(mrt({ output }))

        const scenePassColor = scenePass.getTextureNode('output')

        const strength = 0.22
        const radius = 0.5
        const threshold = 0.5
        const bloomPass = bloom(scenePassColor, strength, radius, threshold)

        const outputNode = blendColor(scenePassColor, bloomPass)

        const postProcessing = new PostProcessing(gl as unknown as WebGPURenderer)
        postProcessing.outputNode = outputNode

        setPostProcessing(postProcessing)

        return () => {
            setPostProcessing(null)
        }
    }, [gl, scene, camera])

    useFrame(() => {
        if (!postProcessing) return

        gl.clear()
        postProcessing.render()
    }, 1)

    return null
}

export function Sketch() {
    return (
        <WebGPUCanvas flat camera={{ position: [3, 3, 3] }}>
            <App />

            <color attach="background" args={['#222']} />

            <RenderPipeline />

            <OrbitControls />
        </WebGPUCanvas>
    )
}
