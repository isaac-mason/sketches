import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import navTestGlbUrl from './nav-test.glb?url'

export const Level = () => {
    const { nodes } = useGLTF(navTestGlbUrl)

    const mesh = useMemo(() => {
        const m = nodes.Cube as THREE.Mesh
        m.scale.set(5, 5, 5)

        m.geometry.computeVertexNormals()

        return m
    }, [])

    return (
        <primitive object={mesh}>
            <meshStandardMaterial color="#ccc" />
        </primitive>
    )
}
