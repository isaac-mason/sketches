import { useGLTF } from '@react-three/drei'
import { ObjectMap, ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTF } from 'three-stdlib'
import duckGltf from './duck.gltf?url'

type GLTFResult = GLTF & ObjectMap & {
        nodes: {
            character_duck: THREE.Mesh
            character_duckArmLeft: THREE.Mesh
            character_duckArmRight: THREE.Mesh
            Cube1338: THREE.Mesh
            Cube1338_1: THREE.Mesh
            Cube1338_2: THREE.Mesh
        }
        materials: {
            ['White.026']: THREE.MeshStandardMaterial
            ['Yellow.043']: THREE.MeshStandardMaterial
            ['Black.027']: THREE.MeshStandardMaterial
        }
    }

export const Duck = (props: ThreeElements['group']) => {
    const { nodes, materials } = useGLTF(duckGltf) as GLTFResult

    return (
        <group {...props} dispose={null} position={[0, -0.8, 0]}>
            <mesh
                castShadow
                receiveShadow
                geometry={nodes.character_duck.geometry}
                material={materials['White.026']}
                rotation={[Math.PI / 2, 0, 0]}
            >
                <mesh
                    castShadow
                    receiveShadow
                    geometry={nodes.character_duckArmLeft.geometry}
                    material={materials['White.026']}
                    position={[0.204, 0, -0.634]}
                />
                <mesh
                    castShadow
                    receiveShadow
                    geometry={nodes.character_duckArmRight.geometry}
                    material={materials['White.026']}
                    position={[-0.204, 0, -0.634]}
                />
                <group position={[0, 0, -0.704]}>
                    <mesh castShadow receiveShadow geometry={nodes.Cube1338.geometry} material={materials['White.026']} />
                    <mesh castShadow receiveShadow geometry={nodes.Cube1338_1.geometry} material={materials['Yellow.043']} />
                    <mesh castShadow receiveShadow geometry={nodes.Cube1338_2.geometry} material={materials['Black.027']} />
                </group>
            </mesh>
        </group>
    )
}

useGLTF.preload(duckGltf)
