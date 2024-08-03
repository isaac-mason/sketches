import { $ } from 'bun'

// clean
console.log('cleaning up')

await $`rm -rf ./public/sketches-static`
await $`rm -rf ./src/generated`
await $`mkdir -p ./public/sketches-static`
await $`mkdir -p ./src/generated`

// build sketch meta
console.log('building sketches metadata')

const packages = (await $`ls ${import.meta.dir}/sketches/**/package.json | grep -v node_modules`)
    .text()
    .split('\n')
    .filter(Boolean)

const sketchesMeta = await Promise.all(
    packages.map(async (packagePath) => {
        const packageJson = await Bun.file(packagePath).json()

        let path = packagePath.replace(import.meta.dir, '')
        path = path.replace('/sketches/', '')
        path = path.replace('/package.json', '')

        const details = packageJson.sketch

        const hasCoverImage = await Bun.file(`${import.meta.dir}/sketches/${path}/cover.jpg`).exists()

        return {
            ...details,
            path,
            cover: hasCoverImage ? `${path}/cover.jpg` : undefined,
        }
    }),
)

// write sketch meta
await Bun.write('./src/generated/sketches.json', JSON.stringify(sketchesMeta))

// build sketches
for (const { path } of sketchesMeta) {
    await $`(cd ./sketches/${path} && yarn build)`
    await $`mkdir -p ${import.meta.dir}/public/sketches-static/${path}`
    await $`(cp -r ./sketches/${path}/dist/* ${import.meta.dir}/public/sketches-static/${path})`
}

// build container
await $`yarn build:container`