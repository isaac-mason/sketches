import { Bounds, Html } from '@react-three/drei'
import { ThreeElements } from '@react-three/fiber'
import { Vector3Tuple } from 'three'
import { Canvas } from '@/common'

const vertexShader = /* glsl */ `
varying vec2 vUvs;

void main() {
    vec4 localPosition = vec4(position, 1.0);

    gl_Position = projectionMatrix * modelViewMatrix * localPosition;
    vUvs = uv;
}
`

const fragmentShader = (value: TemplateStringsArray) => /* glsl */ `
varying vec2 vUvs;

vec3 white = vec3(1.0);
vec3 red = vec3(1.0, 0.0, 0.0);
vec3 blue = vec3(0.0, 0.0, 1.0);

void main() {
    ${value}

    float linearLine = smoothstep(0.0, 0.02, abs(vUvs.y - mix(0.0, 1.0, value)));

    vec3 color = mix(red, blue, value);

    color = mix(white, color, linearLine);

    gl_FragColor = vec4(color, 1.0);
}
`

const vUvsFragmentShader = fragmentShader`
    float value = vUvs.x;
`

const minFragmentShader = fragmentShader`
    float value = min(vUvs.x, 0.5);
`

const maxFragmentShader = fragmentShader`
    float value = max(vUvs.x, 0.5);
`

const clampFragmentShader = fragmentShader`
    float value = clamp(vUvs.x, 0.25, 0.75);
`

const saturateFragmentShader = fragmentShader`
    float value = saturate((vUvs.x - 0.25) / 0.5);
`

const Example = ({ frag, label, ...props }: ThreeElements['group'] & { frag: string; label: string }) => {
    return (
        <>
            <group {...props}>
                <mesh>
                    <shaderMaterial vertexShader={vertexShader} fragmentShader={frag} />
                    <planeGeometry args={[1, 1]} />
                </mesh>
                <Html transform center position-y={-1}>
                    <div style={{ color: '#fff', fontSize: '0.2em' }}>{label}</div>
                </Html>
            </group>
        </>
    )
}

const position = (index: number, n: number, padding: number) => {
    const x = (index - (n - 1) / 2) * (1 + padding)
    return [x, 0, 0] as Vector3Tuple
}

const examples = [
    { label: 'vUvs.x', frag: vUvsFragmentShader },
    { label: 'min', frag: minFragmentShader },
    { label: 'max', frag: maxFragmentShader },
    { label: 'clamp', frag: clampFragmentShader },
    { label: 'saturate', frag: saturateFragmentShader },
]

const App = () => {
    return (
        <>
            <Bounds observe fit margin={1}>
                {examples.map(({ label, frag }, index) => (
                    <Example key={index} label={label} position={position(index, examples.length, 0.2)} frag={frag} />
                ))}
            </Bounds>
        </>
    )
}

export default () => (
    <>
        <Canvas camera={{ position: [0, 0, 5] }}>
            <App />
        </Canvas>
    </>
)
