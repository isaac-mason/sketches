import { MeshBasicNodeMaterial, mix, uv, vec3 } from 'three/tsl'
import { WebGPUCanvas } from '@/common/components/webgpu-canvas'

const material = new MeshBasicNodeMaterial()

const purple = vec3(0.5, 0, 0.5)
const blue = vec3(0, 0, 1)

const uvCoordinates = uv()
const colorMix = uvCoordinates.x.add(uvCoordinates.y).div(Math.sqrt(2))
material.colorNode = mix(purple, blue, colorMix)

export function Sketch() {
    return (
        <WebGPUCanvas
            orthographic
            camera={{
                top: 0.5,
                bottom: -0.5,
                left: -0.5,
                right: 0.5,
                near: 0.1,
                far: 1000,
                position: [0, 0, 0.5],
            }}
        >
            <mesh>
                <planeGeometry args={[1, 1]} />
                <primitive attach="material" object={material} />
            </mesh>
        </WebGPUCanvas>
    )
}
