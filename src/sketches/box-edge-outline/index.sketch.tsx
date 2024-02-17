import { Bounds, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { DoubleSide, Vector3Tuple } from 'three'
import { Canvas } from '../../common'

const vertexShader = /* glsl */ `
    uniform vec3 uBoxSize;

    varying vec2 vUvs;
    varying vec2 vSize;

    void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vUvs = uv;

        if(abs(normal.x) == 1.0) {
            vSize = uBoxSize.yz;
        } else if(abs(normal.y) == 1.0) {
            vSize = uBoxSize.xz;
        } else if(abs(normal.z) == 1.0) {
            vSize = uBoxSize.xy;
        }
    }
`

const fragmentShader = /* glsl */ `
    varying vec2 vUvs;
    varying vec2 vSize;
 
    void main() {
        vec3 lineColor = vec3(1.0);

        float lineWidth = 0.02;
        float xLineWidth = lineWidth / vSize.x;
        float yLineWidth = lineWidth / vSize.y;

        if (vUvs.x < xLineWidth || vUvs.x > 1.0 - xLineWidth || vUvs.y < yLineWidth || vUvs.y > 1.0 - yLineWidth) {
            gl_FragColor = vec4(lineColor, 1.0);
            return;
        }
        
        gl_FragColor = vec4(vUvs, 1.0, 0.2);
    }
`

type BoxWithEdgeOutlineProps = {
    size: Vector3Tuple
}

const BoxWithEdgeOutline = ({ size }: BoxWithEdgeOutlineProps) => {
    return (
        <mesh>
            <shaderMaterial
                transparent
                depthTest={false}
                side={DoubleSide}
                uniforms={{
                    uBoxSize: { value: size },
                }}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
            />
            <boxGeometry args={size} />
        </mesh>
    )
}

export default function Sketch() {
    return (
        <Canvas>
            <Bounds fit observe margin={1.5}>
                <BoxWithEdgeOutline size={[2, 3, 4]} />
            </Bounds>

            <ambientLight />

            <OrbitControls makeDefault />
            <PerspectiveCamera makeDefault position={[5, 3, 5]} />
        </Canvas>
    )
}
