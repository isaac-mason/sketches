import { $ } from 'bun'
import * as path from 'path'
import { sketchesOrder } from '../sketches'

export const rootDirectory = path.resolve(`${import.meta.dir}`, '..')
export const containerAppDirectory = path.resolve(rootDirectory, 'container')

export type SketchMeta = {
    path: string
    title: string
    tags: string[]
    cover: string
    options?: {
        hidden?: boolean
        displayTitle?: boolean
    }
}

export const createSketchesMeta = async (): Promise<SketchMeta[]> => {
    const packages = (await $`ls sketches/**/package.json | grep -v node_modules`.cwd(rootDirectory).quiet())
        .text()
        .split('\n')
        .filter(Boolean)

    const sketchesMeta = (
        await Promise.all(
            packages.map(async (packagePath) => {
                const packageJson = await Bun.file(packagePath).json()

                const sketch = packageJson.sketch

                if (!sketch) return null

                const path = packagePath
                    .replace(rootDirectory, '')
                    .replace('sketches/', '')
                    .replace('/package.json', '')

                const hasCoverImage = await Bun.file(`${rootDirectory}/sketches/${path}/cover.png`).exists()

                const cover = hasCoverImage ? `/sketches-static/${path}/cover.png` : undefined

                return {
                    ...sketch,
                    path,
                    cover,
                }
            }),
        )
    )
        .filter(Boolean)
        .sort((a, b) => {
            // sort sketches first by sketchesOrder, then alphabetically
            const aIndex = sketchesOrder.indexOf(a.path)
            const bIndex = sketchesOrder.indexOf(b.path)

            if (aIndex === -1 && bIndex === -1) {
                return a.path.localeCompare(b.path)
            }

            if (aIndex === -1) {
                return 1
            }

            if (bIndex === -1) {
                return -1
            }

            return aIndex - bIndex
        })

    return sketchesMeta
}

export const writeSketchesMeta = async (sketchesMeta: SketchMeta[]) => {
    await $`rm -rf generated && mkdir -p generated`.cwd(containerAppDirectory)

    await Bun.write(`${containerAppDirectory}/generated/sketches.json`, JSON.stringify(sketchesMeta))
}

export const copySketchBuilds = async (sketchesMeta: SketchMeta[]) => {
    for (const { path } of sketchesMeta) {
        await $`mkdir -p ${containerAppDirectory}/public/sketches-static/${path}`
        await $`(cp -r sketches/${path}/dist/* container/public/sketches-static/${path})`.cwd(rootDirectory)
    }
}

export const copySketchCoverImages = async (sketchesMeta: SketchMeta[]) => {
    for (const { path, cover } of sketchesMeta) {
        if (cover) {
            await $`mkdir -p container/public/sketches-static/${path}`.cwd(rootDirectory)
            await $`(cp sketches/${path}/cover.png container/public/sketches-static/${path}/cover.png)`.cwd(rootDirectory)
        }
    }
}

export type GetFreePortOptions = {
    from?: number
    to?: number
}

export const getFreePort = async (options?: GetFreePortOptions) => {
    const { from = 1024, to = 65535 } = options || {}

    const usedPorts = (
        await $`lsof -i -P -n | grep LISTEN | awk '{print $9}' | grep -o '[0-9]*$' | sort -n | uniq`.quiet().text()
    ).split('\n')

    for (let port = from; port <= to; port++) {
        if (!usedPorts.includes(String(port))) {
            return port
        }
    }

    return undefined
}
