import sunsetEnvironment from '@pmndrs/assets/hdri/sunset.exr'
import { Environment, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import {
    ContactForceHandler,
    CuboidCollider,
    IntersectionEnterHandler,
    Physics,
    RapierRigidBody,
    RigidBody,
    RigidBodyProps,
    Vector3Tuple,
} from '@react-three/rapier'
import { useControls } from 'leva'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import * as tone from 'tone'
import { usePageVisible } from '../../common'

type SynthProviderProps = {
    children: React.ReactNode
}

const SynthContext = createContext<tone.PolySynth | null>(null)

const useSynth = () => {
    return useContext(SynthContext)
}

const SynthProvider = ({ children }: SynthProviderProps) => {
    const [synth, setSynth] = useState<tone.PolySynth | null>(null)

    useEffect(() => {
        const reverb = new tone.Reverb(2)

        const synth = new tone.PolySynth(tone.Synth)

        synth.connect(reverb)
        reverb.toDestination()

        setSynth(synth)

        return () => {
            synth.dispose()

            setSynth(null)
        }
    }, [])

    return <SynthContext.Provider value={synth}>{children}</SynthContext.Provider>
}

type NoteProps = {
    note: string
} & RigidBodyProps

const _color = new THREE.Color()

const PRIMARY_COLORS = ['#FFC0CB', '#FFD700', '#FFA07A', '#FF69B4', '#FF6347', '#FF4500', '#FF1493', '#FF00FF']

const Note = ({ note, children, ...rigidBodyProps }: NoteProps) => {
    const synth = useSynth()

    const materialRef = useRef<THREE.MeshStandardMaterial>(null!)

    const onContactForce: ContactForceHandler = (e) => {
        if (e.totalForceMagnitude > 200) {
            if (!synth) return

            synth.triggerAttackRelease(note, 0.1)

            materialRef.current.color.set(PRIMARY_COLORS[Math.floor(Math.random() * PRIMARY_COLORS.length)])
        }
    }

    useFrame((_, delta) => {
        // lerp color to white
        materialRef.current.color.lerp(_color.set('white'), delta / 3)
    })

    return (
        <>
            <RigidBody {...rigidBodyProps} type="fixed" onContactForce={onContactForce}>
                <mesh>
                    {children}

                    <meshStandardMaterial ref={materialRef} />
                </mesh>
            </RigidBody>
        </>
    )
}

type TeleporterProps = {
    destination: Vector3Tuple
    reset?: boolean
} & RigidBodyProps

const Teleporter = ({ destination, reset, ...rigidBodyProps }: TeleporterProps) => {
    const onIntersectionEnter: IntersectionEnterHandler = (e) => {
        const marble = e.other.rigidBody

        if (!marble) return

        marble.setTranslation(
            {
                x: destination[0],
                y: destination[1],
                z: destination[2],
            },
            true,
        )

        if (reset) {
            marble.setLinvel({ x: 0, y: 0, z: 0 }, true)
            marble.setAngvel({ x: 0, y: 0, z: 0 }, true)
        }
    }

    return <RigidBody {...rigidBodyProps} type="fixed" sensor onIntersectionEnter={onIntersectionEnter}></RigidBody>
}

type MarbleProps = RigidBodyProps

const Marble = (props: MarbleProps) => {
    const ref = useRef<RapierRigidBody>(null)

    return (
        <RigidBody {...props} ref={ref} type="dynamic" colliders="ball">
            <mesh>
                <sphereGeometry args={[1, 32, 32]} />
                <meshStandardMaterial color="white" />
            </mesh>
        </RigidBody>
    )
}

export default function Sketch() {
    const { debug } = useControls('note-pillars', {
        debug: false,
    })

    const pageVisible = usePageVisible()

    return (
        <Canvas onPointerDown={() => tone.start()}>
            <Physics debug={debug} paused={!pageVisible} gravity={[0, -20, 0]}>
                <Marble position={[-4, 10, 0]} />

                <SynthProvider>
                    <Note note="C4" position={[-4, 5, 0]} rotation-z={-0.4}>
                        <boxGeometry args={[10, 2, 2]} />
                    </Note>

                    <Note note="E4" position={[5, 3, 0]}>
                        <boxGeometry args={[2, 5, 2]} />
                    </Note>

                    <Note note="G4" position={[4, -3, 0]} rotation-z={0.4}>
                        <boxGeometry args={[10, 2, 2]} />
                    </Note>

                    <Note note="C5" position={[-5, -5, 0]}>
                        <boxGeometry args={[2, 5, 2]} />
                    </Note>
                </SynthProvider>

                <Teleporter position={[-3, -20, 0]} destination={[-4, 10, 0]} reset>
                    <CuboidCollider args={[2, 2, 2]} />
                </Teleporter>
            </Physics>

            <Environment files={sunsetEnvironment} />

            <PerspectiveCamera makeDefault position={[10, 10, 30]} />
            <OrbitControls makeDefault target={[0, 3, 0]} />
        </Canvas>
    )
}
