import { useFrame } from '@react-three/fiber'
import { World } from 'arancini'
import { ReactAPI, createReactAPI } from 'arancini/react'
import { Executor } from 'arancini/systems'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { VoxelEngineEntity, VoxelEnginePlugin, VoxelEnginePluginsApi } from './voxel-engine-types'

const voxelEngineContext = createContext<unknown>(null!)

type VoxelEngineContext<Plugins extends ReadonlyArray<VoxelEnginePlugin<any>>> = VoxelEnginePluginsApi<Plugins> & {
    world: World<VoxelEngineEntity<Plugins>>
    executor: Executor<VoxelEngineEntity<Plugins>>
    react: ReactAPI<VoxelEngineEntity<Plugins>>
    step: (delta: number) => void
}

export const useVoxelEngine = <Plugins extends ReadonlyArray<VoxelEnginePlugin<any>>>() => {
    return useContext(voxelEngineContext) as VoxelEngineContext<Plugins>
}

export const createVoxelEngine = <Plugins extends ReadonlyArray<VoxelEnginePlugin<any>>>(plugins: Plugins) => {
    type Entity = VoxelEngineEntity<Plugins>
    type Api = VoxelEnginePluginsApi<Plugins>

    const VoxelEngine = ({ children }: { children: React.ReactNode }) => {
        const [engine, setEngine] = useState<VoxelEngineContext<Plugins>>(null!)

        const initialised = useRef(false)

        const init = () => {
            initialised.current = true

            const world = new World<Entity>()
            const executor = new Executor(world)
            const react = createReactAPI(world)

            for (const plugin of plugins) {
                if (!plugin.systems) continue
                for (const system of plugin.systems) {
                    executor.add(system, { priority: system?.PRIORITY })
                }
            }

            let voxelEngine: Partial<Api> = {}

            for (const plugin of plugins) {
                const pluginApi = plugin.setup?.(world, executor, react)

                if (pluginApi) {
                    voxelEngine = { ...voxelEngine, ...pluginApi }
                }
            }

            voxelEngine = { ...voxelEngine, world, executor, react }

            setEngine(voxelEngine as VoxelEngineContext<Plugins>)

            executor.init()
        }

        if (!initialised.current) {
            init()
        }

        useEffect(() => {
            if (!initialised.current) {
                init()
            }

            return () => {
                engine?.world.clear()
                initialised.current = false
            }
        }, [])

        const update = (delta: number) => {
            if (!engine?.executor.initialised) return

            engine.executor.update(delta)
        }

        useFrame((_, delta) => {
            update(delta)
        })

        return (
            <voxelEngineContext.Provider
                value={{
                    ...engine,
                    step: update,
                }}
            >
                {children}
            </voxelEngineContext.Provider>
        )
    }

    return {
        VoxelEngine,
        useVoxelEngine: useVoxelEngine as () => VoxelEngineContext<Plugins>,
    }
}
