import { useGLTF } from '@react-three/drei'
import { RigidBody, RigidBodyProps } from '@react-three/rapier'
import { GLTF } from 'three-stdlib'
import loopGlb from './loop.glb?url'

export type LoopGLTF = GLTF & {
    nodes: {
        Cylinder: THREE.Mesh
    }
    materials: {}
}

export const Loop = (props: RigidBodyProps) => {
    const { nodes } = useGLTF(loopGlb) as LoopGLTF
    return (
        <RigidBody {...props} type="fixed" colliders="trimesh">
            <mesh
                castShadow
                receiveShadow
                geometry={nodes.Cylinder.geometry}
                position={[0, 9.85, 0]}
                rotation={[0, 0, -Math.PI / 2]}
                scale={9.84}
                dispose={null}
            >
                <meshStandardMaterial color="gold" />
            </mesh>
        </RigidBody>
    )
}

useGLTF.preload(loopGlb)
