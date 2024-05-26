import { WebGPUCanvas } from '@/common'
import { Helper, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import { useEffect, useRef, useState } from 'react'
import { suspend } from 'suspend-react'
import * as THREE from 'three'
import { VertexNormalsHelper } from 'three/examples/jsm/Addons.js'
import { BlockRegistry } from '../lib/block-registry'
import { ChunkGeometry } from '../lib/chunk-geometry'
import { ChunkMaterial } from '../lib/chunk-material'
import { CulledMesher } from '../lib/culled-mesher'
import { loadImage } from '../lib/load-image'
import { TextureAtlas } from '../lib/texture-atlas'
import { CHUNK_SIZE, World } from '../lib/world'
import diamondTextureUrl from './textures/diamond.png?url'
import stoneTextureUrl from './textures/stone.png?url'
import greyTextureUrl from './textures/grey.png?url'

const Example = () => {
    const { vertexNormalsHelper } = useControls('textured-voxels-sphere', {
        vertexNormalsHelper: false,
    })

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
        blockRegistry.register({ name: Blocks.DIAMOND, texture: diamondTextureInfo })
        blockRegistry.register({ name: Blocks.STONE, texture: stoneTextureInfo })
        blockRegistry.register({ name: Blocks.GREY, texture: greyTextureInfo })

        const { id: diamondBlockId } = blockRegistry.getBlockByName(Blocks.DIAMOND)!
        const { id: stoneBlockId } = blockRegistry.getBlockByName(Blocks.STONE)!
        const { id: greyBlockId } = blockRegistry.getBlockByName(Blocks.GREY)!

        const world = new World()

        const cursor = new THREE.Vector3()

        // sphere
        const size = 20
        const radius = 10
        const center = new THREE.Vector3(0, 0, 0)
        for (let x = -size; x < size; x++) {
            for (let y = -size; y < size; y++) {
                for (let z = -size; z < size; z++) {
                    cursor.set(x, y, z)
                    if (center.distanceTo(cursor) < radius) {
                        const blockType = Math.random() > 0.5 ? stoneBlockId : diamondBlockId
                        world.setBlock(cursor, true, blockType)
                    }
                }
            }
        }

        // left hand wall
        for (let y = -size; y < size; y++) {
            for (let z = -size; z < size; z++) {
                cursor.set(-size, y, z)
                world.setBlock(cursor, true, greyBlockId)
            }
        }

        // back wall
        for (let x = -size; x < size; x++) {
            for (let y = -size; y < size; y++) {
                cursor.set(x, y, -size)
                world.setBlock(cursor, true, greyBlockId)
            }
        }

        // ground
        for (let x = -size; x < size; x++) {
            for (let z = -size; z < size; z++) {
                cursor.set(x, -size, z)
                world.setBlock(cursor, true, greyBlockId)
            }
        }

        // create chunk meshes
        const chunkMaterial = new ChunkMaterial(textureAtlas, { translucent: true })
        const translucentChunkMaterial = new ChunkMaterial(textureAtlas, { translucent: true })

        const meshes: THREE.Mesh[] = []

        for (const chunk of world.chunks) {
            const { opaque } = CulledMesher.mesh(chunk, world, blockRegistry)

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
                <primitive key={index} object={mesh}>
                    {vertexNormalsHelper && <Helper type={VertexNormalsHelper} />}
                </primitive>
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

    return (
        <pointLight position={[15, 0, 15]} intensity={90} ref={pointLightRef}>
            <Helper type={THREE.PointLightHelper} />
        </pointLight>
    )
}

export default function Sketch() {
    return (
        <WebGPUCanvas>
            <Example />

            <ambientLight intensity={0.5} />
            <SpinningPointLight />

            <OrbitControls makeDefault />

            <PerspectiveCamera makeDefault position={[5, 10, 40]} />
        </WebGPUCanvas>
    )
}
