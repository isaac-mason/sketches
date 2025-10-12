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

    // The MIT License
    // Copyright (c) 2017 Inigo Quilez
    // https://www.shadertoy.com/view/lsf3WH
    float Math_Random(vec2 p) {
        p = 50.0 * fract(p * 0.3183099 + vec2(0.71, 0.133));
        return -1.0 + 2.0 * fract(p.x * p.y * (p.x + p.y));
    }

    float noise(vec2 coords) {
        vec2 texSize = vec2(1.0);
        vec2 pc = coords * texSize;
        vec2 base = floor(pc);

        float s1 = Math_Random((base + vec2(0.0, 0.0)) / texSize);
        float s2 = Math_Random((base + vec2(1.0, 0.0)) / texSize);
        float s3 = Math_Random((base + vec2(0.0, 1.0)) / texSize);
        float s4 = Math_Random((base + vec2(1.0, 1.0)) / texSize);

        vec2 f = smoothstep(0.0, 1.0, fract(pc));

        float px1 = mix(s1, s2, f.x);
        float px2 = mix(s3, s4, f.x);
        float result = mix(px1, px2, f.y);
        return result;
    }

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
    float torusSDF(vec3 pos, vec2 t) {
        vec2 q = vec2(length(pos.xz) - t.x, pos.y);
        return length(q) - t.y;
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
    const float MAX_DIST = 300.0;

    float noiseFBM(vec2 p, int octaves, float persistence, float lacunarity) {
        float amplitude = 0.5;
        float total = 0.0;

        for (int i = 0; i < octaves; i++) {
            float noiseValue = noise(p);
            total += noiseValue * amplitude;

            amplitude *= persistence;
            p = p * lacunarity;
        }

        return total;
    }

    MaterialData opU(MaterialData a, MaterialData b) {
        if (a.dist < b.dist) {
            return a;
        }

        return b;
    }

    // scene SDF
    MaterialData map(vec3 pos) {
        MaterialData boxMaterial = MaterialData(BLUE, boxSDF(pos - vec3(0.0, 0.0, 5.0), vec3(1.0))); 

        float curNoiseSample = noiseFBM(pos.xz / 2.0, 1, 0.2, 1.0);
        curNoiseSample = abs(curNoiseSample);
        curNoiseSample *= 1.5;
        curNoiseSample += 0.1 * noiseFBM(pos.xz * 2.2, 6, 0.5, 2.0);

        float waterLevel = 0.45;

        vec3 landColor = GRAY;
        landColor = mix(landColor, landColor * 0.5, smoothstep(waterLevel - 0.1, waterLevel, curNoiseSample));
        MaterialData terrainMaterial = MaterialData(landColor, pos.y + curNoiseSample);

        vec3 shallowColor = vec3(0.5, 0.5, 1.0);
        vec3 deepColor = vec3(0.25, 0.25, 0.75); 
        vec3 waterColor = mix(shallowColor, deepColor, smoothstep(waterLevel, waterLevel + 0.125, curNoiseSample));
        MaterialData waterMaterial = MaterialData(waterColor, pos.y + waterLevel);

        return opU(terrainMaterial, waterMaterial);
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

    // performs sphere tracing for the world
    vec3 raymarch(vec3 cameraOrigin, vec3 cameraDirection) {
        MaterialData material = raycast(cameraOrigin, cameraDirection, NUM_STEPS, 1.0, MIN_DIST, MAX_DIST);

        vec3 lightDirection = normalize(vec3(-0.5, 0.5, -0.6));
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

        return color;
    }

    mat3 createCameraMatrix(vec3 cameraOrigin, vec3 cameraLookAt, vec3 cameraUp) {
        vec3 z = normalize(cameraLookAt - cameraOrigin);
        vec3 x = normalize(cross(z, cameraUp));
        vec3 y = cross(x, z);
        return mat3(x, y, z);
    }

    void main() {
        vec2 pixelCoords = (vUvs - 0.5) * uResolution;

        float t = uTime / 2.0;
        vec3 rayOrigin = vec3(0, 0.75, 0.0) + vec3(0.0, 0.0, -t);
        vec3 rayDir = normalize(vec3(pixelCoords * 2.0 / uResolution.y, 1.0));
        vec3 rayLookAt = rayOrigin + vec3(0.0, 0.0, -1.0);
        mat3 camera = createCameraMatrix(rayOrigin, rayLookAt, vec3(0.0, 1.0, 0.0));

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
