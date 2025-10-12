import { WebGPUCanvas } from '@sketches/common/components/webgpu-canvas'
import { mix, positionLocal, sin, time, vec3 } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'

const material = new MeshBasicNodeMaterial()

const red = vec3(1, 0, 0)
const blue = vec3(0, 0, 1)

const currentTime = time.mul(0.5)

material.colorNode = mix(red, blue, sin(currentTime))

material.positionNode = positionLocal.add(vec3(0, sin(currentTime).mul(0.2), 0))

export function Sketch() {
    return (
        <WebGPUCanvas camera={{ position: [2, 1, 2] }}>
            <mesh>
                <boxGeometry />
                <primitive attach="material" object={material} />
            </mesh>
        </WebGPUCanvas>
    )
}
