import { Text, Float, Billboard } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import NotoEmojiRegular from './NotoEmoji-Regular.ttf'

const Balloons = () => {
    return (
        <>
            {Array.from({ length: 10 }).map((_, idx) => (
                <Float key={idx} floatIntensity={1} rotationIntensity={2}>
                    <Text
                        fontSize={2}
                        font={NotoEmojiRegular}
                        scale={0.5}
                        position={[0, 0, -idx * 2]}
                    >
                        🎈
                        <meshNormalMaterial />
                    </Text>
                </Float>
            ))}
        </>
    )
}

const Tadas = () => {
    return (
        <>
            {Array.from({ length: 10 }).map((_, idx) => (
                <Float key={idx} floatIntensity={1} rotationIntensity={2}>
                    <Text
                        fontSize={2}
                        font={NotoEmojiRegular}
                        scale={0.5}
                        position={[-2.5, 0, -idx * 2]}
                    >
                        🎉
                        <meshNormalMaterial />
                    </Text>
                </Float>
            ))}
        </>
    )
}

const Confettis = () => {
    return (
        <>
            {Array.from({ length: 10 }).map((_, idx) => (
                <Float key={idx} floatIntensity={1} rotationIntensity={2}>
                    <Text
                        fontSize={2}
                        font={NotoEmojiRegular}
                        scale={0.5}
                        position={[2.5, 0, -idx * 2]}
                    >
                        🎊
                        <meshNormalMaterial />
                    </Text>
                </Float>
            ))}
        </>
    )
}

export default () => (
    <>
        <h1>13 - Text</h1>
        <Canvas camera={{ position: [0, 2, 5] }}>
            <Float>
                <Billboard follow>
                    <Text
                        fontSize={0.5}
                        position={[0, -2, 0]}
                        lookAt={() => [0, 2, 5]}
                    >
                        Yeeeew!
                    </Text>
                </Billboard>
            </Float>

            <Tadas />
            <Balloons />
            <Confettis />
        </Canvas>
    </>
)
