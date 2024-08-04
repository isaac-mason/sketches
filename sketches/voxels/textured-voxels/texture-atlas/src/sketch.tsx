import { Canvas } from '@/common'
import { Html, OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { loadImage } from '../lib/load-image'
import { TextureAtlas } from '../lib/texture-atlas'
import largeTextureUrl from './large.png?url'
import smallTextureUrl from './small.png?url'

export function Sketch() {
    const [div, setDiv] = useState<HTMLDivElement | null>()

    const textureAtlas = useMemo(() => {
        return new TextureAtlas()
    }, [])

    useEffect(() => {
        if (!div) return

        div.appendChild(textureAtlas.canvas)

        return () => {
            div.removeChild(textureAtlas.canvas)
        }
    }, [div])

    const addSmallTexture = async () => {
        const image = await loadImage(smallTextureUrl)

        textureAtlas.add(image)
    }

    const addLargeTexture = async () => {
        const image = await loadImage(largeTextureUrl)

        textureAtlas.add(image)
    }

    return (
        <Canvas>
            <Html center>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        gap: '1em',
                        marginBottom: '1em',
                    }}
                >
                    <button onClick={addSmallTexture}>Add small texture</button>
                    <button onClick={addLargeTexture}>Add large texture</button>
                </div>

                <div ref={setDiv}></div>
            </Html>

            <OrbitControls
                makeDefault
                screenSpacePanning
                mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: undefined, RIGHT: undefined }}
                touches={{ ONE: THREE.TOUCH.PAN, TWO: undefined }}
                enableZoom={false}
            />
        </Canvas>
    )
}
