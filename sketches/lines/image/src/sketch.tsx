import { WebGPUCanvas } from '@/common/components/webgpu-canvas'
import { OrbitControls, useTexture } from '@react-three/drei'
import { useControls } from 'leva'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Fn, positionLocal, step, texture, time, uv, vec2, vec3, vec4 } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import plantImageUrl from './plant.png?url'

type LineImageProps = {
    src: string
    numberLines: number
    maxDistance: number
    sampleSize: number
    brightnessThreshold: number
}

const LineImage = ({ src, numberLines, maxDistance, sampleSize, brightnessThreshold }: LineImageProps) => {
    const ref = useRef<THREE.Group>(null!)

    const texture = useTexture(src, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace
    })

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
    }, [width, height, brightnessThreshold, texture.image])

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
                    <Line vertices={d} map={texture} key={String(i)} />
                ))}
            </group>
        </group>
    )
}

type LineProps = {
    vertices: THREE.Vector3[]
    map: THREE.Texture
}

const Line = ({ vertices, map }: LineProps) => {
    const curve = useMemo(() => new THREE.CatmullRomCurve3(vertices), [vertices])

    const material = useMemo(() => {
        const mat = new MeshBasicNodeMaterial()

        mat.colorNode = Fn(() => {
            const textureUv = vec2(vec4(positionLocal, 1.0).xy.div(vec2(map.image.width, map.image.height)))
            const sample = texture(map, textureUv)

            const fade = time.log2().remapClamp(0, 2, 0, 1)
            const alpha = sample.a.mul(step(uv().x, fade))

            alpha.lessThan(0.1).discard()

            return vec3(sample)
        })()

        return mat
    }, [map])

    return (
        <mesh>
            <tubeGeometry args={[curve, 50, 0.25, 6, false]} />
            <primitive object={material} />
        </mesh>
    )
}

export function Sketch() {
    const config = useControls({
        numberLines: 400,
        maxDistance: 11,
        sampleSize: 2500,
        brightnessThreshold: 6,
    })

    return (
        <WebGPUCanvas camera={{ position: [0, 0.5, 10] }} gl={{ antialias: true }}>
            <LineImage src={plantImageUrl} {...config} key={Object.values(config).join('-')} />

            <OrbitControls makeDefault target={[0, 0.5, 0]} />
        </WebGPUCanvas>
    )
}
