import { OrthographicCamera } from '@react-three/drei'
import { Canvas } from '../../../../common'
import { useResolution } from '../../../../common/hooks/use-resolution'

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

uniform vec2 uResolution;

vec3 white = vec3(1.0);
vec3 black = vec3(0.0);

vec3 blue = vec3(0.0, 0.0, 1.0);

vec3 red = vec3(1.0, 0.0, 0.0);
vec3 yellow = vec3(1.0, 1.0, 0.0);
vec3 purple = vec3(1.0, 0.0, 1.0);
vec3 aqua = vec3(0.0, 1.0, 1.0);
vec3 brown = vec3(0.8, 0.3, 0.0);
vec3 orange = vec3(1.0, 0.5, 0.0);

float functionLine(float x, float y) {
    return smoothstep(0.0, 0.075, abs(y - x));
}

void main() {
    vec3 color = vec3(0.75);

    /* grid */
    vec2 center = vUvs - 0.5;
    vec2 cell = fract(center * uResolution / 100.00);
    cell = abs(cell - 0.5);
    float distToCell = 1.0 - 2.0 * max(cell.x, cell.y);

    float cellLine = smoothstep(0.0, 0.05, distToCell);

    float xAxis = smoothstep(0.0, 0.002, abs(vUvs.y - 0.5));
    float yAxis = smoothstep(0.0, 0.002, abs(vUvs.x - 0.5));

    /* lines */

    vec2 pos = center * uResolution / 100.0;
    float value1 = pos.x;
    float value2 = abs(pos.x);
    float value3 = ceil(pos.x);
    float value4 = round(pos.x);
    float value5 = fract(pos.x);
    float value6 = mod(pos.x, 0.5);

    // float functionLine1 = smoothstep(0.0, 0.075, abs(pos.y - value1));
    // float functionLine2 = smoothstep(0.0, 0.075, abs(pos.y - value2));

    // cell
    color = mix(black, color, cellLine);
    
    // x and y axis
    color = mix(blue, color, xAxis);
    color = mix(blue, color, yAxis);

    // function lines
    color = mix(yellow, color, functionLine(value1, pos.y));
    color = mix(red, color, functionLine(value2, pos.y));
    color = mix(purple, color, functionLine(value3, pos.y));
    color = mix(aqua, color, functionLine(value4, pos.y));
    color = mix(brown, color, functionLine(value5, pos.y));
    color = mix(orange, color, functionLine(value6, pos.y));

    gl_FragColor = vec4(color, 1.0);
}
`

const App = () => {
    const resolution = useResolution()

    return (
        <mesh position={[0.5, 0.5, 0]}>
            <shaderMaterial
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={{
                    uResolution: resolution.current,
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
