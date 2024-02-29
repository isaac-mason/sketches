import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Canvas, useConst } from '../../../common'
import { World } from 'arancini'
import * as THREE from 'three'
import { useEffect, useMemo, useRef, useState } from 'react'

type Entity = {
    position?: [number, number, number]
    element?: number
    instancedMesh?: { index: number }
}

const world = new World<Entity>()

const sandQuery = world.query((e) => e.has('position', 'element'))

const elements = [
    {
        name: 'sand',
        color: 0xdeb887,
    },
]

const sandGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1)
const sandMaterial = new THREE.MeshLambertMaterial({ color: 0xdeb887 })

const _vector3 = new THREE.Vector3()
const _matrix4 = new THREE.Matrix4()
const _color = new THREE.Color()

const SandRenderer = () => {
    const instancedMesh = useMemo(() => {
        const mesh = new THREE.InstancedMesh(sandGeometry, sandMaterial, 1000)
        mesh.count = 0
        return mesh
    }, [])

    const freeIndices = useRef<number[]>([])

    const releaseIndex = (index: number) => {
        freeIndices.current.push(index)
    }

    const getIndex = () => {
        const existing = freeIndices.current.pop()
        
        if (existing !== undefined) {
            return existing
        }

        instancedMesh.count += 1

        return instancedMesh.count - 1
    }

    useEffect(sandQuery.onEntityAdded.add((e) => {
        const { position, element } = e

        const index = getIndex()

        instancedMesh.setMatrixAt(index, _matrix4.setPosition(_vector3.set(...position!)))
        instancedMesh.setColorAt(index, _color.setHex(elements[element!].color))

        instancedMesh.instanceMatrix.needsUpdate = true

        world.add(e, 'instancedMesh', { index })
    }), [])

    useEffect(sandQuery.onEntityRemoved.add((e) => {
        const { instancedMesh } = e

        releaseIndex(instancedMesh!.index)

        instancedMesh!.index = -1
    }), [])

    return (
        <primitive object={instancedMesh} />
    )
}

export default function Sketch() {
    return (
        <Canvas>
            <SandRenderer />

            <OrbitControls makeDefault />
            <PerspectiveCamera makeDefault near={0.1} far={1000} position={[0, 0, 2]} />
        </Canvas>
    )
}
