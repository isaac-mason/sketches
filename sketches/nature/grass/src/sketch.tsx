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
import { GrassGeometry, GrassMaterial } from './grass'
import { GroundGeometry } from './ground'

const GROUND_COLOR = '#001700'

const simplexNoise = createNoise2D()

const getGroundHeight = (x: number, z: number): number => {
    let y = 2 * simplexNoise(x / 50, z / 50)
    y += 4 * simplexNoise(x / 100, z / 100)
    y += 0.2 * simplexNoise(x / 10, z / 10)

    return y
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
        () => new GrassGeometry({ bladeWidth, bladeHeight, bladeJoints, width, instances, getGroundHeight }),
        [bladeWidth, bladeHeight, bladeJoints, width, instances],
    )

    const groundGeometry = useMemo(() => new GroundGeometry({ width, getGroundHeight }), [width])

    useFrame(({ clock: { elapsedTime } }) => {
        grassMaterial.uniforms.uTime.value = elapsedTime
    })

    return (
        <>
            <mesh>
                <primitive object={grassGeometry} />
                <primitive object={grassMaterial} />
            </mesh>
            <mesh>
                <primitive object={groundGeometry} />
                <meshStandardMaterial color={GROUND_COLOR} />
            </mesh>

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
