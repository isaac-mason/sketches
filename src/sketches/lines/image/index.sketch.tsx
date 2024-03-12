import { OrbitControls, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas } from '@/common'
import plantImageUrl from './plant.png?url'

const vertexShader = /* glsl */ `
    uniform float uTextureWidth;
    uniform float uTextureHeight;

    varying vec2 vUv;
    varying vec2 vTextureCoord;

    void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

        vec2 textureCoord = vec4(position, 1.0).xy / vec2(uTextureWidth, uTextureHeight);

        vUv = uv;
        vTextureCoord = textureCoord;
    }
`

const fragmentShader = /* glsl */ `
uniform float uFade;
uniform float uTime;
uniform sampler2D uTexture;

varying vec2 vUv;
varying vec2 vTextureCoord;

void main() {
    vec4 textureSample = texture2D(uTexture, vTextureCoord);
    vec3 color = textureSample.rgb;

    float wave = sin(uTime * 0.15) * 0.5 + 0.5;
    float highlightLowerBound = wave - 0.025;
    float highlightUpperBound = wave + 0.025;
    wave = smoothstep(highlightLowerBound, wave, vUv.x) + 1.0 - smoothstep(wave, highlightUpperBound, vUv.x);
    wave = (wave - 1.0) * 0.1;

    color = mix(color, vec3(1.0), wave);

    float alpha = textureSample.a * step(vUv.x, uFade);

    gl_FragColor = vec4(color, alpha);
}
`

type LineImageProps = {
    src: string
    numberLines: number
    maxDistance: number
    sampleSize: number
    brightnessThreshold: number
}

const LineImage = ({ src, numberLines, maxDistance, sampleSize, brightnessThreshold }: LineImageProps) => {
    const ref = useRef<THREE.Group>(null!)

    const texture = useTexture(src)

    const { width, height } = texture.image

    const positions = useMemo(() => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D

        canvas.width = width
        canvas.height = height

        ctx.scale(1, -1)
        ctx.drawImage(texture.image, 0, 0, width, height * -1)

        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)

        const originalColors = Float32Array.from(data)

        const positions: THREE.Vector3[] = []

        const nPositions = width * height

        for (let i = 0; i < nPositions; i++) {
            const r = originalColors[i * 4]
            const g = originalColors[i * 4 + 1]
            const b = originalColors[i * 4 + 2]
            const brightness = (r + g + b) / 3

            if (brightness < brightnessThreshold) {
                continue
            }

            const position = new THREE.Vector3(i % width, Math.floor(i / width), brightness / 15)

            positions.push(position)
        }

        return positions
    }, [width, height, texture.image])

    const lines = useMemo(() => {
        const lines: THREE.Vector3[][] = []

        const currentPoint = new THREE.Vector3()
        const previousPoint = new THREE.Vector3()

        for (let i = 0; i < numberLines; i++) {
            const lineVertices: THREE.Vector3[] = []

            currentPoint.copy(positions[Math.floor(Math.random() * positions.length)])
            previousPoint.copy(currentPoint)

            for (let i = 0; i < sampleSize; i++) {
                currentPoint.copy(positions[Math.floor(Math.random() * positions.length)])

                if (currentPoint.distanceTo(previousPoint) >= maxDistance) {
                    continue
                }

                lineVertices.push(currentPoint.clone())
                previousPoint.copy(currentPoint)
            }

            if (lineVertices.length >= 3) {
                lines.push(lineVertices)
            }
        }

        return lines
    }, [positions, numberLines, maxDistance, sampleSize])

    return (
        <group ref={ref} scale={[0.03, 0.03, 0.03]}>
            <group position={[-width / 2, -height / 2, 0]}>
                {lines.map((d, i) => (
                    <Line vertices={d} texture={texture} key={i} />
                ))}
            </group>
        </group>
    )
}

type LineProps = {
    vertices: THREE.Vector3[]
    texture: THREE.Texture
}

const Line = ({ vertices, texture }: LineProps) => {
    const uFade = useRef({ value: 0 })
    const uTime = useRef({ value: 0 })

    const curve = useMemo(() => new THREE.CatmullRomCurve3(vertices), [vertices])

    useFrame(({ clock }, delta) => {
        uFade.current.value = THREE.MathUtils.lerp(uFade.current.value, 1, delta * 2)
        uTime.current.value = clock.getElapsedTime()
    })

    useEffect(() => {
        uFade.current.value = 0
    }, [])

    return (
        <>
            <mesh>
                <tubeGeometry args={[curve, 50, 0.25, 6, false]} />
                <shaderMaterial
                    fragmentShader={fragmentShader}
                    vertexShader={vertexShader}
                    uniforms={{
                        uTime: uTime.current,
                        uFade: uFade.current,
                        uTexture: { value: texture },
                        uTextureWidth: { value: texture.image.width },
                        uTextureHeight: { value: texture.image.height },
                    }}
                    transparent
                />
            </mesh>
        </>
    )
}

export default function Main() {
    const config = useControls('lines-image', {
        numberLines: 400,
        maxDistance: 11,
        sampleSize: 2500,
        brightnessThreshold: 6,
    })

    return (
        <Canvas camera={{ position: [0, 0.5, 10] }}>
            <LineImage src={plantImageUrl} {...config} key={Object.values(config).join('-')} />

            <OrbitControls makeDefault target={[0, 0.5, 0]} />
        </Canvas>
    )
}
