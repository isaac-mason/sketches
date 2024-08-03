import { Canvas, useResolution } from '@/common'
import { OrthographicCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'

// https://raytracing.github.io/books/RayTracingInOneWeekend.html#outputanimage

const vertexShader = /* glsl */ `
    varying vec2 vUvs;

    void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

        vUvs = uv;
    }
`

const fragmentShader = /* glsl */ `
    uniform vec2 uResolution;
    uniform float uTime;
    
    varying vec2 vUvs;

    struct Ray {
        vec3 origin;
        vec3 direction;
    };

    struct RayResult {
        vec3 color;
    };

    mat3 cameraMatrix(vec3 cameraOrigin, vec3 cameraLookAt, vec3 cameraUp) {
        vec3 z = normalize(cameraLookAt - cameraOrigin);
        vec3 x = normalize(cross(z, cameraUp));
        vec3 y = cross(x, z);
        return mat3(x, y, z);
    }

    bool hitSphere(vec3 point, float radius, Ray ray) {
        vec3 oc = ray.origin - point;
        float a = dot(ray.direction, ray.direction);
        float b = 2.0 * dot(oc, ray.direction);
        float c = dot(oc, oc) - radius * radius;
        float discriminant = b * b - 4.0 * a * c;
        return (discriminant > 0.0);
    }

    RayResult rayColor(Ray ray) {
        RayResult result;

        if (hitSphere(vec3(0.0, 0.0, -2.0), 0.5, ray)) {
            result.color = vec3(1.0, 0.0, 0.0);

            return result;
        }

        // sky
        vec3 unitDirection = normalize(ray.direction);
        float t = 0.5 * (unitDirection.y + 1.0);
        result.color = (1.0 - t) * vec3(1.0, 1.0, 1.0) + t * vec3(0.5, 0.7, 1.0);

        return result;
    }

    void main() {
        vec2 pixelCoords = (vUvs - 0.5) * uResolution;

        vec3 rayOrigin = vec3(0.0, 1.0, 2.0);
        vec3 rayLookAt = vec3(0.0, 0.5, 0.0);
        vec3 rayDirection = normalize(vec3(pixelCoords * 2.0 / uResolution.y, 1.0));

        mat3 camera = cameraMatrix(rayOrigin, rayLookAt, vec3(0.0, 1.0, 0.0));
        vec3 cameraDirection = camera * rayDirection;

        Ray ray = Ray(rayOrigin, cameraDirection);
        RayResult result = rayColor(ray);

        vec3 color = result.color;

        gl_FragColor = vec4(color, 1.0);
    }
`

const ShaderPlane = () => {
    const time = useRef({ value: 0 })
    const resolution = useResolution()

    useFrame(({ clock: { elapsedTime } }) => {
        time.current.value = elapsedTime
    })

    return (
        <mesh>
            <planeGeometry args={[1, 1]} />
            <shaderMaterial
                key={vertexShader + fragmentShader}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={{
                    uTime: time.current,
                    uResolution: resolution.current,
                }}
            />
        </mesh>
    )
}

export default function Sketch() {
    return (
        <Canvas>
            <ShaderPlane />

            <OrthographicCamera
                makeDefault
                manual
                top={0.5}
                bottom={-0.5}
                left={-0.5}
                right={0.5}
                near={0.1}
                far={1000}
                position={[0, 0, 0.5]}
            />
        </Canvas>
    )
}
