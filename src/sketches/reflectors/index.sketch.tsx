import bunnyUrl from '@pmndrs/assets/models/bunny.glb'
import { useGLTF } from '@react-three/drei'
import { ThreeElements, useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import { useMemo } from 'react'
import * as THREE from 'three'
import { MeshStandardNodeMaterial, reflector } from 'three/examples/jsm/nodes/Nodes.js'
import { WebGPUCanvas } from '../../common'

const Mirror = (props: ThreeElements['group'] & { size: THREE.Vector2Tuple }) => {
    const mirror = useMemo(() => {
        const geometry = new THREE.PlaneGeometry(...props.size)

        const reflection = reflector({ resolution: 1 })

        const mirrorMaterial = new MeshStandardNodeMaterial()

        mirrorMaterial.colorNode = reflection

        const mesh = new THREE.Mesh(geometry, mirrorMaterial)

        mesh.add(reflection.target)

        return mesh
    }, [])

    return (
        <group {...props}>
            <primitive object={mirror} />
        </group>
    )
}

const Suzi = (props: ThreeElements['mesh']) => {
    const { nodes } = useGLTF(bunnyUrl)

    return (
        <mesh position-y={-0.25} scale={0.3} geometry={(nodes.mesh as THREE.Mesh).geometry} {...props}>
            <meshStandardMaterial color="orange" roughness={0.6} metalness={0.05} />
        </mesh>
    )
}

const CameraRig = () => {
    useFrame((state, delta) => {
        easing.damp3(
            state.camera.position,
            [0.7 + (state.pointer.x * state.viewport.width) / 4, (0.3 + state.pointer.y) / 3, 2],
            0.5,
            delta,
        )
        state.camera.lookAt(0, 0, 0)
    })

    return null
}

export default function Sketch() {
    return (
        <>
            <WebGPUCanvas camera={{ position: [1, 0.2, 1.5] }}>
                <Suzi />

                <mesh position={[0, -0.5, 0]} rotation-x={-Math.PI / 2}>
                    <circleGeometry args={[10]} />
                    <meshStandardMaterial color="#333" />
                </mesh>

                <Mirror size={[3, 2]} position={[0, 0.5, 1]} rotation-y={Math.PI} />
                <Mirror size={[3, 2]} position={[0, 0.5, 2]} rotation-y={Math.PI} />
                <Mirror size={[3, 2]} position={[0, 0.5, -1]} />
                <Mirror size={[3, 2]} position={[0, 0.5, -2]} />

                <ambientLight intensity={1.5} />
                <pointLight position={[-1, 5, -1]} intensity={30} />

                <color attach="background" args={['#ccc']} />

                <CameraRig />
            </WebGPUCanvas>
        </>
    )
}
