import { useEffect, useMemo, useState } from 'react'
import { loadImage } from '../../lib/load-image'
import { TextureAtlas } from '../../lib/texture-atlas'
import largeTextureUrl from './textures/large.png?url'
import smallTextureUrl from './textures/small.png?url'

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

        console.log('here')
    }

    return (
        <div
            style={{
                width: 'calc(100% - 8em)',
                height: '100%',
                margin: '8em 4em 1em 4em',

            }}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    gap: '1em',
                }}
            >
                <button onClick={addSmallTexture}>Add small texture</button>
                <button onClick={addLargeTexture}>Add large texture</button>
            </div>

            <div ref={setDiv}></div>
        </div>
    )
}
