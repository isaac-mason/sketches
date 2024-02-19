import { CameraShake, MapControls, PerspectiveCamera } from '@react-three/drei'
import { ThreeElements, useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
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

const PositionAdjustment = (props: ThreeElements['group']) => {
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

const PolygonOffset = (props: ThreeElements['group']) => {
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

const RenderOrder = (props: ThreeElements['group']) => {
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

/**
 * Renders the main scene and overlay scene separately.
 */
const SeparateRenderPasses = () => {
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

const Scenes = {
    Z_FIGHTING: 'z-fighting',
    POSITION_MITIGATION: 'position fix',
    POLYGON_OFFSET: 'polygon offset fix',
    RENDER_ORDER: 'render order fix',
    SEPARATE_RENDER_PASSES: 'separate renders fix',
}

export default function Sketch() {
    const [scene, setScene] = useState(Scenes.Z_FIGHTING)

    useButtonGroupControls('z-fighting-scene', {
        current: scene,
        options: Object.values(Scenes).map((v) => ({ name: v, value: v })),
        onChange: setScene,
    })

    return (
        <>
            <Canvas>
                {scene === Scenes.Z_FIGHTING && <PlanesZFighting />}
                {scene === Scenes.POSITION_MITIGATION && <PositionAdjustment />}
                {scene === Scenes.POLYGON_OFFSET && <PolygonOffset />}
                {scene === Scenes.RENDER_ORDER && <RenderOrder />}
                {scene === Scenes.SEPARATE_RENDER_PASSES && <SeparateRenderPasses />}

                <CameraShake maxPitch={0.01} maxRoll={0.01} maxYaw={0.01} />
                <PerspectiveCamera makeDefault near={0.1} far={100} position={[-0.1, 4, 2]} />
                <MapControls makeDefault />
            </Canvas>
        </>
    )
}
