import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'

// wip

const vertexShader = /* glsl */ `
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelMatrix;

attribute vec3 position;

void main()
{
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
precision mediump float;

void main()
{
    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
}

`

const App = () => {
    return (
        <mesh>
            <rawShaderMaterial
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
            />
            <boxGeometry args={[1, 1, 1]} />
        </mesh>
    )
}

export default () => (
    <>
        <h1>Journey 27 - Shaders</h1>
        <Canvas camera={{ position: [3, 3, 3] }}>
            <App />
            <OrbitControls />
        </Canvas>
    </>
)
