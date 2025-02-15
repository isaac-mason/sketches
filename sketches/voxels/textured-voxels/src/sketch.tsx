import { WebGPUCanvas } from '@/common/components/webgpu-canvas'
import { OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { suspend } from 'suspend-react'
import * as THREE from 'three'
import { BlockRegistry } from './lib/block-registry'
import { ChunkGeometry } from './lib/chunk-geometry'
import { ChunkMaterial } from './lib/chunk-material'
import { CulledMesher, NeigbourChunks } from './lib/culled-mesher'
import { loadImage } from './lib/load-image'
import { TextureAtlas } from './lib/texture-atlas'
import { CHUNK_SIZE, World } from './lib/world'
import diamondTextureUrl from './textures/diamond.png?url'
import greyTextureUrl from './textures/grey.png?url'
import stoneTextureUrl from './textures/stone.png?url'

const Example = () => {
    const [chunkMeshes, setChunkMeshes] = useState<THREE.Mesh[]>([])

    const [diamondTexture, stoneTexture, greyTexture] = suspend(async () => {
        return await Promise.all([diamondTextureUrl, stoneTextureUrl, greyTextureUrl].map(loadImage))
    }, ['__textured_voxels_sphere_block_textures'])

    useEffect(() => {
        const textureAtlas = new TextureAtlas(16, 16)
        const diamondTextureInfo = textureAtlas.add(diamondTexture)
        const stoneTextureInfo = textureAtlas.add(stoneTexture)
        const greyTextureInfo = textureAtlas.add(greyTexture)

        const Blocks = {
            STONE: 'stone',
            DIAMOND: 'diamond',
            GREY: 'grey',
        }

        const blockRegistry = new BlockRegistry()
        const diamondBlock = blockRegistry.register({ name: Blocks.DIAMOND, texture: diamondTextureInfo })
        const stoneBlock = blockRegistry.register({ name: Blocks.STONE, texture: stoneTextureInfo })
        const greyBlock = blockRegistry.register({ name: Blocks.GREY, texture: greyTextureInfo })

        const world = new World()

        // sphere
        const size = 20
        const radius = 10
        for (let x = -size; x < size; x++) {
            for (let y = -size; y < size; y++) {
                for (let z = -size; z < size; z++) {
                    if (x ** 2 + y ** 2 + z ** 2 < radius ** 2) {
                        const blockType = Math.random() > 0.5 ? stoneBlock.id : diamondBlock.id
                        world.setBlock(x, y, z, true, blockType)
                    }
                }
            }
        }

        // left hand wall
        for (let y = -size; y < size; y++) {
            for (let z = -size; z < size; z++) {
                world.setBlock(-size, y, z, true, greyBlock.id)
            }
        }

        // back wall
        for (let x = -size; x < size; x++) {
            for (let y = -size; y < size; y++) {
                world.setBlock(x, y, -size, true, greyBlock.id)
            }
        }

        // ground
        for (let x = -size; x < size; x++) {
            for (let z = -size; z < size; z++) {
                world.setBlock(x, -size, z, true, greyBlock.id)
            }
        }

        // create chunk meshes
        const chunkMaterial = new ChunkMaterial(textureAtlas)

        const meshes: THREE.Mesh[] = []

        for (const chunk of world.chunks) {
            const neighborChunks: NeigbourChunks = {
                nx: world.chunks.get(chunk.position.x - 1, chunk.position.y, chunk.position.z),
                ny: world.chunks.get(chunk.position.x, chunk.position.y - 1, chunk.position.z),
                nz: world.chunks.get(chunk.position.x, chunk.position.y, chunk.position.z - 1),
                px: world.chunks.get(chunk.position.x + 1, chunk.position.y, chunk.position.z),
                py: world.chunks.get(chunk.position.x, chunk.position.y + 1, chunk.position.z),
                pz: world.chunks.get(chunk.position.x, chunk.position.y, chunk.position.z + 1),
            }
            const { opaque } = CulledMesher.mesh(chunk, neighborChunks, blockRegistry)

            if (opaque.positions.length <= 0) continue

            const opaqueGeometry = new ChunkGeometry()
            opaqueGeometry.setMesherData(opaque)

            const opaqueMesh = new THREE.Mesh(opaqueGeometry, chunkMaterial)
            opaqueMesh.position.set(chunk.position.x * CHUNK_SIZE, chunk.position.y * CHUNK_SIZE, chunk.position.z * CHUNK_SIZE)

            meshes.push(opaqueMesh)
        }

        setChunkMeshes(meshes)

        return () => {
            setChunkMeshes([])

            for (const mesh of meshes) {
                mesh.geometry.dispose()
            }

            chunkMaterial.dispose()
        }
    }, [])

    return (
        <group>
            {chunkMeshes.map((mesh, index) => (
                <primitive key={index} object={mesh} />
            ))}
        </group>
    )
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
