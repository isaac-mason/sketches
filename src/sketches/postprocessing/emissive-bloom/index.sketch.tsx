import { Effects, OrbitControls } from '@react-three/drei'
import { Object3DNode, extend } from '@react-three/fiber'
import { UnrealBloomPass } from 'three/addons'
import { Canvas } from '../../../common'

extend({ UnrealBloomPass })

declare global {
    namespace JSX {
        interface IntrinsicElements {
            unrealBloomPass: Object3DNode<UnrealBloomPass, typeof UnrealBloomPass>
        }
    }
}

const App = () => {
    return (
        <>
            <mesh>
                <meshStandardMaterial color="#ffffff" emissiveIntensity={1.2} />
                <sphereGeometry args={[1]} />
            </mesh>

            <ambientLight intensity={0.7} />
            <directionalLight intensity={2.5} position={[5, 5, 0]} />
        </>
    )
}

export default () => (
    <>
        <Canvas flat gl={{ logarithmicDepthBuffer: true }} camera={{ position: [3, 3, 3] }}>
            <App />

            <color attach="background" args={['#222']} />

            <Effects disableGamma>
                <unrealBloomPass args={[undefined!, 1.2, 0.01, 0.9]} />
            </Effects>

            <OrbitControls />
        </Canvas>
    </>
)
