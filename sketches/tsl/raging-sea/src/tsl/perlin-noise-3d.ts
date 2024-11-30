import { Node, ShaderNodeObject, add, dot, float, floor, fract, mix, mul, step, Fn, vec3, vec4 } from 'three/tsl'

const permute = Fn((input: { x: ShaderNodeObject<Node> }) => {
    return fract(add(mul(input.x, 34), 1).mul(input.x).div(289)).mul(289)
})

const taylorInvSqrt = Fn((input: { r: ShaderNodeObject<Node> }) => {
    return float(1.79284291400159).sub(float(0.85373472095314).mul(input.r))
})

const fade = Fn((input: { t: ShaderNodeObject<Node> }) => {
    const t = input.t
    return t
        .mul(t)
        .mul(t)
        .mul(t.mul(t.mul(6).sub(15)).add(10))
})

export const perlinNoise3d = Fn(({ position }: { position: ShaderNodeObject<Node> }) => {
    const Pi0 = vec3(position.floor())
    const Pi1 = Pi0.add(vec3(1))
    const Pf0 = fract(position)
    const Pf1 = Pf0.sub(vec3(1))

    const ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x)
    const iy = vec4(Pi0.y, Pi0.y, Pi1.y, Pi1.y)
    const iz0 = vec4(Pi0.z, Pi0.z, Pi0.z, Pi0.z)
    const iz1 = vec4(Pi1.z, Pi1.z, Pi1.z, Pi1.z)

    const ixy = permute({ x: permute({ x: ix }).add(iy) })
    const ixy0 = permute({ x: ixy.add(iz0) })
    const ixy1 = permute({ x: ixy.add(iz1) })

    let gx0: ShaderNodeObject<Node> = ixy0.div(7)
    let gy0 = fract(floor(gx0).div(7)).sub(0.5)
    gx0 = fract(gx0)
    const gz0 = vec4(0.5).sub(gx0.abs()).sub(gy0.abs())
    const sz0 = step(gz0, vec4(0))
    gx0 = gx0.sub(sz0.mul(step(vec4(0), gx0).sub(0.5)))
    gy0 = gy0.sub(sz0.mul(step(vec4(0), gy0).sub(0.5)))

    let gx1: ShaderNodeObject<Node> = ixy1.div(7)
    let gy1 = fract(floor(gx1).div(7)).sub(0.5)
    gx1 = fract(gx1)
    const gz1 = vec4(0.5).sub(gx1.abs()).sub(gy1.abs())
    const sz1 = step(gz1, vec4(0))
    gx1 = gx1.sub(sz1.mul(step(vec4(0), gx1).sub(0.5)))
    gy1 = gy1.sub(sz1.mul(step(vec4(0), gy1).sub(0.5)))

    let g000 = vec3(gx0.x, gy0.x, gz0.x)
    let g100 = vec3(gx0.y, gy0.y, gz0.y)
    let g010 = vec3(gx0.z, gy0.z, gz0.z)
    let g110 = vec3(gx0.w, gy0.w, gz0.w)
    let g001 = vec3(gx1.x, gy1.x, gz1.x)
    let g101 = vec3(gx1.y, gy1.y, gz1.y)
    let g011 = vec3(gx1.z, gy1.z, gz1.z)
    let g111 = vec3(gx1.w, gy1.w, gz1.w)

    const norm0 = taylorInvSqrt({ r: vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)) })
    g000 = g000.mul(norm0.x)
    g010 = g010.mul(norm0.y)
    g100 = g100.mul(norm0.z)
    g110 = g110.mul(norm0.w)

    const norm1 = taylorInvSqrt({ r: vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)) })
    g001 = g001.mul(norm1.x)
    g011 = g011.mul(norm1.y)
    g101 = g101.mul(norm1.z)
    g111 = g111.mul(norm1.w)

    const n000 = dot(g000, Pf0)
    const n100 = dot(g100, vec3(Pf1.x, Pf0.y, Pf0.z))
    const n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z))
    const n110 = dot(g110, vec3(Pf1.xy, Pf0.z))
    const n001 = dot(g001, vec3(Pf0.xy, Pf1.z))
    const n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z))
    const n011 = dot(g011, vec3(Pf0.x, Pf1.yz))
    const n111 = dot(g111, Pf1)

    const fade_xyz = fade({ t: Pf0 })
    const n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z)
    const n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y)
    const n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x)

    return float(2.2).mul(n_xyz)
})
