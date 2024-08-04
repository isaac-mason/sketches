import { Grid, OrbitControls, useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { Mesh, NearestFilter } from 'three'
import { Canvas } from '@/common'
import playerUrl from './sprite.png'

const Sprite = () => {
    const map = useTexture(playerUrl)

    const camera = useThree((s) => s.camera)
    const ref = useRef<Mesh>(null!)

    useFrame(() => {
        const angle = Math.atan2(camera.position.x - ref.current.position.x, camera.position.z - ref.current.position.z)

        ref.current.rotation.y = angle
    })

    return (
        <mesh position-y={0.5} ref={ref}>
            <meshBasicMaterial map={map} map-magFilter={NearestFilter} transparent />
            <planeGeometry args={[1, 1, 1]} />
        </mesh>
    )
}

const Ground = () => (
    <>
        <mesh rotation-x={-Math.PI / 2}>
            <meshBasicMaterial color="#999" />
            <planeGeometry args={[10, 10]} />
        </mesh>

        <Grid args={[10, 10]} position-y={0.001} sectionColor="#333" cellThickness={1} cellColor="#333" />
    </>
)

export function Sketch() {
    return (
        <Canvas camera={{ position: [2, 2, 2] }}>
            <Sprite />

            <Ground />

            <OrbitControls target={[0, 0.5, 0]} makeDefault autoRotate autoRotateSpeed={-0.5} />
        </Canvas>
    )
}
