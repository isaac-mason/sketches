import { WebGPUCanvas } from '@/common'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Object3DNode, extend, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import PostProcessingImpl from 'three/addons/renderers/common/PostProcessing.js'
import { MeshStandardNodeMaterial, pass, vec4, viewportTopLeft } from 'three/examples/jsm/nodes/Nodes.js'
import WebGPURenderer from 'three/examples/jsm/renderers/webgpu/WebGPURenderer.js'

const PostProcessing = () => {
    const gl = useThree((s) => s.gl) as unknown as WebGPURenderer
    const scene = useThree((s) => s.scene)
    const camera = useThree((s) => s.camera)

    const [postProcessing, setPostProcessing] = useState<PostProcessingImpl>()

    useEffect(() => {
        const scenePass = pass(scene, camera)

        const vignette = viewportTopLeft.distance(0.5).mul(1.35).clamp().oneMinus()
        const vignetteDarkenedSceneTexture = scenePass.getTextureNode().rgb.mul(vignette)
        const vignettePass = vec4(vignetteDarkenedSceneTexture, 1)

        const out = vignettePass

        const postProcessing = new PostProcessingImpl(gl, out)

        setPostProcessing(postProcessing)

        return () => {
            setPostProcessing(undefined)
        }
    }, [scene, camera])

    useFrame(() => {
        if (!postProcessing) return

        postProcessing.render()
    }, 1)

    return null
}

export function Sketch() {
    return (
        <WebGPUCanvas>
            <mesh>
                <boxGeometry />
                <meshStandardNodeMaterial color="orange" />
            </mesh>

            <ambientLight intensity={1} />
            <pointLight decay={1.5} intensity={100} position={[10, 15, 5]} />

            <color attach="background" args={['#fff']} />

            <PerspectiveCamera makeDefault position={[5, 2, 5]} />
            <OrbitControls makeDefault />

            <PostProcessing />
        </WebGPUCanvas>
    )
}

extend({ MeshStandardNodeMaterial })

declare module '@react-three/fiber' {
    interface ThreeElements {
        meshStandardNodeMaterial: Object3DNode<MeshStandardNodeMaterial, typeof MeshStandardNodeMaterial>
    }
}
