import { useButtonGroupControls } from '@sketches/common'
import { Canvas } from '@react-three/fiber'
import { CameraShake, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { ThreeElements, useFrame } from '@react-three/fiber'
import { Leva } from 'leva'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

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

const createTorusKnotGeometry = () => {
    return new THREE.TorusKnotGeometry(0.3, 0.05, 100, 16)
}

const TorusKnotZFighting = (props: ThreeElements['group']) => {
    const geometry = useMemo(() => createTorusKnotGeometry(), [])

    return (
        <group {...props}>
            <mesh position={[0, 0, 0]}>
                <primitive attach="geometry" object={geometry} />
                <meshBasicMaterial color="red" />
            </mesh>
            <mesh position={[0.001, 0, 0]}>
                <primitive attach="geometry" object={geometry} />
                <meshBasicMaterial color="blue" transparent opacity={0.5} />
            </mesh>
        </group>
    )
}

const TorusKnotScale = (props: ThreeElements['group']) => {
    const geometry = useMemo(() => createTorusKnotGeometry(), [])

    return (
        <group {...props}>
            <mesh position={[0, 0, 0]}>
                <primitive attach="geometry" object={geometry} />
                <meshBasicMaterial color="red" />
            </mesh>
            <mesh position={[0, 0, 0]} scale={[1.01, 1.01, 1.01]}>
                <primitive attach="geometry" object={geometry} />
                <meshBasicMaterial color="blue" transparent opacity={0.5} />
            </mesh>
        </group>
    )
}

const _vector3 = new THREE.Vector3()

function getMergedGeometry(geometry: THREE.BufferGeometry, tolerance: number): THREE.BufferGeometry {
    const positionAttribute = geometry.attributes.position as THREE.BufferAttribute

    if (!positionAttribute || positionAttribute.itemSize !== 3) {
        throw new Error('Invalid geometry: position attribute missing or incorrect itemSize')
    }

    let index: ArrayLike<number> | undefined = geometry.getIndex()?.array

    if (!index) {
        // this will become indexed when merging with other meshes
        const ascendingIndex: number[] = []
        for (let i = 0; i < positionAttribute.count; i++) {
            ascendingIndex.push(i)
        }

        geometry.setIndex(ascendingIndex)
        index = ascendingIndex
    }

    const mergedPositions: number[] = []
    const mergedIndices: number[] = []

    const positionToIndex: { [hash: string]: number } = {}
    let indexCounter = 0

    const positions = positionAttribute.array

    for (let i = 0; i < index.length; i++) {
        const pt = index[i] * 3

        const pos = _vector3.set(positions[pt], positions[pt + 1], positions[pt + 2])

        // round pos to tolerance
        pos.x = Math.round(pos.x / tolerance) * tolerance
        pos.y = Math.round(pos.y / tolerance) * tolerance
        pos.z = Math.round(pos.z / tolerance) * tolerance

        const key = `${pos.x}_${pos.y}_${pos.z}`

        let idx = positionToIndex[key]

        if (idx === undefined) {
            positionToIndex[key] = idx = indexCounter
            mergedPositions.push(pos.x, pos.y, pos.z)
            indexCounter++
        }

        mergedIndices.push(idx)
    }

    const mergedGeometry = new THREE.BufferGeometry()
    mergedGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mergedPositions), 3))
    mergedGeometry.setIndex(mergedIndices)

    mergedGeometry.computeVertexNormals()

    return mergedGeometry
}

function scaleIndexedGeometryAlongNormals(geometry: THREE.BufferGeometry, scaleFactor: number) {
    const positions = geometry.getAttribute('position')
    const normals = geometry.getAttribute('normal')

    const scaledPositions = new Float32Array(positions.count * 3)

    for (let i = 0; i < positions.count; i++) {
        const vertexNormal = new THREE.Vector3().fromBufferAttribute(normals, i).normalize()

        scaledPositions[i * 3] = positions.array[i * 3] + vertexNormal.x * scaleFactor
        scaledPositions[i * 3 + 1] = positions.array[i * 3 + 1] + vertexNormal.y * scaleFactor
        scaledPositions[i * 3 + 2] = positions.array[i * 3 + 2] + vertexNormal.z * scaleFactor
    }

    const scaledGeometry = new THREE.BufferGeometry()
    scaledGeometry.setAttribute('position', new THREE.Float32BufferAttribute(scaledPositions, 3))
    scaledGeometry.setIndex(geometry.index) // Copy original indices

    // just for visualization
    scaledGeometry.computeVertexNormals()

    return scaledGeometry
}

const TorusKnotScaleByNormals = (props: ThreeElements['group']) => {
    const geometry = useMemo(() => createTorusKnotGeometry(), [])

    const mergedGeometry = useMemo(() => {
        return getMergedGeometry(geometry, 0.001)
    }, [])

    const scaledByNormalsBoxGeometry = useMemo(() => {
        return scaleIndexedGeometryAlongNormals(mergedGeometry, 0.01)
    }, [mergedGeometry])

    return (
        <group {...props}>
            <mesh position={[0, 0, 0]}>
                <primitive attach="geometry" object={geometry} />
                <meshBasicMaterial color="red" />
            </mesh>
            <mesh position={[0, 0, 0]}>
                <primitive attach="geometry" object={scaledByNormalsBoxGeometry} />
                <meshBasicMaterial color="blue" transparent opacity={0.5} />
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
    TORUS_KNOT_Z_FIGHTING: 'torus knot z-fighting',
    TORUS_KNOT_SCALE: 'torus knot scale fix',
    TORUS_KNOT_SCALE_BY_NORMALS: 'torus knot scale by normals fix',
}

export function Sketch() {
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

                {scene === Scenes.TORUS_KNOT_Z_FIGHTING && <TorusKnotZFighting />}
                {scene === Scenes.TORUS_KNOT_SCALE && <TorusKnotScale />}
                {scene === Scenes.TORUS_KNOT_SCALE_BY_NORMALS && <TorusKnotScaleByNormals />}

                <CameraShake maxPitch={0.01} maxRoll={0.01} maxYaw={0.01} />
                <PerspectiveCamera makeDefault near={0.1} far={100} position={[-0.1, 4, 2]} />
                <OrbitControls makeDefault />
            </Canvas>

            <Leva collapsed={false} />
        </>
    )
}
