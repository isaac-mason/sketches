import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { MeshBasicNodeMaterial, mix, positionLocal, sin, timerLocal, vec3 } from 'three/examples/jsm/nodes/Nodes.js'
import { WebGPUCanvas } from '../../../common'

const material = new MeshBasicNodeMaterial()

const red = vec3(1, 0, 0)
const blue = vec3(0, 0, 1)

const time = timerLocal(0.5)

material.colorNode = mix(red, blue, sin(time))

material.positionNode = positionLocal.add(vec3(0, sin(time).mul(0.2), 0))

export default () => (
    <WebGPUCanvas>
        <mesh>
            <boxGeometry />
            <primitive attach="material" object={material} />
        </mesh>

        <OrbitControls />
        <PerspectiveCamera position={[2, 1, 2]} makeDefault />
    </WebGPUCanvas>
)
