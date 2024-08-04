import { Controllers, Hands, VRButton, XR } from '@react-three/xr'
import { Canvas } from '@/common'

export function Sketch() {
    return (
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
}
