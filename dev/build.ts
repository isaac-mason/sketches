import { $ } from 'bun'
import {
    containerAppDirectory,
    copySketchBuilds,
    copySketchCoverImages,
    createSketchesMeta,
    rootDirectory,
    writeSketchesMeta,
} from './utils'

try {
    console.log('⏳ creating sketches metadata')
    const sketchesMeta = await createSketchesMeta()

    console.log('⏳ writing sketches meta')
    writeSketchesMeta(sketchesMeta)

    console.log('⏳ building sketches')
    for (const { path } of sketchesMeta) {
        console.log(`\n⏳ building sketch: ${path}\n`)
        await $`(cd sketches/${path} && yarn build)`.cwd(rootDirectory)
    }

    console.log('⏳ copying sketch builds to sketches-static')
    await $`rm -rf container/public/sketches-static`.cwd(rootDirectory)
    await copySketchBuilds(sketchesMeta)
    await copySketchCoverImages(sketchesMeta)

    console.log('⏳ building container app\n')
    await $`yarn build`.cwd(containerAppDirectory)

    console.log('\n\n✅ build succeded')
} catch (e) {
    console.error('\n\n❌ build failed')
    console.error(e)
    process.exit(1)
}
