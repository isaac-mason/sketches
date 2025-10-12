import { WebGPUCanvas } from '@sketches/common'
import { abs, color, mix, modelWorldMatrix, positionLocal, sin, time, vec3, vec4 } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { perlinNoise3d } from './tsl/perlin-noise-3d'
import { OrbitControls } from '@react-three/drei'

const waterMaterial = new MeshBasicNodeMaterial()

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

export function Sketch() {
    return (
        <WebGPUCanvas camera={{ position: [3, 3, 3] }}>
            <mesh rotation-x={-Math.PI / 2}>
                <planeGeometry args={[4, 4, 512, 512]} />
                <primitive object={waterMaterial} />
            </mesh>

            <OrbitControls />
        </WebGPUCanvas>
    )
}
