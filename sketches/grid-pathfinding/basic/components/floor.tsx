import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { GLTF } from 'three-stdlib'
import floorDetailGlbUrl from '../assets/floor-detail.glb?url'

type GLTFResult = GLTF & {
    nodes: {
        ['floor-detail']: THREE.Mesh
    }
    materials: {
        ['grey-light']: THREE.MeshStandardMaterial
    }
}

export const Floor = (props: JSX.IntrinsicElements['group']) => {
    const { nodes, materials } = useGLTF(floorDetailGlbUrl) as GLTFResult
    return (
        <group {...props} dispose={null}>
            <mesh castShadow receiveShadow geometry={nodes['floor-detail'].geometry} material={materials['grey-light']} />
        </group>
    )
}

useGLTF.preload(floorDetailGlbUrl)
