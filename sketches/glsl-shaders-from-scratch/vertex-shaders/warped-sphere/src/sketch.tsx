import { Canvas } from '@/common'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

const remap = /* glsl */ `
float inverseLerp(float v, float minValue, float maxValue) {
    return (v - minValue) / (maxValue - minValue);
}

float remap(float v, float inMin, float inMax, float outMin, float outMax) {
    float t = inverseLerp(v, inMin, inMax);
    return mix(outMin, outMax, t);
}
`

const vertexShader = /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vColor;

    uniform float uTime;

    ${remap}

    void main() {
        vec3 localSpacePosition = position;

        float t = sin(localSpacePosition.y * 20.0 + uTime * 10.0);
        t = remap(t, -1.0, 1.0, 0.0, 0.2);
        localSpacePosition += normal * t;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(localSpacePosition, 1.0);
        vNormal = (modelMatrix * vec4(normal, 0.0)).xyz;
        vPosition = (modelMatrix * vec4(position, 1.0)).xyz;

        vColor = mix(
            vec3(0.0, 0.0, 0.5),
            vec3(0.1, 0.5, 0.8),
            smoothstep(0.0, 0.2, t)
        );
    }
`

const fragmentShader = /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vColor;

    ${remap}

    void main() {
        vec3 baseColor = vColor.xyz;
        vec3 lighting = vec3(0.0);

        // screen space normal
        vec3 normal = normalize(cross(dFdx(vPosition), dFdy(vPosition)));

        vec3 viewDir = normalize(cameraPosition - vPosition);

        // Ambient lighting
        vec3 ambient = vec3(0.1);

        // Diffuse lighting
        vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
        vec3 lightColor = vec3(1.0, 1.0, 0.9);
        float dp = max(0.0, dot(lightDir, normal));

        vec3 diffuse = dp * lightColor;
        vec3 specular = vec3(0.0);

        specular = smoothstep(0.5, 0.51, specular);

        // Fresnel
        float fresnel = 1.0 - max(0.0, dot(viewDir, normal));
        fresnel = pow(fresnel, 2.0);
        fresnel *= step(0.7, fresnel);

        // Final color
        lighting = ambient + diffuse * 0.8;
        vec3 color = baseColor * lighting + specular;

        // approx linear to srgb
        color = pow(color, vec3(1.0 / 2.2));

        gl_FragColor = vec4(color, 1.0);
    }
`

const WarpedSphere = () => {
    const time = useRef({ value: 0 })

    useFrame(({ clock: { elapsedTime } }) => {
        time.current.value = elapsedTime
    })

    return (
        <mesh>
            <icosahedronGeometry args={[1, 128]} />
            <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={{ uTime: time.current }} />
        </mesh>
    )
}

export function Sketch() {
    return (
        <Canvas gl={{ outputColorSpace: THREE.LinearSRGBColorSpace }}>
            <WarpedSphere />

            <PerspectiveCamera makeDefault position={[0, 1.5, 6]} />
            <OrbitControls makeDefault />
        </Canvas>
    )
}
