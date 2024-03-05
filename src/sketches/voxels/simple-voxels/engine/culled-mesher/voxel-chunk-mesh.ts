import { BufferGeometry, Mesh, MeshStandardMaterial } from 'three'

const voxelChunkShaderMaterial = new MeshStandardMaterial({
    vertexColors: true,
})

voxelChunkShaderMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = `
        attribute float ambientOcclusion;
        varying float vAmbientOcclusion;

        ${shader.vertexShader}
    `

    shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `
        #include <uv_vertex>

        vAmbientOcclusion = ambientOcclusion;
        `,
    )

    shader.fragmentShader = `
        varying float vAmbientOcclusion;

        ${shader.fragmentShader}
    `

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>

        float ambientOcclusion = 1.0 - (1.0 - vAmbientOcclusion) * 0.5;

        gl_FragColor = vec4(gl_FragColor.rgb * ambientOcclusion, 1.0);
    `,
    )
}

export class VoxelChunkMesh {
    geometry!: BufferGeometry

    material!: MeshStandardMaterial

    mesh!: Mesh

    initialised = false

    constructor() {
        this.geometry = new BufferGeometry()
        this.material = voxelChunkShaderMaterial
        this.mesh = new Mesh(this.geometry, this.material)
    }
}
