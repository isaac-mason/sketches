import { Controllers, Hands, VRButton, XR } from '@react-three/xr'
import { Canvas } from '../../../common'

export default () => (
    <>
        <VRButton />
        <Canvas camera={{ position: [3, 3, 3] }}>
            <XR>
                <mesh>
                    <boxGeometry />
                    <meshBasicMaterial color="blue" />
                </mesh>

                <Controllers />
                <Hands />
            </XR>
        </Canvas>
    </>
)
