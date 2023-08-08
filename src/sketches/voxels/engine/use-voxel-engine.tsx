import { useFrame } from '@react-three/fiber'
import { World } from 'arancini'
import { createECS } from 'arancini/react'
import { createContext, useContext, useEffect, useMemo } from 'react'
import { VoxelEnginePlugin, VoxelEnginePluginsApi } from './voxel-engine-types'

const ApiContext = createContext<unknown>(null!)

export const useVoxelEngineApi = <Plugins extends Array<VoxelEnginePlugin>>() => {
    return useContext(ApiContext) as VoxelEnginePluginsApi<Plugins> & {
        world: World
        ecs: ReturnType<typeof createECS>
    }
}

export const useVoxelEngine = <Plugins extends Array<VoxelEnginePlugin>, Api = VoxelEnginePluginsApi<Plugins>>({
    plugins,
    paused,
}: {
    plugins: [...Plugins]
    paused?: boolean
}) => {
    const api = useMemo(() => {
        const world = new World()
        const ecs = createECS(world)

        let pluginApis: Partial<Api> = {}

        for (const plugin of plugins) {
            if (!plugin.components) continue
            for (const component of plugin.components) {
                world.registerComponent(component)
            }
        }

        for (const plugin of plugins) {
            if (!plugin.systems) continue
            for (const system of plugin.systems) {
                world.registerSystem(system, { priority: system?.PRIORITY })
            }
        }

        for (const plugin of plugins) {
            const pluginApi = plugin.setup?.(world, ecs)

            if (pluginApi) {
                pluginApis = { ...pluginApis, ...pluginApi }
            }
        }

        world.init()

        const api = { ecs, world, ...(pluginApis as Api) }

        return api
    }, [])

    const { world } = api

    useEffect(() => {
        if (!world.initialised) world.init()

        return () => {
            world.destroy()
        }
    }, [])

    useFrame((_, delta) => {
        if (!world.initialised || paused) return

        world.update(delta)
    })

    type VoxelEngineProps = {
        children: React.ReactNode
    }

    const VoxelEngineProvider = ({ children }: VoxelEngineProps) => {
        return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
    }

    return { ...api, VoxelEngineProvider }
}
