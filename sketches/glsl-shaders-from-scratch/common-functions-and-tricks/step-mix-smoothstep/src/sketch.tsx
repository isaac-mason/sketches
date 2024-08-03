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

const vUvsXFragmentShader = /* glsl */ `
varying vec2 vUvs;

void main() {
    vec3 color = vec3(vUvs.x);
    gl_FragColor = vec4(color, 1.0);
}
`

const stepFragmentShader = /* glsl */ `
varying vec2 vUvs;

void main() {
    vec3 color = vec3(step(0.5, vUvs.x));
    gl_FragColor = vec4(color, 1.0);
}
`

const mixFragmentShader = /* glsl */ `
varying vec2 vUvs;

void main() {
    vec3 gradientColor = vec3(vUvs.x);
    vec3 stepColor = vec3(step(0.5, vUvs.x));
    vec3 color = mix(gradientColor, stepColor, 0.5);

    gl_FragColor = vec4(color, 1.0);
}
`

const smoothstepFragmentShader = /* glsl */ `
varying vec2 vUvs;

void main() {
    vec3 color = vec3(smoothstep(0.0, 1.0, vUvs.x));

    gl_FragColor = vec4(color, 1.0);
}
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
    { label: 'vUvs.x', frag: vUvsXFragmentShader },
    { label: 'step', frag: stepFragmentShader },
    { label: 'mix', frag: mixFragmentShader },
    { label: 'smoothstep', frag: smoothstepFragmentShader },
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

export function Sketch() {
    return (
        <Canvas camera={{ position: [0, 0, 5] }}>
            <App />
        </Canvas>
    )
}
