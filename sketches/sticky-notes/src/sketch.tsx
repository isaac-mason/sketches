import { Canvas } from '@react-three/fiber'
import { DragControls, Html, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { ThreeElements, useFrame, useThree } from '@react-three/fiber'
import { useDrag } from '@use-gesture/react'
import { useRef, useState } from 'react'
import styled from 'styled-components'
import * as THREE from 'three'
import catImageUrl from './images/pexels-bekka-mongeau-804475.jpg?url&w=300&format=webp&imagetools'
import treeImageUrl from './images/pexels-johannes-plenio-1632790.jpg?url&w=300&format=webp&imagetools'

const Card = styled.div`
    width: 300px;
    background-color: white;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
    border-radius: 10px;
    display: flex;
    justify-content: center;
    align-items: center;
    touch-action: none;

    img {
        width: 100%;
        border-radius: 10px;
        pointer-events: none;
    }

    p {
        margin: 0;
        padding: 1em;
        width: 100%;
    }
`

type DraggableHtmlProps = {
    children?: React.ReactNode
} & ThreeElements['group']

const _domSize = new THREE.Vector2()
const _domPointer = new THREE.Vector2()
const _normalizedPointer = new THREE.Vector2()
const _ray = new THREE.Ray()
const _worldPosition = new THREE.Vector3()

const DraggableHtml = ({ children, ...groupProps }: DraggableHtmlProps) => {
    const controls = useThree((state) => state.controls)
    const gl = useThree((state) => state.gl)
    const camera = useThree((state) => state.camera)

    const groupRef = useRef<THREE.Group>(null!)

    const dragging = useRef(false)
    const dragOffset = useRef<THREE.Vector2>(new THREE.Vector2())

    const bind = useDrag(({ event, down, xy, movement }) => {
        if (!down) {
            dragging.current = false

            if (controls && 'enabled' in controls) {
                controls.enabled = true
            }

            return
        }

        if (controls && 'enabled' in controls) {
            controls.enabled = false
        }

        const domSize = _domSize.set(gl.domElement.clientWidth, gl.domElement.clientHeight)
        const domPointer = _domPointer.set(...xy)
        const glRect = gl.domElement.getBoundingClientRect()

        if (!dragging.current) {
            const targetRect = (event.target as HTMLElement).getBoundingClientRect()
            dragOffset.current.set(
                domPointer.x - targetRect.left - targetRect.width / 2,
                domPointer.y - targetRect.top - targetRect.height / 2,
            )
            dragging.current = true
        }

        if (movement[0] === 0 && movement[1] === 0) {
            return
        }

        domPointer.x -= glRect.left
        domPointer.y -= glRect.top

        domPointer.sub(dragOffset.current)

        const normalizedPointer = _normalizedPointer.copy(domPointer).divide(domSize).multiplyScalar(2).subScalar(1)
        normalizedPointer.y *= -1

        const ray = _ray
        ray.origin.setFromMatrixPosition(camera.matrixWorld)
        ray.direction.set(normalizedPointer.x, normalizedPointer.y, 0.5).unproject(camera).sub(ray.origin).normalize()

        const distance = -ray.origin.z / ray.direction.z - groupRef.current.position.z
        const position = _worldPosition.copy(ray.origin).add(ray.direction.multiplyScalar(distance))

        groupRef.current.position.x = position.x
        groupRef.current.position.y = position.y
    })

    return (
        <group {...groupProps} ref={groupRef}>
            <Html center transform>
                <Card {...bind()}>{children}</Card>
            </Html>
        </group>
    )
}

type ImageProps = {
    src: string
} & ThreeElements['group']

const Image = ({ src, ...groupProps }: ImageProps) => {
    return (
        <DraggableHtml {...groupProps}>
            <img src={src} />
        </DraggableHtml>
    )
}

type NoteProps = {
    text: string
} & ThreeElements['group']

const Note = ({ text, ...groupProps }: NoteProps) => {
    const [content, setContent] = useState(text)

    return (
        <DraggableHtml {...groupProps}>
            <p contentEditable suppressContentEditableWarning onBlur={(e) => setContent(e.currentTarget.textContent as string)}>
                {content}
            </p>
        </DraggableHtml>
    )
}

const SpinningCube = (props: ThreeElements['mesh']) => {
    const ref = useRef<THREE.Mesh>(null!)
    const [hovered, setHovered] = useState(false)
    const [flip, setFlip] = useState(false)

    let color = 'orange'
    if (hovered) color = 'hotpink'

    useFrame((_, delta) => {
        const t = 1 - Math.pow(0.01, delta)
        ref.current.rotation.x += 0.5 * t
        ref.current.rotation.y += 0.5 * t
    })

    return (
        <mesh
            {...props}
            ref={ref}
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
            onClick={() => setFlip(!flip)}
            scale={flip ? 1.2 : 1}
        >
            <boxGeometry args={[2, 2, 2]} />
            <meshStandardMaterial color={color} />
        </mesh>
    )
}

const noteOne =
    "All the world's a stage, and all the men and women merely players. They have their exits and their entrances; And one man in his time plays many parts."

const noteTwo = 'Be not afraid of greatness: some are born great, some achieve greatness and some have greatness thrust upon them'

export function Sketch() {
    return (
        <Canvas>
            <Note text={noteOne} />
            <Note text={noteTwo} position={[6, -5, 0]} />

            <Image src={catImageUrl} position={[5, 0, -3]} />
            <Image src={treeImageUrl} position={[-5, -3, -4]} />

            <DragControls>
                <SpinningCube position={[-4, 4, 0]}>
                    <mesh>
                        <boxGeometry args={[1, 1, 1]} />
                        <meshBasicMaterial color="hotpink" />
                    </mesh>
                </SpinningCube>
            </DragControls>

            <ambientLight intensity={1.5} />
            <directionalLight position={[0, 0, 5]} intensity={1.5} />

            <OrbitControls
                makeDefault
                screenSpacePanning
                mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: undefined, RIGHT: undefined }}
                touches={{ ONE: THREE.TOUCH.PAN, TWO: undefined }}
                enableZoom={false}
            />

            <PerspectiveCamera makeDefault position={[0, 0, 25]} />
        </Canvas>
    )
}
