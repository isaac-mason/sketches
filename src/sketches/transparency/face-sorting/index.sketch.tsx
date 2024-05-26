import { Canvas } from '@/common'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

const SKETCH = 'transparency-face-sorting'

const niceColors = ['hotpink', 'orange', 'lightblue', 'lightgreen', 'purple']

const _triangleA = new THREE.Vector3()
const _triangleB = new THREE.Vector3()
const _triangleC = new THREE.Vector3()
const _triangleCenter = new THREE.Vector3()

const sortFacesByCameraDistance = (geometry: THREE.BufferGeometry, camera: THREE.Camera) => {
    const positions = geometry.attributes.position.array
    const indices = geometry.index!.array

    // calculate distance from camera to each face
    const faceDistances: { index: number; distance: number }[] = []
    for (let i = 0; i < indices.length; i += 3) {
        const a = _triangleA.set(positions[indices[i] * 3], positions[indices[i] * 3 + 1], positions[indices[i] * 3 + 2])
        const b = _triangleB.set(
            positions[indices[i + 1] * 3],
            positions[indices[i + 1] * 3 + 1],
            positions[indices[i + 1] * 3 + 2],
        )
        const c = _triangleC.set(
            positions[indices[i + 2] * 3],
            positions[indices[i + 2] * 3 + 1],
            positions[indices[i + 2] * 3 + 2],
        )

        const center = _triangleCenter.addVectors(a, b).add(c).divideScalar(3)
        const distance = camera.position.distanceTo(center)

        faceDistances.push({ index: i, distance })
    }

    // insertion sort
    for (let i = 1; i < faceDistances.length; i++) {
        const current = faceDistances[i]
        let j = i - 1
        while (j >= 0 && faceDistances[j].distance < current.distance) {
            faceDistances[j + 1] = faceDistances[j]
            j--
        }
        faceDistances[j + 1] = current
    }

    // create re-ordered indices
    const sortedIndices = new Uint16Array(indices.length)
    for (let i = 0; i < faceDistances.length; i++) {
        const face = faceDistances[i]
        sortedIndices[i * 3] = indices[face.index]
        sortedIndices[i * 3 + 1] = indices[face.index + 1]
        sortedIndices[i * 3 + 2] = indices[face.index + 2]
    }

    geometry.setIndex(new THREE.BufferAttribute(sortedIndices, 1))
}

type SortFacesProps = {
    children: React.ReactNode
}

const SortFaces = ({ children }: SortFacesProps) => {
    const groupRef = useRef<THREE.Group>(null!)

    const previousCameraPosition = useRef<THREE.Vector3 | null>(null)

    useFrame(({ camera }) => {
        if (!previousCameraPosition.current) {
            previousCameraPosition.current = camera.position.clone()
        } else if (previousCameraPosition.current.distanceTo(camera.position) < 0.2) {
            return
        }

        previousCameraPosition.current.copy(camera.position)

        groupRef.current.children.forEach((child) => {
            if (child instanceof THREE.Mesh) {
                sortFacesByCameraDistance(child.geometry, camera)
            }
        })
    })

    return <group ref={groupRef}>{children}</group>
}

const TransparentTorusKnot = () => {
    const { opacity } = useControls(`${SKETCH}-torus-knot`, {
        opacity: { value: 0.6, min: 0, max: 1 },
    })

    const geometry = useMemo(() => {
        const geometry = new THREE.TorusKnotGeometry(3, 0.6, 100, 16)

        const color = new THREE.Color()
        const numFaces = geometry.index!.count / 3

        const colors = []
        for (let i = 0; i < numFaces; i++) {
            color.set(niceColors[i % niceColors.length])
            colors.push(color.r, color.g, color.b)
            colors.push(color.r, color.g, color.b)
            colors.push(color.r, color.g, color.b)
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

        return geometry
    }, [opacity])

    return (
        <mesh>
            <meshStandardMaterial vertexColors transparent opacity={opacity} depthWrite={false} />
            <primitive object={geometry} />
        </mesh>
    )
}

export default function Sketch() {
    const { sort } = useControls(SKETCH, {
        sort: { value: true },
    })

    return (
        <Canvas>
            {sort ? (
                <SortFaces>
                    <TransparentTorusKnot />
                </SortFaces>
            ) : (
                <TransparentTorusKnot />
            )}

            <ambientLight intensity={1.5} />
            <pointLight position={[10, 10, 10]} intensity={1.5} />

            <PerspectiveCamera makeDefault position={[25, 5, 25]} />
            <OrbitControls makeDefault />
        </Canvas>
    )
}
