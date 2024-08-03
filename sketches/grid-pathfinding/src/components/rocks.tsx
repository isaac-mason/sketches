import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { GLTF } from 'three-stdlib'
import rocksGlbUrl from '../assets/rocks.glb?url'

type GLTFResult = GLTF & {
    nodes: {
        rocks: THREE.Mesh
    }
    materials: {
        grey: THREE.MeshStandardMaterial
    }
}

export const Rocks = (props: JSX.IntrinsicElements['group']) => {
    const { nodes, materials } = useGLTF(rocksGlbUrl) as GLTFResult
    return (
        <group {...props} dispose={null}>
            <mesh castShadow receiveShadow geometry={nodes.rocks.geometry} material={materials.grey} />
        </group>
    )
}

useGLTF.preload(rocksGlbUrl)
