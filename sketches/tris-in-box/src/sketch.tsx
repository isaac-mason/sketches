import { Canvas } from '@/common'
import cityEnvironment from '@pmndrs/assets/hdri/city.exr'
import { Environment, MapControls, PerspectiveCamera, PivotControls, useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getPositionsAndIndices } from 'recast-navigation/three'
import * as THREE from 'three'
import navTestGlbUrl from './nav-test.glb?url'

export const getTrianglesInBox = (positions: ArrayLike<number>, indices: ArrayLike<number>, box: THREE.Box3): number[] => {
    const triangles: number[] = []

    const v0 = new THREE.Vector3()
    const v1 = new THREE.Vector3()
    const v2 = new THREE.Vector3()
    const triangle = new THREE.Triangle()

    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i]
        const b = indices[i + 1]
        const c = indices[i + 2]

        v0.fromArray(positions, a * 3)
        v1.fromArray(positions, b * 3)
        v2.fromArray(positions, c * 3)

        triangle.set(v0, v1, v2)

        if (triangle.intersectsBox(box)) {
            triangles.push(a, b, c)
        }
    }

    return triangles
}

const Slice = () => {
    const { nodes } = useGLTF(navTestGlbUrl)
    const mesh = useMemo(() => {
        const m = nodes.Cube as THREE.Mesh
        m.geometry.computeVertexNormals()

        return m
    }, [])

    const pivotControlsRef = useRef<THREE.Group>(null!)

    const [geom, setGeom] = useState<THREE.BufferGeometry>()
    const [box3, setBox3] = useState<THREE.Box3>()

    const updateSlice = () => {
        const center = new THREE.Vector3()
        center.setFromMatrixPosition(pivotControlsRef.current.matrixWorld)

        const box3 = new THREE.Box3(new THREE.Vector3(-2, -5, -2), new THREE.Vector3(2, 5, 2))

        box3.translate(center)

        const [positions, indices] = getPositionsAndIndices([mesh])

        const triangles = getTrianglesInBox(positions, indices, box3)

        const geom = new THREE.BufferGeometry()
        geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
        geom.setIndex(new THREE.BufferAttribute(new Uint32Array(triangles), 1))
        geom.computeVertexNormals()

        setGeom(geom)
        setBox3(box3)
    }

    useEffect(() => {
        updateSlice()
    }, [nodes])

    return (
        <>
            <primitive object={mesh}>
                <meshStandardMaterial color="#ccc" />
            </primitive>

            <PivotControls
                activeAxes={[true, false, true]}
                disableRotations
                scale={3}
                ref={pivotControlsRef}
                offset={[0, 5, 0]}
                onDrag={updateSlice}
            />

            <mesh geometry={geom}>
                <meshStandardMaterial color="orange" />
            </mesh>

            {box3 && (
                <box3Helper args={[box3]}>
                    <meshBasicMaterial color="red" />
                </box3Helper>
            )}
        </>
    )
}

export function Sketch() {
    return (
        <Canvas>
            <Slice />

            <Environment files={cityEnvironment} />

            <MapControls makeDefault />
            <PerspectiveCamera makeDefault position={[0, 20, 5]} />
        </Canvas>
    )
}
