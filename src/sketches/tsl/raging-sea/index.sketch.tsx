import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import {
    MeshBasicNodeMaterial,
    abs,
    color,
    mix,
    modelWorldMatrix,
    positionLocal,
    sin,
    timerLocal,
    vec3,
    vec4,
} from 'three/examples/jsm/nodes/Nodes.js'
import { WebGPUCanvas } from '@/common'
import { perlinNoise3d } from '@/common/tsl/noise/perlinNoise3d'

const waterMaterial = new MeshBasicNodeMaterial()

const time = timerLocal(1)

const modelPosition = modelWorldMatrix.mul(vec4(positionLocal, 1))

const wavesElevation = 0.2
const smallWavesElevation = 0.15
const wavesSpeed = 0.75
const smallWavesSpeed = 0.25
const smallWavesFrequency = 3
const wavesNoiseIterations = 5
const wavesFrequency = { x: 4, y: 1.5 }

let elevation = sin(modelPosition.x.mul(wavesFrequency.x).add(time.mul(wavesSpeed)))
    .mul(sin(modelPosition.z.mul(wavesFrequency.y).add(time.mul(wavesSpeed))))
    .mul(wavesElevation)

for (let i = 1; i <= wavesNoiseIterations; i++) {
    const noise = perlinNoise3d({ position: vec3(modelPosition.xz.mul(smallWavesFrequency).mul(i), time.mul(smallWavesSpeed)) })
    const iter = abs(noise.mul(smallWavesElevation).div(i))
    elevation = elevation.sub(iter)
}

waterMaterial.positionNode = positionLocal.add(vec3(0, 0, elevation))

const wavesLowColor = color('#02314d')
const wavesHighColor = color('#9bd8ff')
const wavesColorOffset = 0.5
const wavesColorMultiplier = 1.2

const waterColor = mix(wavesLowColor, wavesHighColor, elevation.mul(wavesColorMultiplier).add(wavesColorOffset).clamp())

waterMaterial.colorNode = waterColor

export default function Sketch() {
    return (
        <WebGPUCanvas webglFallback={false}>
            <mesh rotation-x={-Math.PI / 2}>
                <planeGeometry args={[4, 4, 512, 512]} />
                <primitive object={waterMaterial} />
            </mesh>

            <OrbitControls makeDefault />
            <PerspectiveCamera makeDefault position={[3, 3, 3]} />
        </WebGPUCanvas>
    )
}
