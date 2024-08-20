import { WebGPUCanvas } from '@/common/components/webgpu-canvas'
import { MeshBasicNodeMaterial, mix, positionLocal, sin, timerLocal, vec3 } from 'three/tsl'

const material = new MeshBasicNodeMaterial()

const red = vec3(1, 0, 0)
const blue = vec3(0, 0, 1)

const time = timerLocal(0.5)

material.colorNode = mix(red, blue, sin(time))

material.positionNode = positionLocal.add(vec3(0, sin(time).mul(0.2), 0))

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
