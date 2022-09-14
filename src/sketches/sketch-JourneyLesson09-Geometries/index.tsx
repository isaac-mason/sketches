import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Box, Flex } from '@react-three/flex'
import { useRef, useEffect } from 'react'
import * as THREE from 'three'

const padding = 1
const color = '#ff8888'

const Item = ({
    color,
    children,
}: {
    color: string
    children: JSX.Element
}) => (
    <Box padding={padding} centerAnchor>
        <mesh>
            <meshStandardMaterial color={color} wireframe />
            {children}
        </mesh>
    </Box>
)

const App = () => {
    const directionalLight = useRef<THREE.DirectionalLight>(null!)

    useEffect(() => {
        directionalLight.current.lookAt(0, 0, 0)
    }, [])
    
    return (
        <>
            <directionalLight
                ref={directionalLight}
                intensity={0.5}
                position={[-3, 0, 5]}
            />
            <ambientLight intensity={0.5} />
            <Flex
                width={6}
                height={6}
                centerAnchor
                flexDirection="row"
                flexWrap="wrap"
            >
                <Item color={color}>
                    <sphereBufferGeometry args={[0.6]} />
                </Item>
                <Item color={color}>
                    <boxBufferGeometry args={[1, 1, 1]} />
                </Item>
                <Item color={color}>
                    <coneGeometry args={[0.7, 1, 5, 5]} />
                </Item>
                <Item color={color}>
                    <torusKnotBufferGeometry args={[0.4, 0.1]} />
                </Item>
                <Item color={color}>
                    <ringGeometry args={[0.3, 0.7]} />
                </Item>
                <Item color={color}>
                    <dodecahedronBufferGeometry args={[0.7]} />
                </Item>
                <Item color={color}>
                    <octahedronBufferGeometry args={[0.7]} />
                </Item>
                <Item color={color}>
                    <tetrahedronBufferGeometry args={[0.7]} />
                </Item>
                <Item color={color}>
                    <icosahedronBufferGeometry args={[0.7]} />
                </Item>
            </Flex>
        </>
    )
}

export default () => (
    <>
        <h1>Journey 09 - Geometries</h1>
        <Canvas
            camera={{ position: [0, 0, 10], fov: 60 }}
            gl={{ outputEncoding: THREE.sRGBEncoding }}
        >
            <App />
            <OrbitControls />
        </Canvas>
    </>
)
