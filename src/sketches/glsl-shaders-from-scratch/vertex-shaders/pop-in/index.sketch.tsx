import { Canvas } from '@/common'
import suziGlbUrl from '@pmndrs/assets/models/suzi.glb'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
    varying vec3 vPosition;
    varying vec3 vNormal;

    uniform float uTime;

    float easeOutBounce(float t) {
        if (t < 1.0 / 2.75) {
            return 7.5625 * t * t;
        } else if (t < 2.0 / 2.75) {
            t -= 1.5 / 2.75;
            return 7.5625 * t * t + 0.75;
        } else if (t < 2.5 / 2.75) {
            t -= 2.25 / 2.75;
            return 7.5625 * t * t + 0.9375;
        } else {
            t -= 2.625 / 2.75;
            return 7.5625 * t * t + 0.984375;
        }
    }

    void main() {
        vec3 localSpacePosition = position;

        float easeTime = sin(uTime * 3.0) * 0.5 + 0.5;
        localSpacePosition *= easeOutBounce(clamp(easeTime, 0.0, 1.0));

        gl_Position = projectionMatrix * modelViewMatrix * vec4(localSpacePosition, 1.0);

        vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        vNormal = (modelMatrix * vec4(normal, 0.0)).xyz;
    }
`

const fragmentShader = /* glsl */ `
    varying vec3 vPosition;
    varying vec3 vNormal;

    void main() {
        vec3 normal = normalize(vNormal);

        vec3 viewDir = normalize(cameraPosition - vPosition);

        float fresnel = max(0.0, dot(viewDir, normal));
        fresnel = pow(fresnel, 2.0);

        vec3 color = vec3(fresnel);

        gl_FragColor = vec4(color, 1.0);
    }
`

const Suzi = () => {
    const { nodes } = useGLTF(suziGlbUrl)
    const geometry = (nodes.mesh as THREE.Mesh).geometry

    const time = useRef({ value: 0 })

    useFrame(({ clock: { elapsedTime } }) => {
        time.current.value = elapsedTime
    })

    return (
        <mesh>
            <shaderMaterial
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={{
                    uTime: time.current,
                }}
            />
            <primitive object={geometry} />
        </mesh>
    )
}

export default function Sketch() {
    return (
        <Canvas>
            <Suzi />
            <OrbitControls makeDefault />
        </Canvas>
    )
}
