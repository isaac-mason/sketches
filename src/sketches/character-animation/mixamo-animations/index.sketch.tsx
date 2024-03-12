import { OrbitControls, useAnimations, useGLTF } from '@react-three/drei'
import { useEffect, useState } from 'react'
import { LoopRepeat } from 'three'
import { Canvas } from '@/common'
import characterGltfUrl from './character.glb?url'

const ANIMATION_NAMES = ['idle', 'walking']

const Character = () => {
    const { animations, scene } = useGLTF(characterGltfUrl)
    const { ref, actions, names } = useAnimations(animations)

    useEffect(() => {
        scene.traverse((child) => {
            if (child.type === 'Mesh') {
                child.castShadow = true
                child.receiveShadow = true
            }
        })
    }, [])

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

export default () => (
    <Canvas camera={{ position: [0, 0.5, 1] }} shadows>
        <Character />
        <OrbitControls target={[0, 0.5, 0]} />
    </Canvas>
)
