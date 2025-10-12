import { Canvas } from '@react-three/fiber'
import cityEnvironment from './city.hdr?url'
import { Environment, MapControls, PerspectiveCamera, PivotControls, useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BufferAttribute, Mesh, Vector3 } from 'three'
import navTestGlbUrl from './nav-test.glb?url'

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

const Slice = () => {
    const { nodes } = useGLTF(navTestGlbUrl)

    const mesh = useMemo(() => {
        const m = nodes.Cube as THREE.Mesh
        // m.geometry.computeVertexNormals()

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

const _position = new Vector3()

function getTrianglesInBox(positions: ArrayLike<number>, indices: ArrayLike<number>, box: THREE.Box3): number[] {
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

function mergePositionsAndIndices(
    meshes: Array<{
        positions: ArrayLike<number>
        indices: ArrayLike<number>
    }>,
): [Float32Array, Uint32Array] {
    const mergedPositions: number[] = []
    const mergedIndices: number[] = []

    const positionToIndex: { [hash: string]: number } = {}
    let indexCounter = 0

    for (const { positions, indices } of meshes) {
        for (let i = 0; i < indices.length; i++) {
            const pt = indices[i] * 3

            const x = positions[pt]
            const y = positions[pt + 1]
            const z = positions[pt + 2]

            const key = `${x}_${y}_${z}`
            let idx = positionToIndex[key]

            if (!idx) {
                positionToIndex[key] = idx = indexCounter
                mergedPositions.push(x, y, z)
                indexCounter++
            }

            mergedIndices.push(idx)
        }
    }

    return [Float32Array.from(mergedPositions), Uint32Array.from(mergedIndices)]
}

function getPositionsAndIndices(meshes: Mesh[]): [positions: Float32Array, indices: Uint32Array] {
    const toMerge: {
        positions: ArrayLike<number>
        indices: ArrayLike<number>
    }[] = []

    for (const mesh of meshes) {
        const positionAttribute = mesh.geometry.attributes.position as BufferAttribute

        if (!positionAttribute || positionAttribute.itemSize !== 3) {
            continue
        }

        mesh.updateMatrixWorld()

        const positions = new Float32Array(positionAttribute.array)

        for (let i = 0; i < positions.length; i += 3) {
            const pos = _position.set(positions[i], positions[i + 1], positions[i + 2])
            mesh.localToWorld(pos)
            positions[i] = pos.x
            positions[i + 1] = pos.y
            positions[i + 2] = pos.z
        }

        let indices: ArrayLike<number> | undefined = mesh.geometry.getIndex()?.array

        if (indices === undefined) {
            // this will become indexed when merging with other meshes
            const ascendingIndex: number[] = []
            for (let i = 0; i < positionAttribute.count; i++) {
                ascendingIndex.push(i)
            }
            indices = ascendingIndex
        }

        toMerge.push({
            positions,
            indices,
        })
    }

    return mergePositionsAndIndices(toMerge)
}
