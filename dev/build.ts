import { $ } from 'bun'
import {
    containerAppDirectory,
    copySketchBuilds,
    copySketchCoverImages,
    createSketchesMeta,
    resolvePromisesConcurrently,
    rootDirectory,
    writeSketchesMeta,
} from './utils'

console.log('creating sketches metadata')

const sketchesMeta = await createSketchesMeta()

console.log('writing sketches meta')

writeSketchesMeta(sketchesMeta)

console.log('building sketches')

const buildConcurrency = 5

await resolvePromisesConcurrently(buildConcurrency, sketchesMeta, async ({ path }) => {
    console.log(`\n\nbuilding ${path} ...\n`)

    await $`(cd sketches/${path} && yarn build)`.cwd(rootDirectory)
})

console.log('copying sketch builds to sketches-static')

await $`rm -rf container/public/sketches-static`.cwd(rootDirectory)

await copySketchBuilds(sketchesMeta)

await copySketchCoverImages(sketchesMeta)

console.log('building container')

await $`yarn build`.cwd(containerAppDirectory)