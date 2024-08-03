import { PerspectiveCamera, useGLTF } from '@react-three/drei'
import { ThreeElements, useFrame, useLoader } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Instructions, InteractionBarrier, WebGPUCanvas, useConst } from '@/common'
import { ThirdPersonController, useThirdPersonController } from '@/common/controllers/third-person-controller'
import elevatorMusicUrl from './elevator-music.mp3?url'
import speakerGlb from './speaker.glb?url'

// elevator-music.mp3
// Music by: https://www.bensound.com/free-music-for-videos
// License code: FWBROUCN83WFOWSP

const Speaker = (props: ThreeElements['group']) => {
    const { scene } = useGLTF(speakerGlb)
    const buffer = useLoader(THREE.AudioLoader, elevatorMusicUrl)

    const positionalAudioRef = useRef<THREE.PositionalAudio>(null!)
    const audioListener = useConst(() => new THREE.AudioListener())
    const audioListenerGroupRef = useRef<THREE.Group>(null!)

    const { getPlayerPosition } = useThirdPersonController()

    useEffect(() => {
        const positionalAudio = positionalAudioRef.current
        if (!positionalAudio) return

        positionalAudio.setBuffer(buffer)
        positionalAudio.setLoop(true)

        if (!positionalAudio.isPlaying) positionalAudio.play()

        return () => {
            positionalAudio.stop()
            positionalAudio.disconnect()
        }
    }, [buffer])

    useFrame(() => {
        const playerPosition = getPlayerPosition()
        if (!playerPosition) return

        const distance = playerPosition.distanceTo(positionalAudioRef.current.position)
        const audioRadius = 5

        if (distance < audioRadius) {
            const volume = 1 - distance / audioRadius

            positionalAudioRef.current.setVolume(volume)
        } else {
            positionalAudioRef.current.setVolume(0)
        }
    })

    return (
        <>
            <group {...props}>
                <positionalAudio ref={positionalAudioRef} autoplay loop args={[audioListener]} />
                <primitive object={scene} />
            </group>

            <group ref={audioListenerGroupRef}>
                <primitive object={audioListener} />
            </group>
        </>
    )
}

const Ground = () => (
    <mesh position-y={-1}>
        <boxGeometry args={[100, 1, 100]} />
        <meshStandardMaterial color="#555" />
    </mesh>
)

export default function Sketch() {
    return (
        <>
            <InteractionBarrier>
                <WebGPUCanvas>
                    <Speaker position-y={0.5} />

                    <Ground />

                    <ambientLight intensity={1.75} />

                    <ThirdPersonController position={[-4, 0, 0]} />
                    <PerspectiveCamera makeDefault position={[-10, 1, 0]} />
                </WebGPUCanvas>

                <Instructions>* wasd to move</Instructions>
            </InteractionBarrier>
        </>
    )
}
