import { Canvas } from '@/common'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import * as THREE from 'three'

const niceColors = ['hotpink', 'orange', 'lightblue', 'lightgreen', 'purple']

const _cameraPosition = new THREE.Vector3()

const TorusKnot = () => {
    const [mesh, setMesh] = useState<THREE.Mesh>()

    useEffect(() => {
        const material = new THREE.MeshStandardMaterial({
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            vertexColors: true,
        })

        const geometry = new THREE.TorusKnotGeometry(3, 0.4, 100, 16)

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

        const mesh = new THREE.Mesh(geometry, material)

        setMesh(mesh)
    }, [])

    useFrame(({ camera }) => {
        if (!mesh) return

        // sort mesh faces by distance to camera

        const cameraPosition = camera.getWorldPosition(_cameraPosition)

        const faces = mesh!.geometry.index!.array

        const facePositions = mesh!.geometry.attributes.position.array

        const faceDistances: number[] = []

        const a = new THREE.Vector3()
        const b = new THREE.Vector3()
        const c = new THREE.Vector3()

        for (let i = 0; i < faces.length; i += 3) {
            a.set(facePositions[faces[i] * 3], facePositions[faces[i] * 3 + 1], facePositions[faces[i] * 3 + 2])

            b.set(facePositions[faces[i + 1] * 3], facePositions[faces[i + 1] * 3 + 1], facePositions[faces[i + 1] * 3 + 2])

            c.set(facePositions[faces[i + 2] * 3], facePositions[faces[i + 2] * 3 + 1], facePositions[faces[i + 2] * 3 + 2])

            const distance = Math.min(a.distanceTo(cameraPosition), b.distanceTo(cameraPosition), c.distanceTo(cameraPosition))

            
        }
    })

    return mesh && <primitive object={mesh} />
}

export default function Sketch() {
    return (
        <Canvas>
            <TorusKnot />

            <ambientLight intensity={1.5} />
            <pointLight position={[10, 10, 10]} intensity={1.5} />

            <PerspectiveCamera makeDefault position={[25, 5, 25]} />
            <OrbitControls makeDefault />
        </Canvas>
    )
}
