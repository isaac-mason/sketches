import { OrbitControls } from '@react-three/drei'
import { Box, Flex } from '@react-three/flex'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Canvas } from '../../../common'

const padding = 1
const color = '#ff8888'

const Item = ({ children }: { children: JSX.Element }) => (
    <Box padding={padding} centerAnchor>
        <mesh>
            <meshStandardMaterial color={color} wireframe />
            {children}
        </mesh>
    </Box>
)

const App = () => (
    <>
        <directionalLight intensity={1.5} position={[-3, 0, 5]} />
        <ambientLight intensity={1.5} />
        <Flex width={6} height={6} centerAnchor flexDirection="row" flexWrap="wrap">
            <Item>
                <sphereGeometry args={[0.6]} />
            </Item>
            <Item>
                <boxGeometry args={[1, 1, 1]} />
            </Item>
            <Item>
                <coneGeometry args={[0.7, 1, 5, 5]} />
            </Item>
            <Item>
                <torusKnotGeometry args={[0.4, 0.1]} />
            </Item>
            <Item>
                <ringGeometry args={[0.3, 0.7]} />
            </Item>
            <Item>
                <dodecahedronGeometry args={[0.7]} />
            </Item>
            <Item>
                <octahedronGeometry args={[0.7]} />
            </Item>
            <Item>
                <tetrahedronGeometry args={[0.7]} />
            </Item>
            <Item>
                <icosahedronGeometry args={[0.7]} />
            </Item>
        </Flex>
    </>
)

export default () => (
    <>
        <Canvas camera={{ position: [0, 0, 10], fov: 60 }} gl={{ outputEncoding: THREE.sRGBEncoding }}>
            <App />
            <OrbitControls />
        </Canvas>
    </>
)
