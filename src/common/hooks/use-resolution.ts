import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export const useResolution = () => {
    const gl = useThree((s) => s.gl)

    const resolution = useRef({ value: new THREE.Vector2(gl.domElement.clientWidth, gl.domElement.clientHeight) })

    useEffect(() => {
        const onResize = () => {
            resolution.current.value.set(gl.domElement.clientWidth, gl.domElement.clientHeight)
        }

        window.addEventListener('resize', onResize)

        return () => {
            window.removeEventListener('resize', onResize)
        }
    }, [])

    return resolution
}
