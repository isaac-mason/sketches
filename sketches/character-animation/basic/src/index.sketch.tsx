import { Canvas } from '@/common'
import cityEnvironment from '@pmndrs/assets/hdri/city.exr'
import { Environment, OrbitControls, useAnimations, useGLTF } from '@react-three/drei'
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { LoopRepeat } from 'three'
import characterGltfUrl from './guard.glb?url'

const ANIMATION_NAMES = ['Idle', 'Walk', 'Run', 'Attack', 'Dance', 'Death']

const Character = () => {
    const { animations, scene } = useGLTF(characterGltfUrl)
    const { ref, actions, names } = useAnimations(animations)

    const [animationIndex, setAnimationIndex] = useState(0)
    const nextAnimation = () => setAnimationIndex((v) => (v + 1) % ANIMATION_NAMES.length)

    const animationName = ANIMATION_NAMES[animationIndex]

    useEffect(() => {
        const action = actions[animationName]!

        action.loop = LoopRepeat
        action.reset().fadeIn(0.5).play()

        return () => {
            actions[animationName]?.fadeOut(0.5)
        }
    }, [actions, names, animationIndex])

    return <primitive ref={ref} object={scene} onClick={nextAnimation} />
}

function Sketch() {
    return (
        <Canvas camera={{ position: [0, 1, 3] }}>
            <Character />

            <OrbitControls target={[0, 1, 0]} />
            <Environment files={cityEnvironment} />
            <ambientLight intensity={0.5} />
        </Canvas>
    )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Sketch />
    </React.StrictMode>,
)
