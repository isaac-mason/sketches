import { Bounds, Edges, Float, MeshPortalMaterial, OrbitControls, Text } from '@react-three/drei'
import { ThreeElements } from '@react-three/fiber'
import { Canvas } from '@/common'

const Label = ({ children }: { children: string }) => (
    <Text color="white" position={[0, -2.6, 0]} fontSize={0.4}>
        {children}
    </Text>
)

const Scene = () => (
    <>
        <Float rotationIntensity={5}>
            <mesh>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color="white" />
            </mesh>
        </Float>
        <mesh rotation={[-(Math.PI / 2), 0, 0]} position={[0, -2, 0]}>
            <planeGeometry args={[6, 6]} />
            <meshStandardMaterial color="white" />
        </mesh>
    </>
)

const Portal = ({ children, ...props }: ThreeElements['group']) => (
    <group {...props}>
        <mesh position-z={-0.01}>
            <planeGeometry args={[4, 4]} />
            <Edges color="white" />
            <MeshPortalMaterial>
                {children}
            </MeshPortalMaterial>
        </mesh>
    </group>
)

const AmbientLight = (props: ThreeElements['group']) => (
    <group {...props}>
        <Portal>
            <Scene />
            <ambientLight color={0xff9999} intensity={1.5} />
        </Portal>
        <Label>ambient light</Label>
    </group>
)

const DirectionalLight = (props: ThreeElements['group']) => (
    <group {...props}>
        <Portal>
            <Scene />
            <ambientLight intensity={0.2} />
            <directionalLight position={[-3, 1, 2]} intensity={0.5} color={0xff9999} />
        </Portal>
        <Label>directional light</Label>
    </group>
)

const HemisphereLight = (props: ThreeElements['group']) => (
    <group {...props}>
        <Portal>
            <Scene />
            <ambientLight intensity={0.2} />
            <hemisphereLight intensity={1.5} color={0xff9999} />
        </Portal>
        <Label>hemisphere light</Label>
    </group>
)

export default () => (
    <>
        <Canvas camera={{ position: [0, 2, 10], fov: 50 }}>
            <Bounds fit observe margin={1}>
                <AmbientLight position-x={0} />
                <DirectionalLight position-x={-4.5} />
                <HemisphereLight position-x={4.5} />
            </Bounds>
            <OrbitControls />
        </Canvas>
    </>
)
