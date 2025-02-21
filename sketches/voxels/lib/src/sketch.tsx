import { WebGPUCanvas } from '@/common/components/webgpu-canvas'
import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { suspend } from 'suspend-react'
import * as THREE from 'three'
import { loadImage } from './lib/load-image'
import { Voxels } from './lib/voxels'
import diamondTextureUrl from './textures/diamond.png?url'
import greyTextureUrl from './textures/grey.png?url'
import stoneTextureUrl from './textures/stone.png?url'

const Example = () => {
    const scene = useThree((state) => state.scene)

    const [diamondTexture, stoneTexture, greyTexture] = suspend(async () => {
        return await Promise.all([diamondTextureUrl, stoneTextureUrl, greyTextureUrl].map(loadImage))
    }, ['__textured_voxels_sphere_block_textures'])

    useEffect(() => {
        const textureSize = 32
        const voxels = new Voxels(scene, textureSize)

        voxels.assets = {
            'tex-diamond': diamondTexture,
            'tex-stone': stoneTexture,
            'tex-grey': greyTexture,
        }

        const diamondBlock = voxels.registerBlock({
            id: 'diamond',
            cube: {
                default: { texture: { id: 'tex-diamond' } },
            },
        })

        const stoneBlock = voxels.registerBlock({
            id: 'stone',
            cube: {
                default: { texture: { id: 'tex-stone' } },
            },
        })

        const greyBlock = voxels.registerBlock({
            id: 'grey',
            cube: {
                default: { texture: { id: 'tex-grey' } },
            },
        })

        const orangeColorBlock = voxels.registerBlock({
            id: 'orange',
            cube: {
                default: { color: 'orange' },
            },
        })

        voxels.updateAtlas()

        // sphere
        const size = 20
        const radius = 10
        for (let x = -size; x < size; x++) {
            for (let y = -size; y < size; y++) {
                for (let z = -size; z < size; z++) {
                    if (x ** 2 + y ** 2 + z ** 2 < radius ** 2) {
                        const blockType = Math.random() > 0.5 ? stoneBlock.index : diamondBlock.index
                        voxels.setType(x, y, z, blockType)
                    }
                }
            }
        }

        // left hand wall
        for (let y = -size; y < size; y++) {
            for (let z = -size; z < size; z++) {
                voxels.setType(-size, y, z, greyBlock.index)
            }
        }

        // back wall
        for (let x = -size; x < size; x++) {
            for (let y = -size; y < size; y++) {
                voxels.setType(x, y, -size, greyBlock.index)
            }
        }

        // ground
        for (let x = -size; x < size; x++) {
            for (let z = -size; z < size; z++) {
                voxels.setType(x, -size, z, orangeColorBlock.index)
            }
        }

        voxels.meshAllChunks()

        return () => {
            voxels.dispose()
        }
    }, [])

    return null
}

const SpinningPointLight = () => {
    const pointLightRef = useRef<THREE.PointLight>(null!)

    useFrame(({ clock: { elapsedTime } }) => {
        pointLightRef.current.position.x = Math.sin(elapsedTime) * 15
        pointLightRef.current.position.z = Math.cos(elapsedTime) * 15
    })

    return <pointLight position={[15, 0, 15]} intensity={90} ref={pointLightRef} />
}

export function Sketch() {
    return (
        <WebGPUCanvas camera={{ position: [20, 10, 20] }}>
            <Example />

            <ambientLight intensity={0.5} />
            <SpinningPointLight />

            <OrbitControls />
        </WebGPUCanvas>
    )
}
