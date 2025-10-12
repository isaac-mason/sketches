import { useResolution } from '@sketches/common'
import { OrthographicCamera } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useRef } from 'react'

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

    float inverseLerp(float v, float minValue, float maxValue) {
        return (v - minValue) / (maxValue - minValue);
    }
    float remap(float v, float inMin, float inMax, float outMin, float outMax) {
        float t = inverseLerp(v, inMin, inMax);
        return mix(outMin, outMax, t);
    }

    float sphereSDF(vec3 pos, float radius) {
        return length(pos) - radius;
    }
    float boxSDF(vec3 pos, vec3 size) {
        vec3 d = abs(pos) - size;
        return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
    }
    float roundBoxSDF(vec3 pos, vec3 size, float radius) {
        vec3 q = abs(pos) - size;
        return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - radius;
    }
    float planeSDF(vec3 pos) {
        return pos.y;
    }

    struct MaterialData {
        vec3 color;
        float dist;
    };

    vec3 RED = vec3(1.0, 0.0, 0.0);
    vec3 BLUE = vec3(0.0, 0.0, 1.0);
    vec3 GREEN = vec3(0.0, 1.0, 0.0);
    vec3 GRAY = vec3(0.5);
    vec3 WHITE = vec3(1.0);
    vec3 BLACK = vec3(0.0);

    const int NUM_STEPS = 256;
    const float MIN_DIST = 0.00001;
    const float MAX_DIST = 1000.0;

    // scene SDF
    MaterialData map(vec3 pos) {
        MaterialData result = MaterialData(GRAY, planeSDF(pos - vec3(0.0, -1.0, 0.0)));

        float dist;
        
        dist = boxSDF(pos - vec3(2.0, 0.0, 5.0), vec3(1.0));
        result.color = dist < result.dist ? RED : result.color;
        result.dist = min(dist, result.dist);

        dist = roundBoxSDF(pos - vec3(-2.0, 0.3, 5.0), vec3(0.5), 0.5);
        result.color = dist < result.dist ? BLUE : result.color;
        result.dist = min(dist, result.dist);

        dist = sphereSDF(pos - vec3(0.0, 0.5, -25.0 + sin(uTime) * 25.0), 1.0);
        result.color = dist < result.dist ? GREEN : result.color;
        result.dist = min(dist, result.dist);

        return result;
    }

    vec3 calculateNormal(vec3 pos) {
        const float EPS = 0.0001;
        vec3 n = vec3(
            map(pos + vec3(EPS, 0.0, 0.0)).dist - map(pos - vec3(EPS, 0.0, 0.0)).dist,
            map(pos + vec3(0.0, EPS, 0.0)).dist - map(pos - vec3(0.0, EPS, 0.0)).dist,
            map(pos + vec3(0.0, 0.0, EPS)).dist - map(pos - vec3(0.0, 0.0, EPS)).dist
        );
        return normalize(n);
    }

    vec3 calculateLighting(vec3 pos, vec3 normal, vec3 lightColor, vec3 lightDirection) {
        float dp = saturate(dot(normal, lightDirection));
        return lightColor * dp;
    }

    MaterialData raycast(vec3 cameraOrigin, vec3 cameraDirection, int numSteps, float startDist, float minDist, float maxDist) {
        MaterialData material = MaterialData(BLACK, startDist);
        MaterialData defaultMaterial = MaterialData(BLACK, -1.0);

        vec3 position;

        for (int i = 0; i < numSteps; i++) {
            position = cameraOrigin + material.dist * cameraDirection;

            MaterialData result = map(position);
        
            if (abs(result.dist) < minDist * material.dist) {
                break;
            }

            material.dist += result.dist;
            material.color = result.color;
            
            if (material.dist > maxDist) {
                return defaultMaterial;
            }
        }

        return material;
    }

    float calculateShadow(vec3 pos, vec3 lightDirection) {
        MaterialData result = raycast(pos, lightDirection, 64, 0.01, 0.00001, 10.0);

        if (result.dist >= 0.0) {
            return 0.0;
        }

        return 1.0;
    }

    float calculateAO(vec3 pos, vec3 normal) {
        float ao = 0.0;
        float stepSize = 0.1;

        for (float i = 0.0; i < 5.0; i++) {
            float distFactor = 1.0 / pow(2.0, i);

            ao += distFactor * (i * stepSize - map(pos + normal * i * stepSize).dist);
        }

        return 1.0 - ao;
    }

    // performs sphere tracing for the world
    vec3 raymarch(vec3 cameraOrigin, vec3 cameraDirection) {
        MaterialData material = raycast(cameraOrigin, cameraDirection, NUM_STEPS, 1.0, MIN_DIST, MAX_DIST);

        vec3 lightDirection = normalize(vec3(0.5, 0.5, 0.6));
        vec3 lightColor = WHITE;
        
        float skyT = exp(saturate(cameraDirection.y) * -40.0);
        float sunFactor = pow(saturate(dot(lightDirection, cameraDirection)), 8.0);
        vec3 skyColor = mix(vec3(0.025, 0.065, 0.5), vec3(0.4, 0.5, 1.0), skyT);
        vec3 fogColor = mix(skyColor, vec3(1.0, 0.9, 0.65), sunFactor);

        if (material.dist < 0.0) {
            return fogColor;
        }

        vec3 position = cameraOrigin + material.dist * cameraDirection;

        vec3 normal = calculateNormal(position);
        float shadow = calculateShadow(position, lightDirection);
        vec3 lighting = calculateLighting(position, normal, lightColor, lightDirection);
        lighting *= shadow;

        vec3 color = material.color * lighting;

        float fogDist = distance(cameraOrigin, position);
        float inscatter = 1.0 - exp(-fogDist * fogDist * 0.0005);
        float extinction = exp(-fogDist * fogDist * 0.0025);

        color = color * extinction + fogColor * inscatter;
        
        // TODO: ao
        // float ao = calculateAO(position, normal);
        // color *= ao;

        return color;
    }

    mat3 makeCameraMatrix(vec3 cameraOrigin, vec3 cameraLookAt, vec3 cameraUp) {
        vec3 z = normalize(cameraLookAt - cameraOrigin);
        vec3 x = normalize(cross(z, cameraUp));
        vec3 y = cross(x, z);
        return mat3(x, y, z);
    }

    void main() {
        vec2 pixelCoords = (vUvs - 0.5) * uResolution;

        float t = uTime / 10.0;
        vec3 rayOrigin = vec3(0.0, 1.0, 10.0);
        vec3 rayDir = normalize(vec3(pixelCoords * 2.0 / uResolution.y, 1.0));
        vec3 rayLookAt = vec3(0.0, 0.5, -2.0);
        mat3 camera = makeCameraMatrix(rayOrigin, rayLookAt, vec3(0.0, 1.0, 0.0));

        vec3 color = raymarch(rayOrigin, camera * rayDir);

        gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
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

export function Sketch() {
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
