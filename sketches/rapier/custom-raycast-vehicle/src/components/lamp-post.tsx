import { RigidBody, RigidBodyProps } from '@react-three/rapier'
import { useState } from 'react'
import { Object3D } from 'three'

export const LampPost = (props: RigidBodyProps) => {
    const [target] = useState(() => {
        const object = new Object3D()
        object.position.set(-4, 0, 0)
        return object
    })

    return (
        <RigidBody {...props} colliders="cuboid" type="fixed">
            <mesh position={[0, 5, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.1, 0.1, 10, 32]} />
                <meshStandardMaterial color="#444" />
            </mesh>

            <mesh position={[-0.4, 10, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.2, 0.2, 0.5]} />
                <meshStandardMaterial color="#444" />
            </mesh>

            <mesh position={[-0.6, 9.89, 0]} rotation-x={Math.PI / 2}>
                <planeGeometry args={[0.4, 0.2]} />
                <meshStandardMaterial color="#fff" />
            </mesh>

            <primitive object={target} />
            <spotLight position={[-0.6, 10, 0]} target={target} intensity={150} decay={1.5} angle={1} penumbra={1} castShadow />
        </RigidBody>
    )
}
