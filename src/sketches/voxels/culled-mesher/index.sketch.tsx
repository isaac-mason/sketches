import { Bounds, OrbitControls } from '@react-three/drei'
import { useControls } from 'leva'
import { BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial } from 'three'
import { Canvas } from '../../../common'

const CHUNK_BITS = 4
const CHUNK_SIZE = Math.pow(2, 4)

type Vec3 = [x: number, y: number, z: number]

type VoxelChunk = {
    id: string
    position: Vec3
    solid: Uint8Array
    color: Uint32Array
    dirty: boolean
}

class VoxelWorld {
    chunks = new Map<string, VoxelChunk>()

    setBlock(position: Vec3, value: { solid: false } | { solid: true; color: number }) {
        const chunkPosition = VoxelUtils.worldPositionToChunkPosition(position)
        const id = VoxelUtils.chunkId(chunkPosition)

        let chunk = this.chunks.get(id)

        if (chunk === undefined) {
            chunk = VoxelUtils.emptyChunk(id, chunkPosition)
            this.chunks.set(id, chunk)
        }

        const index = VoxelUtils.positionToChunkIndex(position)
        chunk.solid[index] = value.solid ? 1 : 0
        chunk.color[index] = value.solid ? value.color : 0
    }

    isSolid(position: Vec3): boolean {
        const chunk = this.chunks.get(VoxelUtils.chunkId(VoxelUtils.worldPositionToChunkPosition(position)))

        if (!chunk) {
            return false
        }

        const chunkDataIndex = VoxelUtils.positionToChunkIndex(position)
        return chunk.solid[chunkDataIndex] === 1
    }
}

class VoxelUtils {
    static positionToChunkIndex([x, y, z]: Vec3): number {
        const mask = (1 << CHUNK_BITS) - 1

        return (x & mask) + ((y & mask) << CHUNK_BITS) + ((z & mask) << (CHUNK_BITS * 2))
    }

    static worldPositionToChunkPosition([x, y, z]: Vec3): Vec3 {
        // Using signed right shift to convert to chunk vec
        // Shifts right by pushing copies of the leftmost bit in from the left, and let the rightmost bits fall off
        // e.g.
        // 15 >> 4 = 0
        // 16 >> 4 = 1
        const cx = x >> CHUNK_BITS
        const cy = y >> CHUNK_BITS
        const cz = z >> CHUNK_BITS

        return [cx, cy, cz]
    }

    static chunkId = (position: Vec3): string => {
        return position.join(',')
    }

    static emptyChunk(id: string, position: Vec3): VoxelChunk {
        return {
            id,
            position,
            solid: new Uint8Array(CHUNK_SIZE ** 3),
            color: new Uint32Array(CHUNK_SIZE ** 3),
            dirty: true,
        }
    }
}

class VoxelChunkMesh {
    geometry = new BufferGeometry()

    material = new MeshStandardMaterial({
        vertexColors: true,
    })

    mesh = new Mesh()

    private tmpColor = new Color()

    constructor(
        private world: VoxelWorld,
        private chunk: VoxelChunk,
    ) {
        this.mesh.geometry = this.geometry
        this.mesh.material = this.material
    }

    update() {
        const positions: number[] = []
        const indices: number[] = []
        const normals: number[] = []
        const colors: number[] = []

        const chunkX = this.chunk.position[0] * CHUNK_SIZE
        const chunkY = this.chunk.position[1] * CHUNK_SIZE
        const chunkZ = this.chunk.position[2] * CHUNK_SIZE

        const emit = (face: {
            x: number
            y: number
            z: number
            ux: number
            uy: number
            vx: number
            vy: number
            color: number
            nx: number
            ny: number
            nz: number
        }) => {
            const uz = face.ux == 0 && face.uy == 0 ? 1 : 0
            const vz = face.vx == 0 && face.vy == 0 ? 1 : 0

            positions.push(face.x, face.y, face.z)
            positions.push(face.x + face.ux, face.y + face.uy, face.z + uz)
            positions.push(face.x + face.vx, face.y + face.vy, face.z + vz)
            positions.push(face.x + face.ux + face.vx, face.y + face.uy + face.vy, face.z + uz + vz)

            const index = positions.length / 3 - 4
            const a = index
            const b = index + 1
            const c = index + 2
            const d = index + 3

            indices.push(b, a, c)
            indices.push(b, c, d)

            this.tmpColor.set(face.color)
            colors.push(
                this.tmpColor.r,
                this.tmpColor.g,
                this.tmpColor.b,
                this.tmpColor.r,
                this.tmpColor.g,
                this.tmpColor.b,
                this.tmpColor.r,
                this.tmpColor.g,
                this.tmpColor.b,
                this.tmpColor.r,
                this.tmpColor.g,
                this.tmpColor.b,
            )

            normals.push(
                face.nx,
                face.ny,
                face.nz,
                face.nx,
                face.ny,
                face.nz,
                face.nx,
                face.ny,
                face.nz,
                face.nx,
                face.ny,
                face.nz,
            )
        }

        for (let localX = 0; localX < CHUNK_SIZE; localX++) {
            for (let localY = 0; localY < CHUNK_SIZE; localY++) {
                for (let localZ = 0; localZ < CHUNK_SIZE; localZ++) {
                    const chunkDataIndex = VoxelUtils.positionToChunkIndex([localX, localY, localZ])

                    if (this.chunk.solid[chunkDataIndex] === 0) {
                        continue
                    }

                    const worldX = chunkX + localX
                    const worldY = chunkY + localY
                    const worldZ = chunkZ + localZ

                    const col = this.chunk.color[chunkDataIndex]

                    if (!this.world.isSolid([worldX, worldY, worldZ + 1])) {
                        emit({
                            x: localX + 1,
                            y: localY,
                            z: localZ + 1,
                            ux: -1,
                            uy: 0,
                            vx: 0,
                            vy: 1,
                            color: col,
                            nx: 0,
                            ny: 0,
                            nz: 1,
                        })
                    }

                    if (!this.world.isSolid([worldX, worldY, worldZ - 1])) {
                        emit({
                            x: localX,
                            y: localY,
                            z: localZ,
                            ux: 1,
                            uy: 0,
                            vx: 0,
                            vy: 1,
                            color: col,
                            nx: 0,
                            ny: 0,
                            nz: -1,
                        })
                    }

                    if (!this.world.isSolid([worldX - 1, worldY, worldZ])) {
                        emit({
                            x: localX,
                            y: localY + 1,
                            z: localZ,
                            ux: 0,
                            uy: 0,
                            vx: 0,
                            vy: -1,
                            color: col,
                            nx: -1,
                            ny: 0,
                            nz: 0,
                        })
                    }

                    if (!this.world.isSolid([worldX + 1, worldY, worldZ])) {
                        emit({
                            x: localX + 1,
                            y: localY,
                            z: localZ,
                            ux: 0,
                            uy: 0,
                            vx: 0,
                            vy: 1,
                            color: col,
                            nx: 1,
                            ny: 0,
                            nz: 0,
                        })
                    }

                    if (!this.world.isSolid([worldX, worldY - 1, worldZ])) {
                        emit({
                            x: localX,
                            y: localY,
                            z: localZ,
                            ux: 0,
                            uy: 0,
                            vx: 1,
                            vy: 0,
                            color: col,
                            nx: 0,
                            ny: -1,
                            nz: 0,
                        })
                    }

                    if (!this.world.isSolid([worldX, worldY + 1, worldZ])) {
                        emit({
                            x: localX + 1,
                            y: localY + 1,
                            z: localZ,
                            ux: 0,
                            uy: 0,
                            vx: -1,
                            vy: 0,
                            color: col,
                            nx: 0,
                            ny: 1,
                            nz: 0,
                        })
                    }
                }
            }
        }

        this.geometry.setIndex(indices)
        this.geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
        this.geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
        this.geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))

        this.mesh.position.set(
            this.chunk.position[0] * CHUNK_SIZE - 0.5,
            this.chunk.position[1] * CHUNK_SIZE - 0.5,
            this.chunk.position[2] * CHUNK_SIZE - 0.5,
        )
    }
}

const world = new VoxelWorld()

// sphere
const orange = new Color('orange').getHex()
for (let x = -10; x < 10; x++) {
    for (let y = -10; y < 10; y++) {
        for (let z = -10; z < 10; z++) {
            if (x * x + y * y + z * z < 10 * 10) {
                world.setBlock([x, y, z], {
                    solid: true,
                    color: orange,
                })
            }
        }
    }
}

const chunkMeshes: VoxelChunkMesh[] = []

for (const chunk of world.chunks.values()) {
    const chunkMesh = new VoxelChunkMesh(world, chunk)
    chunkMesh.update()

    chunkMeshes.push(chunkMesh)
}

const App = () => {
    useControls('voxels-culled-mesher', {
        wireframe: {
            value: false,
            onChange: (value) => {
                chunkMeshes.forEach((chunkMesh) => {
                    ;(chunkMesh.mesh.material as MeshStandardMaterial).wireframe = value
                })
            },
        },
    })

    return (
        <>
            <Bounds fit margin={2}>
                {chunkMeshes.map((chunkMesh) => (
                    <primitive key={chunkMesh.mesh.id} object={chunkMesh.mesh} />
                ))}
            </Bounds>

            <ambientLight intensity={0.2} />
            <pointLight intensity={0.5} position={[20, 20, 20]} />
            <pointLight intensity={0.5} position={[-20, 20, -20]} />
        </>
    )
}

export default () => (
    <>
        <h1>Voxels - Culled Mesher</h1>
        <Canvas camera={{ position: [20, 20, 20] }}>
            <App />
            <OrbitControls />
        </Canvas>
    </>
)
