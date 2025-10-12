import { useResolution } from '@sketches/common'
import { Html, OrthographicCamera } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
varying vec2 vUvs;

void main() {
    vec4 localPosition = vec4(position, 1.0);

    gl_Position = projectionMatrix * modelViewMatrix * localPosition;
    vUvs = uv;
}
`

const fragmentShader = /* glsl */ `
precision highp float;

varying vec2 vUvs;

uniform float uZoom;
uniform vec2 uCenter;
uniform vec2 uResolution;

// https://www.shadertoy.com/view/lsX3W4
float distanceToMandelbrot(vec2 coord)
{
    float c2 = dot(coord, coord);
    // skip computation inside M1 - https://iquilezles.org/articles/mset1bulb
    if (256.0 * c2 * c2 - 96.0 * c2 + 32.0 * coord.x - 3.0 < 0.0) return 0.0;

    // skip computation inside M2 - https://iquilezles.org/articles/mset2bulb
    if (16.0 * (c2 + 2.0 * coord.x + 1.0) - 1.0 < 0.0) return 0.0;
 
    // iterate
    float di = 1.0;
    vec2 z = vec2(0.0);
    float m2 = 0.0;
    vec2 dz = vec2(0.0);

    for (int i = 0; i < 300; i++) {
        if (m2 > 1024.0) {
            di = 0.0;
            break;
        }

		// Z' -> 2·Z·Z' + 1
        dz = 2.0 * vec2(z.x * dz.x - z.y * dz.y, z.x * dz.y + z.y * dz.x) + vec2(1.0, 0.0);
			
        // Z -> Z² + c			
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + coord;
			
        m2 = dot(z, z);
    }

    // distance	
	// d(c) = |Z|·log|Z|/|Z'|
	float d = 0.5 * sqrt(dot(z, z) / dot(dz, dz)) * log(dot(z, z));

    if (di > 0.5) {
        d = 0.0;
    }
	
    return d;
}

void main() {
    vec2 coord = (vUvs - 0.5) * 2.0;
    coord.x *= uResolution.x / uResolution.y;
    coord *= uZoom;
    coord += uCenter;

    float distance = distanceToMandelbrot(coord);
    
    float adjusted = clamp(pow(4.0 * distance / uZoom, 0.2), 0.0, 1.0);

    vec3 col = vec3(adjusted);
    
    gl_FragColor = vec4(col, 1.0);
}

`

const App = () => {
    const resolution = useResolution()

    const zoom = useRef({ value: 1 })
    const center = useRef({ value: new THREE.Vector2(-0.05, 0.6805) })

    const [rangeValue, setRangeValue] = useState(0)

    useEffect(() => {
        const minZoom = 1
        const maxZoom = 0.0001
        const scale = Math.log(maxZoom / minZoom)

        zoom.current.value = minZoom * Math.exp(scale * rangeValue)
    }, [rangeValue])

    return (
        <>
            <mesh position={[0, 0, 0]}>
                <shaderMaterial
                    vertexShader={vertexShader}
                    fragmentShader={fragmentShader}
                    uniforms={{
                        uZoom: zoom.current,
                        uCenter: center.current,
                        uResolution: resolution.current,
                    }}
                />
                <planeGeometry args={[1, 1]} />
            </mesh>

            <Html transform position={[0, -0.4, 0]} scale={0.1}>
                <input
                    type="range"
                    value={rangeValue}
                    min={0}
                    max={1}
                    step={0.001}
                    onChange={(e) => {
                        setRangeValue(Number(e.target.value))
                    }}
                />
            </Html>
        </>
    )
}

export function Sketch() {
    return (
        <>
            <Canvas>
                <App />
                <OrthographicCamera
                    makeDefault
                    manual
                    top={0.5}
                    bottom={-0.5}
                    left={-0.5}
                    right={0.5}
                    near={0.1}
                    far={1000}
                    position={[0, 0, 1]}
                />
            </Canvas>
        </>
    )
}
