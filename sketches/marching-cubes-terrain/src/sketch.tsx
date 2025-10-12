import { Canvas } from '@react-three/fiber'
import cityEnvironment from './city.hdr?url'
import { Environment, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { createMulberry32Generator, createSimplex2D } from 'maaths'
import { useMemo } from 'react'
import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js'
import { marchingCubes } from './marching-cubes'
import * as Voxels from './voxels'

const tree = (world: Voxels.World, treeX: number, treeY: number, treeZ: number) => {
    // trunk
    for (let y = 0; y < 10; y++) {
        Voxels.setBlock(world, treeX, treeY + y, treeZ, true)
    }

    // leaves
    const radius = 5
    const center = [0, radius, 0]

    for (let x = -radius; x < radius; x++) {
        for (let y = -radius; y < radius; y++) {
            for (let z = -radius; z < radius; z++) {
                const position = { x, y, z }
                const distance = Math.sqrt(position.x ** 2 + position.y ** 2 + position.z ** 2)

                if (distance < radius) {
                    const treeLeavesX = center[0] + x + treeX
                    const treeLeavesY = center[1] + y + 5 + treeY
                    const treeLeavesZ = center[2] + z + treeZ

                    Voxels.setBlock(world, treeLeavesX, treeLeavesY, treeLeavesZ, true)
                }
            }
        }
    }
}

const createVoxelWorld = () => {
    const world = Voxels.init()

    const generator = createMulberry32Generator(42)
    const noise = createSimplex2D(42)

    const size = 128

    const halfSize = size / 2

    for (let x = -halfSize; x < halfSize; x++) {
        for (let z = -halfSize; z < halfSize; z++) {
            let y = Math.floor(noise(x / 150, z / 150) * 10)
            y += Math.floor(noise(x / 75, z / 75) * 5)

            for (let i = y; i >= -15; i--) {
                Voxels.setBlock(world, x, i, z, true)
            }

            if (generator() < 0.002) {
                tree(world, x, y, z)
            }
        }
    }

    return world
}

const createGeometry = (world: Voxels.World) => {
    const geometries: THREE.BufferGeometry[] = []

    const offset = new THREE.Vector3()

    for (const [, chunk] of world.chunks) {
        const { vertices, faces } = marchingCubes(world, chunk)

        if (faces.length === 0) continue

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices.flat()), 3))
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(faces.flat()), 1))

        offset.fromArray(chunk.position).multiplyScalar(Voxels.CHUNK_SIZE)

        geometry.translate(offset.x, offset.y, offset.z)

        geometries.push(geometry)
    }

    const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries)

    mergedGeometry.computeVertexNormals()

    return mergedGeometry
}

export function Sketch() {
    const mesh = useMemo(() => {
        const world = createVoxelWorld()

        const geometry = createGeometry(world)

        const material = new THREE.MeshStandardMaterial({
            color: '#999',
        })

        return new THREE.Mesh(geometry, material)
    }, [])

    return (
        <Canvas>
            <primitive object={mesh} />

            <Environment files={cityEnvironment} />

            <OrbitControls makeDefault />
            <PerspectiveCamera makeDefault position={[120, 100, -30]} />
        </Canvas>
    )
}
