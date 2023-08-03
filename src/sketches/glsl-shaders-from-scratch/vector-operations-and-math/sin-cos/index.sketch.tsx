import { OrthographicCamera, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Canvas } from '../../../../common'
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

uniform sampler2D diffuse1;

uniform float uTime;

float inverseLerp(float v, float minValue, float maxValue) {
    return (v - minValue) / (maxValue - minValue);
}

float remap(float v, float inMin, float inMax, float outMin, float outMax) {
    float t = inverseLerp(v, inMin, inMax);
    return mix(outMin, outMax, t);
}

void main() {
    float t1 = remap(sin(vUvs.y * 400.0 + uTime * 10.0), -1.0, 1.0, 0.9, 1.0);
    float t2 = remap(sin(vUvs.y * 50.0 - uTime * 2.0), -1.0, 1.0, 0.9, 1.0);

    vec3 color = texture2D(diffuse1, vUvs).xyz * t1 * t2;

    gl_FragColor = vec4(color, 1.0);
}
`

const App = () => {
    const dogTexture = useTexture(dogImage)

    const time = useRef({ value: 0 })

    useFrame(({ clock: { elapsedTime } }) => {
        time.current.value = elapsedTime
    })

    return (
        <mesh position={[0.5, 0.5, 0]}>
            <shaderMaterial
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={{
                    diffuse1: { value: dogTexture },
                    uTime: time.current,
                }}
            />
            <planeGeometry args={[1, 1]} />
        </mesh>
    )
}

export default () => (
    <>
        <Canvas>
            <App />
            <OrthographicCamera
                makeDefault
                manual
                top={1}
                bottom={0}
                left={0}
                right={1}
                near={0.1}
                far={1000}
                position={[0, 0, 0.5]}
            />
        </Canvas>
    </>
)
