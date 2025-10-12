import suziGlbUrl from './suzi.glb?url'
import { OrbitControls, PerspectiveCamera, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'

const vertexShader = /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vNormal = (modelMatrix * vec4(normal, 0.0)).xyz;
        vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    }
`

const fragmentShader = /* glsl */ `
    float inverseLerp(float v, float minValue, float maxValue) {
        return (v - minValue) / (maxValue - minValue);
    }

    float remap(float v, float inMin, float inMax, float outMin, float outMax) {
        float t = inverseLerp(v, inMin, inMax);
        return mix(outMin, outMax, t);
    }

    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
        vec3 baseColor = vec3(0.5);
        vec3 lighting = vec3(0.0);
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(cameraPosition - vPosition);

        // Hemi light
        vec3 skyColor = vec3(0.0, 0.3, 0.6);
        vec3 groundColor = vec3(0.6, 0.3, 0.1);

        float hemiMix = remap(normal.y, -1.0, 1.0, 0.0, 1.0);
        vec3 hemi = mix(groundColor, skyColor, hemiMix);

        // Diffuse lighting
        vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
        vec3 lightColor = vec3(1.0, 1.0, 0.9);
        float dp = max(0.0, dot(lightDir, normal));

        // Toon
        dp = mix(0.5, 1.0, step(0.65, dp)) * step(0.5, dp);

        vec3 diffuse = dp * lightColor;
        vec3 specular = vec3(0.0);

        // Phong specular
        vec3 r = normalize(reflect(-lightDir, normal));
        float phongValue = max(0.0, dot(viewDir, r));
        phongValue = pow(phongValue, 128.0);

        specular += vec3(phongValue);
        specular = smoothstep(0.5, 0.51, specular);

        // Fresnel
        float fresnel = 1.0 - max(0.0, dot(viewDir, normal));
        fresnel = pow(fresnel, 2.0);
        fresnel *= step(0.7, fresnel);

        // Final color
        lighting = hemi * (fresnel + 0.2) + diffuse * 0.8;
        vec3 color = baseColor * lighting + specular;

        // approx linear to srgb
        color = pow(color, vec3(1.0 / 2.2));

        gl_FragColor = vec4(color, 1.0);
    }
`

const Suzi = () => {
    const { nodes } = useGLTF(suziGlbUrl)
    const geometry = (nodes.mesh as THREE.Mesh).geometry

    return (
        <mesh>
            <shaderMaterial
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
            />
            <primitive object={geometry} />
        </mesh>
    )
}

export function Sketch() {
    return (
        <Canvas gl={{ outputColorSpace: THREE.SRGBColorSpace }}>
            <Suzi />

            <PerspectiveCamera makeDefault position={[0, 0, 5]} />
            <OrbitControls makeDefault />
        </Canvas>
    )
}
