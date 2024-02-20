import { CameraShake, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { ThreeElements, useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import { BoxGeometry, BufferAttribute, BufferGeometry, Vector3 } from 'three'
import { Canvas } from '../../common'
import { useButtonGroupControls } from '../../common/hooks/use-button-group-controls'

const PlanesZFighting = (props: ThreeElements['group']) => {
    return (
        <group {...props}>
            <mesh position={[0.3, 0, 0]} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[1, 1]} />
                <meshBasicMaterial color="red" />
            </mesh>
            <mesh position={[-0.3, 0, 0]} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[1, 1]} />
                <meshBasicMaterial color="green" />
            </mesh>
            <mesh position-y={1}>
                <boxGeometry args={[0.5, 0.5, 0.5]} />
                <meshBasicMaterial color="blue" />
            </mesh>
        </group>
    )
}

const PlanesPositionAdjustment = (props: ThreeElements['group']) => {
    return (
        <group {...props}>
            <mesh position={[0.3, 0, 0]} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[1, 1]} />
                <meshBasicMaterial color="red" />
            </mesh>
            <mesh position={[-0.3, 0, 0]} rotation-x={-Math.PI / 2} position-y={0.01}>
                <planeGeometry args={[1, 1]} />
                <meshBasicMaterial color="green" />
            </mesh>
            <mesh position-y={1}>
                <boxGeometry args={[0.5, 0.5, 0.5]} />
                <meshBasicMaterial color="blue" />
            </mesh>
        </group>
    )
}

const PlanesPolygonOffset = (props: ThreeElements['group']) => {
    return (
        <group {...props}>
            <mesh position={[0.3, 0, 0]} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[1, 1]} />
                <meshBasicMaterial color="red" />
            </mesh>
            <mesh position={[-0.3, 0, 0]} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[1, 1]} />
                <meshBasicMaterial color="green" polygonOffset polygonOffsetUnits={-1} polygonOffsetFactor={-1} />
            </mesh>
            <mesh position-y={1}>
                <boxGeometry args={[0.5, 0.5, 0.5]} />
                <meshBasicMaterial color="blue" />
            </mesh>
        </group>
    )
}

const PlanesRenderOrder = (props: ThreeElements['group']) => {
    return (
        <group {...props}>
            <mesh position={[0.3, 0, 0]} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[1, 1]} />
                <meshBasicMaterial color="red" />
            </mesh>
            <mesh position={[-0.3, 0, 0]} rotation-x={-Math.PI / 2} renderOrder={1}>
                <planeGeometry args={[1, 1]} />
                <meshBasicMaterial color="green" depthTest={false} />
            </mesh>
            <mesh position-y={1}>
                <boxGeometry args={[0.5, 0.5, 0.5]} />
                <meshBasicMaterial color="blue" />
            </mesh>
        </group>
    )
}

const PlanesSeparateRenderPasses = () => {
    const mainScene = useRef<THREE.Scene>(null!)
    const overlayScene = useRef<THREE.Scene>(null!)

    useFrame(({ gl, camera }) => {
        gl.autoClearColor = false
        gl.render(mainScene.current, camera)
        gl.render(overlayScene.current, camera)
    }, 1)

    return (
        <>
            <scene ref={mainScene}>
                <mesh position={[0.3, 0, 0]} rotation-x={-Math.PI / 2}>
                    <planeGeometry args={[1, 1]} />
                    <meshBasicMaterial color="red" />
                </mesh>
                <mesh position-y={1}>
                    <boxGeometry args={[0.5, 0.5, 0.5]} />
                    <meshBasicMaterial color="blue" />
                </mesh>
            </scene>

            <scene ref={overlayScene}>
                <mesh position={[-0.3, 0, 0]} rotation-x={-Math.PI / 2} renderOrder={1}>
                    <planeGeometry args={[1, 1]} />
                    <meshBasicMaterial color="green" />
                </mesh>
            </scene>
        </>
    )
}

const BoxesZFighting = (props: ThreeElements['group']) => {
    return (
        <group {...props}>
            <mesh position={[0.3, 0, 0]} rotation-x={-Math.PI / 2}>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial color="red" />
            </mesh>
            <mesh position={[-0.3, 0, 0]} rotation-x={-Math.PI / 2}>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial color="green" />
            </mesh>
        </group>
    )
}

const BoxesScale = (props: ThreeElements['group']) => {
    return (
        <group {...props}>
            <mesh position={[0.3, 0, 0]} rotation-x={-Math.PI / 2}>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial color="red" />
            </mesh>
            <mesh position={[-0.3, 0, 0]} rotation-x={-Math.PI / 2} scale={[1.001, 1.001, 1.001]}>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial color="green" />
            </mesh>
        </group>
    )
}

const BoxesScaleByNormals = (props: ThreeElements['group']) => {
    const scaledByNormalsBoxGeometry = useMemo(() => {
        const geometry = new BoxGeometry(1, 1, 1).toNonIndexed()

        const positions = geometry.getAttribute('position')
        const scaledPositions = new Float32Array(positions.count * 3)
        const scaleFactor = 0.001

        const vertex = new Vector3()
        const normal = new Vector3()

        for (let i = 0; i < positions.count; i++) {
            vertex.fromBufferAttribute(positions, i)
            normal.fromBufferAttribute(positions, i).normalize()

            const scaledVertex = new Vector3(
                vertex.x + normal.x * scaleFactor,
                vertex.y + normal.y * scaleFactor,
                vertex.z + normal.z * scaleFactor,
            )

            scaledPositions[i * 3] = scaledVertex.x
            scaledPositions[i * 3 + 1] = scaledVertex.y
            scaledPositions[i * 3 + 2] = scaledVertex.z
        }

        const scaledGeometry = new BufferGeometry()
        scaledGeometry.setAttribute('position', new BufferAttribute(scaledPositions, 3))

        return scaledGeometry
    }, [])

    return (
        <group {...props}>
            <mesh position={[0.3, 0, 0]} rotation-x={-Math.PI / 2}>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial color="red" />
            </mesh>
            <mesh position={[-0.3, 0, 0]} rotation-x={-Math.PI / 2}>
                <primitive attach="geometry" object={scaledByNormalsBoxGeometry} />
                <meshBasicMaterial color="green" />
            </mesh>
        </group>
    )
}

const Scenes = {
    PLANES_Z_FIGHTING: 'planes z-fighting',
    PLANES_POSITION: 'planes position fix',
    PLANES_POLYGON_OFFSET: 'planes polygon offset fix',
    PLANES_RENDER_ORDER: 'planes render order fix',
    PLANES_SEPARATE_RENDER_PASSES: 'planes separate renders fix',
    BOXES_Z_FIGHTING: 'boxes z-fighting',
    BOXES_SCALE: 'boxes scale fix',
    BOXES_SCALE_BY_NORMALS: 'boxes scale by normals fix',
}

export default function Sketch() {
    const [scene, setScene] = useState(Scenes.PLANES_Z_FIGHTING)

    useButtonGroupControls('z-fighting-scene', {
        current: scene,
        options: Object.values(Scenes).map((v) => ({ name: v, value: v })),
        onChange: setScene,
    })

    return (
        <>
            <Canvas>
                {scene === Scenes.PLANES_Z_FIGHTING && <PlanesZFighting />}
                {scene === Scenes.PLANES_POSITION && <PlanesPositionAdjustment />}
                {scene === Scenes.PLANES_POLYGON_OFFSET && <PlanesPolygonOffset />}
                {scene === Scenes.PLANES_RENDER_ORDER && <PlanesRenderOrder />}
                {scene === Scenes.PLANES_SEPARATE_RENDER_PASSES && <PlanesSeparateRenderPasses />}

                {scene === Scenes.BOXES_Z_FIGHTING && <BoxesZFighting />}
                {scene === Scenes.BOXES_SCALE && <BoxesScale />}
                {scene === Scenes.BOXES_SCALE_BY_NORMALS && <BoxesScaleByNormals />}

                <CameraShake maxPitch={0.01} maxRoll={0.01} maxYaw={0.01} />
                <PerspectiveCamera makeDefault near={0.1} far={100} position={[-0.1, 4, 2]} />
                <OrbitControls makeDefault />
            </Canvas>
        </>
    )
}
