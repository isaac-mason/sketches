import { MeshStandardMaterial } from 'three'

export const chunkMaterial = new MeshStandardMaterial({
    vertexColors: true,
})

chunkMaterial.onBeforeCompile = (shader) => {
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
