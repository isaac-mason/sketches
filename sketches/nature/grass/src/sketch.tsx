import { Canvas } from '@/common'
import forestEnvironment from '@pmndrs/assets/hdri/forest.exr'
import { CameraShake, Environment, OrbitControls, PerspectiveCamera, Sky, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import { useMemo } from 'react'
import { createNoise2D } from 'simplex-noise'
import * as THREE from 'three'
import cloudUrl from './cloud.jpg?url'
import grassBladeAlphaUrl from './grass-blade-alpha.jpg?url'

const GROUND_COLOR = '#001700'

const GRASS_BLADE_COLORS = [
    {
        base: new THREE.Color('#138510'),
        middle: new THREE.Color('#41980a'),
        tip: new THREE.Color('#a1d433'),
    },
    {
        base: new THREE.Color('#227d1f'),
        middle: new THREE.Color('#2da329'),
        tip: new THREE.Color('#6ebd2d'),
    },
]

const simplexNoise = createNoise2D()

const getGroundHeight = (x: number, z: number): number => {
    let y = 2 * simplexNoise(x / 50, z / 50)
    y += 4 * simplexNoise(x / 100, z / 100)
    y += 0.2 * simplexNoise(x / 10, z / 10)

    return y
}

const slerp = /* glsl */ `
    // https://en.wikipedia.org/wiki/Slerp
    vec4 slerp(vec4 v0, vec4 v1, float t) {
        // Only unit quaternions are valid rotations.
        // Normalize to avoid undefined behavior.
        normalize(v0);
        normalize(v1);
        
        // Compute the cosine of the angle between the two vectors.
        float dot_ = dot(v0, v1);
        
        // If the dot product is negative, slerp won't take
        // the shorter path. Note that v1 and -v1 are equivalent when
        // the negation is applied to all four components. Fix by 
        // reversing one quaternion.
        if (dot_ < 0.0) {
            v1 = -v1;
            dot_ = -dot_;
        }  
        
        const float DOT_THRESHOLD = 0.9995;
        if (dot_ > DOT_THRESHOLD) {
            // If the inputs are too close for comfort, linearly interpolate
            // and normalize the result.
            vec4 result = t*(v1 - v0) + v0;
            normalize(result);
            return result;
        }
        
        // Since dot is in range [0, DOT_THRESHOLD], acos is safe
        float theta_0 = acos(dot_);       // theta_0 = angle between input vectors
        float theta = theta_0*t;          // theta = angle between v0 and result
        float sin_theta = sin(theta);     // compute this value only once
        float sin_theta_0 = sin(theta_0); // compute this value only once
        float s0 = cos(theta) - dot_ * sin_theta / sin_theta_0;  // == sin(theta_0 - theta) / sin(theta_0)
        float s1 = sin_theta / sin_theta_0;
        return (s0 * v0) + (s1 * v1);
    }
    `

const snoise = /* glsl */ `
    // WEBGL-NOISE FROM https://github.com/stegu/webgl-noise
    // Description : Array and textureless GLSL 2D simplex noise function. Author : Ian McEwan, Ashima Arts. Maintainer : stegu Lastmod : 20110822 (ijm) License : Copyright (C) 2011 Ashima Arts. All rights reserved. Distributed under the MIT License. See LICENSE file. https://github.com/ashima/webgl-noise https://github.com/stegu/webgl-noise      
    vec3 mod289(vec3 x) {
        return x - floor(x * (1.0 / 289.0)) * 289.0;
    }
    vec2 mod289(vec2 x) {
        return x - floor(x * (1.0 / 289.0)) * 289.0;
    }
    vec3 permute(vec3 x) {
        return mod289(((x*34.0)+1.0)*x);
    }
    float snoise(vec2 v){
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1; i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m;
        m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
    }
`

const rotateVectorByQuaternion = /* glsl */ `
    // https://www.geeks3d.com/20141201/how-to-rotate-a-vertex-by-a-quaternion-in-glsl/
    vec3 rotateVectorByQuaternion( vec3 v, vec4 q){
        return 2.0 * cross(q.xyz, v * q.w + cross(q.xyz, v)) + v;
    }
`

const grassVertexShader = /* glsl */ `
    precision highp float;

    attribute vec3 baseColor;
    attribute vec3 middleColor;
    attribute vec3 tipColor;
    attribute vec3 offset;
    attribute vec4 orientation;
    attribute float halfRootAngleSin;
    attribute float halfRootAngleCos;
    attribute float stretch;

    uniform float uTime;
    uniform float uBladeHeight;

    varying vec2 vUv;
    varying vec3 vPosition;
    varying float vRelativeY;
    varying vec3 vBaseColor;
    varying vec3 vMiddleColor;
    varying vec3 vTipColor;
    
    ${snoise}
    
    ${rotateVectorByQuaternion}
    
    ${slerp}
    
    void main() {
        // Relative position of vertex along the mesh Y direction
        vRelativeY = position.y / float(uBladeHeight);
        
        // Get wind data from simplex noise 
        float adjustedTime = uTime * 0.1;
        float noise = 1.0 - (snoise(vec2((adjustedTime - offset.x / 50.0), (adjustedTime - offset.z / 50.0))));
        
        // Define the direction of an unbent blade of grass rotated around the Y axis
        vec4 direction = vec4(0.0, halfRootAngleSin, 0.0, halfRootAngleCos);
        
        // Interpolate between the unbent direction and the direction of growth calculated on the CPU. 
        // Using the relative location of the vertex along the Y axis as the weight, we get a smooth bend
        direction = slerp(direction, orientation, vRelativeY);
        vec3 localBentPosition = vec3(position.x, position.y + position.y * stretch, position.z);
        localBentPosition = rotateVectorByQuaternion(localBentPosition, direction);
        
        // Apply wind
        float halfAngle = noise * 0.15;
        localBentPosition = rotateVectorByQuaternion(localBentPosition, normalize(vec4(sin(halfAngle), 0.0, -sin(halfAngle), cos(halfAngle))));
        
        // Calculate final position of the vertex from the world offset and the above shenanigans 
        vec3 offsetPosition = offset + localBentPosition;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(offsetPosition, 1.0);

        // Varyings
        vUv = uv;
        vPosition = offsetPosition;
        vBaseColor = baseColor;
        vMiddleColor = middleColor;
        vTipColor = tipColor;
    }
`

const grassFragmentShader = /* glsl */ `
    precision highp float;

    uniform float uTime;
    uniform sampler2D uCloud;
    uniform sampler2D alphaMap;

    varying vec3 vBaseColor;
    varying vec3 vMiddleColor;
    varying vec3 vTipColor;
    varying vec3 vPosition;
    varying vec2 vUv;
    varying float vRelativeY;
    
    void main() {
        vec3 cloudPosition = vPosition;
        cloudPosition = cloudPosition / 90.0;
        cloudPosition.x += uTime * 0.05;
        cloudPosition.z += uTime * 0.04;

        vec3 mixOne = mix(vBaseColor, vMiddleColor, vRelativeY);
        vec3 mixTwo = mix(vMiddleColor, vTipColor, vRelativeY);
        vec3 bladeColor = mix(mixOne, mixTwo, vRelativeY);

        vec3 cloudSample = texture2D(uCloud, cloudPosition.xz).rgb;
        float cloudIntensity = 1.0 - cloudSample.r;

        bladeColor = mix(bladeColor * 0.7, bladeColor, cloudPosition.y);
        bladeColor = mix(bladeColor, bladeColor * 0.3, cloudIntensity);

        float alpha = texture2D(alphaMap, vUv).r;
        if (alpha < 0.15) discard;

        gl_FragColor = vec4(bladeColor, 1.0);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
    }
`

class GrassMaterial extends THREE.ShaderMaterial {
    constructor() {
        super({
            uniforms: {
                uTime: { value: 0 },
                uBladeHeight: { value: 0 },
                uCloud: { value: null },
                alphaMap: { value: null },
            },
            vertexShader: grassVertexShader,
            fragmentShader: grassFragmentShader,
            side: THREE.DoubleSide,
            wireframe: false,
            toneMapped: false,
        })
    }
}

type GrassGeometryOptions = {
    bladeWidth: number
    bladeHeight: number
    bladeJoints: number
    width: number
    instances: number
}

class GrassGeometry extends THREE.InstancedBufferGeometry {
    constructor({ bladeWidth, bladeHeight, bladeJoints, width, instances }: GrassGeometryOptions) {
        super()

        const baseGeometry = new THREE.PlaneGeometry(bladeWidth, bladeHeight, 1, bladeJoints).translate(0, bladeHeight / 2, 0)
        const attributes = this.computeGrassAttributes(instances, width)

        this.index = baseGeometry.index

        this.setAttribute('position', baseGeometry.attributes.position)
        this.setAttribute('uv', baseGeometry.attributes.uv)

        this.setAttribute('offset', new THREE.InstancedBufferAttribute(attributes.offsets, 3))
        this.setAttribute('orientation', new THREE.InstancedBufferAttribute(attributes.orientations, 4))
        this.setAttribute('stretch', new THREE.InstancedBufferAttribute(attributes.stretches, 1))
        this.setAttribute('halfRootAngleSin', new THREE.InstancedBufferAttribute(attributes.halfRootAngleSin, 1))
        this.setAttribute('halfRootAngleCos', new THREE.InstancedBufferAttribute(attributes.halfRootAngleCos, 1))
        this.setAttribute('baseColor', new THREE.InstancedBufferAttribute(attributes.baseColor, 3))
        this.setAttribute('middleColor', new THREE.InstancedBufferAttribute(attributes.middleColor, 3))
        this.setAttribute('tipColor', new THREE.InstancedBufferAttribute(attributes.tipColor, 3))

        this.computeBoundingSphere()
    }

    computeBoundingSphere() {
        const offsets = this.attributes.offset.array

        const position = new THREE.Vector3()
        const center = new THREE.Vector3(0, 0, 0)

        for (let i = 0; i < offsets.length; i += 3) {
            position.set(offsets[i], offsets[i + 1], offsets[i + 2])

            center.add(position)
        }

        center.divideScalar(offsets.length / 3)

        let maxRadiusSq = 0

        for (let i = 0; i < offsets.length; i += 3) {
            position.set(offsets[i], offsets[i + 1], offsets[i + 2])

            const distanceSq = center.distanceToSquared(position)

            if (distanceSq > maxRadiusSq) {
                maxRadiusSq = distanceSq
            }
        }

        const radius = Math.sqrt(maxRadiusSq)

        this.boundingSphere = new THREE.Sphere(center, radius)
    }

    computeGrassAttributes(instances: number, width: number) {
        const tipColor: number[] = []
        const middleColor: number[] = []
        const baseColor: number[] = []

        const offsets: number[] = []
        const orientations: number[] = []
        const stretches: number[] = []
        const halfRootAngleSin: number[] = []
        const halfRootAngleCos: number[] = []

        const tmpColor = new THREE.Color()

        const tmpQuaternion_0 = new THREE.Quaternion()
        const tmpQuaternion_1 = new THREE.Quaternion()

        // The min and max angle for the growth direction (in radians)
        const min = -0.25
        const max = 0.25

        // For each instance of the grass blade
        for (let i = 0; i < instances; i++) {
            /* Position */
            // Offset
            const offsetX = Math.random() * width - width / 2
            const offsetZ = Math.random() * width - width / 2
            const offsetY = getGroundHeight(offsetX, offsetZ)
            offsets.push(offsetX, offsetY, offsetZ)

            // Growth direction
            // Rotate around Y
            let angle = Math.PI - Math.random() * (2 * Math.PI)
            halfRootAngleSin.push(Math.sin(0.5 * angle))
            halfRootAngleCos.push(Math.cos(0.5 * angle))

            let rotationAxis = new THREE.Vector3(0, 1, 0)
            let x = rotationAxis.x * Math.sin(angle / 2.0)
            let y = rotationAxis.y * Math.sin(angle / 2.0)
            let z = rotationAxis.z * Math.sin(angle / 2.0)
            let w = Math.cos(angle / 2.0)
            tmpQuaternion_0.set(x, y, z, w).normalize()

            // Rotate around X
            angle = Math.random() * (max - min) + min
            rotationAxis = new THREE.Vector3(1, 0, 0)
            x = rotationAxis.x * Math.sin(angle / 2.0)
            y = rotationAxis.y * Math.sin(angle / 2.0)
            z = rotationAxis.z * Math.sin(angle / 2.0)
            w = Math.cos(angle / 2.0)
            tmpQuaternion_1.set(x, y, z, w).normalize()

            // Combine rotations to a single quaternion
            tmpQuaternion_0.multiplyQuaternions(tmpQuaternion_0, tmpQuaternion_1)

            // Rotate around Z
            angle = Math.random() * (max - min) + min
            rotationAxis = new THREE.Vector3(0, 0, 1)
            x = rotationAxis.x * Math.sin(angle / 2.0)
            y = rotationAxis.y * Math.sin(angle / 2.0)
            z = rotationAxis.z * Math.sin(angle / 2.0)
            w = Math.cos(angle / 2.0)
            tmpQuaternion_1.set(x, y, z, w).normalize()

            // Combine rotations to a single quaternion
            tmpQuaternion_0.multiplyQuaternions(tmpQuaternion_0, tmpQuaternion_1)

            orientations.push(tmpQuaternion_0.x, tmpQuaternion_0.y, tmpQuaternion_0.z, tmpQuaternion_0.w)

            /* Height */
            if (i < instances / 3) {
                stretches.push(Math.random() * 1.8)
            } else {
                stretches.push(Math.random())
            }

            /* Color */
            const bladeColor = GRASS_BLADE_COLORS[Math.floor(Math.random() * GRASS_BLADE_COLORS.length)]

            const base = tmpColor.copy(bladeColor.base)
            baseColor.push(base.r, base.g, base.b)

            const middle = tmpColor.copy(bladeColor.middle)
            middleColor.push(middle.r, middle.g, middle.b)

            const tip = tmpColor.copy(bladeColor.tip)
            tipColor.push(tip.r, tip.g, tip.b)
        }

        return {
            offsets: new Float32Array(offsets),
            orientations: new Float32Array(orientations),
            stretches: new Float32Array(stretches),
            halfRootAngleCos: new Float32Array(halfRootAngleCos),
            halfRootAngleSin: new Float32Array(halfRootAngleSin),
            baseColor: new Float32Array(baseColor),
            middleColor: new Float32Array(middleColor),
            tipColor: new Float32Array(tipColor),
        }
    }
}

class GroundGeometry extends THREE.PlaneGeometry {
    maxHeight: number

    constructor(width: number) {
        super(width, width, 32, 32)

        this.lookAt(new THREE.Vector3(0, 1, 0))

        let maxHeight = -Infinity

        for (let i = 0; i < this.attributes.position.array.length / 3; i++) {
            const x = this.attributes.position.array[i * 3 + 0]
            const z = this.attributes.position.array[i * 3 + 2]

            const y = getGroundHeight(x, z)
            this.attributes.position.array[i * 3 + 1] = y

            if (y > maxHeight) {
                maxHeight = y
            }
        }

        this.computeVertexNormals()

        this.maxHeight = maxHeight
    }
}

const Grass = () => {
    const cloudMap = useTexture(cloudUrl)
    cloudMap.wrapS = cloudMap.wrapT = THREE.RepeatWrapping

    const grassBladeAlphaMap = useTexture(grassBladeAlphaUrl)

    const { bladeWidth, bladeHeight, bladeJoints, wireframe, width, instances } = useControls('nature-grass', {
        bladeWidth: 0.12,
        bladeHeight: 1,
        bladeJoints: 5,
        width: 100,
        instances: 50000,
        wireframe: false,
    })

    const grassMaterial = useMemo(() => {
        const material = new GrassMaterial()

        material.uniforms.uCloud.value = cloudMap
        material.uniforms.alphaMap.value = grassBladeAlphaMap
        material.uniforms.uBladeHeight.value = bladeHeight
        material.wireframe = wireframe

        return material
    }, [cloudMap, grassBladeAlphaMap, bladeHeight, wireframe])

    const grassGeometry = useMemo(
        () => new GrassGeometry({ bladeWidth, bladeHeight, bladeJoints, width, instances }),
        [bladeWidth, bladeHeight, bladeJoints, width, instances],
    )

    const groundGeometry = useMemo(() => new GroundGeometry(width), [width])

    useFrame(({ clock: { elapsedTime } }) => {
        grassMaterial.uniforms.uTime.value = elapsedTime
    })

    return (
        <>
            <group>
                <mesh>
                    <primitive object={grassGeometry} />
                    <primitive object={grassMaterial} />
                </mesh>
                <mesh>
                    <primitive object={groundGeometry} />
                    <meshStandardMaterial color={GROUND_COLOR} />
                </mesh>
            </group>

            <PerspectiveCamera makeDefault position={[40, groundGeometry.maxHeight + 10, 40]} fov={50} />
        </>
    )
}

export function Sketch() {
    return (
        <Canvas>
            <Grass />

            <Sky sunPosition={[10, 5, 10]} rayleigh={0.3} />

            <Environment files={forestEnvironment} />

            <OrbitControls makeDefault autoRotate autoRotateSpeed={0.25} target={[0, 3, 0]} />
            <CameraShake maxRoll={0} maxPitch={0.05} maxYaw={0.05} />
        </Canvas>
    )
}

useTexture.preload(cloudUrl)
useTexture.preload(grassBladeAlphaUrl)
