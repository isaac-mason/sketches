import { RigidBody, type RigidBodyProps } from '@react-three/rapier';

export const TrafficCone = (props: RigidBodyProps) => {
    return (
        <RigidBody {...props} colliders="hull">
            <group>
                <mesh castShadow receiveShadow>
                    <cylinderGeometry args={[0.05, 0.3, 1, 32]} />
                    <meshStandardMaterial color="orange" />
                </mesh>

                <mesh position-y={-0.5} castShadow receiveShadow>
                    <boxGeometry args={[0.8, 0.1, 0.8]} />
                    <meshStandardMaterial color="orange" />
                </mesh>
            </group>
        </RigidBody>
    );
};
