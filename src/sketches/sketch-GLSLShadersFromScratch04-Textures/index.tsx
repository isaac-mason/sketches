import { OrthographicCamera, useTexture } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Vector4 } from 'three'
import dogImage from './dog.jpeg'

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

uniform sampler2D diffuse;
uniform vec4 tint;

void main() {
    // flip the image horizontally, just for fun
    vec4 diffuseSample = texture2D(diffuse, vec2(1.0 - vUvs.x, vUvs.y));

    // apply the tint
    // "modulate" or "modulation" blending
    gl_FragColor = diffuseSample * tint;

    // 'diffuseSample * tint' is doing component-wise multiplication
    // same as:
    // gl_FragColor = vec4(
    //     diffuseSample.r * tint.x,
    //     diffuseSample.g * tint.y,
    //     diffuseSample.b * tint.z,
    //     1.0
    // );
}
`

const App = () => {
    const texture = useTexture(dogImage)
    return (
        <mesh position={[0.5, 0.5, 0]}>
            <shaderMaterial
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={{
                    diffuse: { value: texture },
                    tint: { value: new Vector4(1, 0.7, 0.7) },
                }}
            />
            <planeBufferGeometry args={[1, 1]} />
        </mesh>
    )
}

export default () => (
    <>
        <h1 style={{ zIndex: 1 }}>SFS 04 - Textures</h1>
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