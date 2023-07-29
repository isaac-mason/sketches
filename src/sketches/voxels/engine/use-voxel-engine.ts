import { useFrame } from '@react-three/fiber'
import { World } from 'arancini'
import { createECS } from 'arancini/react'
import { useEffect, useMemo } from 'react'
import { UnionToIntersection, VoxelEnginePlugin, VoxelEnginePluginApi } from './voxel-engine-types'

export const useVoxelEngine = <Plugins extends Array<VoxelEnginePlugin>>(plugins: [...Plugins]) => {
    const { ecs, world, ...pluginApis } = useMemo(() => {
        const world = new World()
        const ecs = createECS(world)

        type WorldApi = UnionToIntersection<
            {
                [K in keyof Plugins]: VoxelEnginePluginApi<Plugins[K]>
            }[number]
        >

        let api: Partial<WorldApi> = {}

        // register all components first
        for (const plugin of plugins) {
            for (const component of plugin.components) {
                world.registerComponent(component)
            }
        }

        // register systems
        for (const plugin of plugins) {
            for (const system of plugin.systems) {
                world.registerSystem(system, { priority: system?.PRIORITY })
            }
        }

        // setup plugins
        for (const plugin of plugins) {
            const pluginApi = plugin.setup?.(world, ecs)

            if (pluginApi) {
                api = { ...api, ...pluginApi }
            }
        }

        return { ecs, world, ...(api as WorldApi) }
    }, [])

    useEffect(() => {
        world.init()

        return () => world.destroy()
    }, [ecs])

    useFrame((_, delta) => {
        if (!world.initialised) return

        world.update(delta)
    })

    return { ecs, world, ...pluginApis }
}
