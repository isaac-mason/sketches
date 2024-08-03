import { Addition, Base, Geometry } from '@react-three/csg'
import { RigidBody, RigidBodyProps } from '@react-three/rapier'

export const TrafficCone = (props: RigidBodyProps) => {
    return (
        <RigidBody {...props} colliders="hull">
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
    )
}
