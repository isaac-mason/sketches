import { ThreeElements, useFrame } from '@react-three/fiber'
import { Fragment, createContext, forwardRef, useContext, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import * as THREE from 'three'
import { Voxels as VoxelsImpl, VoxelsWorkerPool } from './voxels'
import { Chunk, getChunkBounds } from './world'

type VoxelsContextType = { voxels: VoxelsImpl }

const voxelsContext = createContext<VoxelsContextType>(null!)

export const useVoxels = () => {
    const context = useContext(voxelsContext)

    if (!context) {
        throw new Error('useVoxels must be used within <Voxels>')
    }

    return context
}

export type VoxelsProps = {
    voxels?: VoxelsImpl
    voxelsWorkerPool?: VoxelsWorkerPool
    children: React.ReactNode
}

export type VoxelsRef = VoxelsImpl | undefined

export const Voxels = forwardRef<VoxelsRef, VoxelsProps>(
    ({ voxels: existingVoxels, voxelsWorkerPool: existingVoxelsWorkerPool, children }, ref) => {
        const [voxels, setVoxels] = useState<VoxelsImpl>()

        const voxelsWorkerPool = useMemo(() => existingVoxelsWorkerPool ?? new VoxelsWorkerPool(), [])

        useImperativeHandle(ref, () => voxels, [voxels])

        useEffect(() => {
            if (existingVoxelsWorkerPool) return

            voxelsWorkerPool.connect()

            return () => {
                voxelsWorkerPool.disconnect()
            }
        }, [])

        useEffect(() => {
            if (existingVoxels) {
                setVoxels(existingVoxels)
                return
            }

            if (!voxelsWorkerPool) return

            const voxels = new VoxelsImpl({ voxelsWorkerPool })

            setVoxels(voxels)

            return () => {
                setVoxels(undefined)

                voxels.dispose()
            }
        }, [voxelsWorkerPool])

        useFrame(() => {
            if (!voxels) return

            voxels.update()
        })

        const context = useMemo(() => ({ voxels: voxels! }), [voxels])

        if (!voxels) return null

        return <voxelsContext.Provider value={context}>{children}</voxelsContext.Provider>
    },
)

type ChunkHelperProps = { chunk: Chunk }

const ChunkHelper = ({ chunk }: ChunkHelperProps) => {
    const { min, max } = getChunkBounds(chunk)
    const box3 = new THREE.Box3(min, max)
    box3.min.subScalar(1)

    return <box3Helper args={[box3, 0xffff00]} />
}

type VoxelChunkMeshesProps = {
    chunkHelper?: boolean
} & ThreeElements['group']

export const VoxelChunkMeshes = ({ chunkHelper = false, ...groupProps }: VoxelChunkMeshesProps) => {
    const { voxels } = useVoxels()

    type ChunkAndMesh = { chunk: Chunk; mesh: THREE.Mesh }

    const [meshes, setMeshes] = useState<ChunkAndMesh[]>([])

    useEffect(() => {
        const meshes: ChunkAndMesh[] = []

        for (const [, chunk] of voxels.world.chunks) {
            const { mesh, initialised } = voxels.chunkMeshes.get(chunk.id) ?? {}

            if (!mesh || !initialised) continue

            meshes.push({ chunk, mesh })
        }

        setMeshes(meshes)

        const unsubOnChunkMeshInitialised = voxels.onChunkMeshInitialised.add((chunk, mesh) => {
            setMeshes((prev) => [...prev, { chunk, mesh }])
        })

        return () => {
            setMeshes([])

            unsubOnChunkMeshInitialised()
        }
    }, [voxels])

    return (
        <group {...groupProps}>
            {meshes.map(({ chunk, mesh }) => (
                <Fragment key={chunk.id}>
                    <primitive object={mesh} />
                    {chunkHelper && <ChunkHelper chunk={chunk} />}
                </Fragment>
            ))}
        </group>
    )
}
