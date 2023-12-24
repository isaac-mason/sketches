import { Addition, Base, Geometry } from '@react-three/csg'
import { RigidBody } from '@react-three/rapier'

export const TrafficCone = (props: JSX.IntrinsicElements['group']) => {
    return (
        <group {...props}>
            <RigidBody colliders="hull" position-y={0.5}>
                <mesh castShadow receiveShadow>
                    <Geometry useGroups>
                        <Base position-y={-0.5}>
                            <boxGeometry args={[0.8, 0.1, 0.8]} />
                            <meshStandardMaterial color="orange" />
                        </Base>
                        <Addition position-y={0}>
                            <cylinderGeometry args={[0.1, 0.3, 1, 32]} />
                            <meshStandardMaterial color="orange" />
                        </Addition>
                        <Addition position-y={-0.1}>
                            <cylinderGeometry args={[0.215, 0.235, 0.1, 32]} />
                            <meshStandardMaterial color="white" />
                        </Addition>
                    </Geometry>
                </mesh>
            </RigidBody>
        </group>
    )
}
