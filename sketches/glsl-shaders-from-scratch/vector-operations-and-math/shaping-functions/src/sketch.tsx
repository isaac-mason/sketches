import { OrthographicCamera } from '@react-three/drei'
import { Canvas } from '@/common'

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

void main() {
    vec3 color = vec3(0.0);

    vec3 red = vec3(1.0, 0.0, 0.0);
    vec3 blue = vec3(0.0, 0.0, 1.0);
    vec3 white = vec3(1.0);

    int n = 4;

    for (int i = 0; i < 4; i++) {
        float startY = float(n - i - 1) / float(n);
        float endY = float(n - i) / float(n);
        
        if (vUvs.y > startY && vUvs.y < endY) {
            float value;

            if (i == 0) {
                value = vUvs.x;
            } else if (i == 1) {
                value = pow(vUvs.x, 2.0);
            } else if (i == 2) {
                value = pow(vUvs.x, 0.5);
            } else {
                value = vUvs.x * (1.0 - vUvs.x) * 4.0;
            }
    
            float line = smoothstep(0.0, 0.005, abs(vUvs.y - mix(startY, endY, value)));

            color = mix(blue, red, value);
            color = mix(white, color, line);
        }
    }

    gl_FragColor = vec4(color, 1.0);
}
`

const App = () => {
    return (
        <mesh position={[0.5, 0.5, 0]}>
            <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} />
            <planeGeometry args={[1, 1]} />
        </mesh>
    )
}

export function Sketch() {
    return (
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
    )
}
