import { useGLTF } from '@react-three/drei'
import { forwardRef } from 'react'
import { Mesh, MeshStandardMaterial, Group } from 'three'
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader'
import wheelGlbUrl from '../assets/wheel-draco.glb?url'

type WheelGLTF = GLTF & {
    nodes: {
        /* Manually typed meshes names */
        Mesh_14: Mesh
        Mesh_14_1: Mesh
    }
    materials: {
        /* Manually typed meshes names */
        'Material.002': MeshStandardMaterial
        'Material.009': MeshStandardMaterial
    }
}

type WheelProps = JSX.IntrinsicElements['group'] & {
    side: 'left' | 'right'
    radius: number
}

export const Wheel = forwardRef<Group, WheelProps>(
    ({ side, radius, ...props }, ref) => {
        const { nodes, materials } = useGLTF(wheelGlbUrl) as WheelGLTF
        const scale = radius / 0.34

        return (
            <group dispose={null} {...props}>
                <group scale={scale}>
                    <group
                        scale={side === 'left' ? -1 : 1}
                    >
                        <mesh
                            castShadow
                            geometry={nodes.Mesh_14.geometry}
                            material={materials['Material.002']}
                        />
                        <mesh
                            castShadow
                            geometry={nodes.Mesh_14_1.geometry}
                            material={materials['Material.009']}
                        />
                    </group>
                </group>
            </group>
        )
    }
)
