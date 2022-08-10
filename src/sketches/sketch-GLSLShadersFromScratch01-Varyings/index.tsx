import { OrthographicCamera } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'

const vertexShader = /* glsl */ `
varying vec2 vUvs;

void main() {
    vec4 localPosition = vec4(position, 1.0);

    gl_Position = projectionMatrix * modelViewMatrix * localPosition;
    vUvs = uv;
}
`

const fragmentShader = /* glsl */ `
varying vec2 vUvs;

void main() {
    gl_FragColor = vec4(vUvs.y, 0.0, vUvs.x, 1.0);
}
`

const App = () => {
    return (
        <mesh position={[0.5, 0.5, 0]}>
            <shaderMaterial
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
            />
            <planeGeometry args={[1, 1]} />
        </mesh>
    )
}

export default () => (
    <>
        <h1 style={{ zIndex: 1 }}>SFS 01 - Varyings</h1>
        <Canvas>
            <App />
            <OrthographicCamera
                makeDefault
                manual
                args={[0, 1, 1, 0, 0.1, 1000]}
                position={[0, 0, 1]}
            />
        </Canvas>
    </>
)
