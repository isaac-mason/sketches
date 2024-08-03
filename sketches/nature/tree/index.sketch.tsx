import { WebGPUCanvas } from '@/common'
import { OrbitControls } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

type TreeNode = {
    position: THREE.Vector3
    direction: THREE.Vector3
    depth: number
    parent?: TreeNode
    children: TreeNode[]
}

const randomFloat = (min: number, max: number) => Math.random() * (max - min) + min

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min

type TreeProps = {
    splits?: number
    minBranchSplit?: number
    maxBranchSplit?: number
    maxBranchLength?: number
    branchDepthLengthMultiplier?: number
}

const Tree = ({
    splits = 3,
    minBranchSplit = 2,
    maxBranchSplit = 3,
    maxBranchLength = 1,
    branchDepthLengthMultiplier = 0.2,
}: TreeProps) => {
    const { branches, splitPoints } = useMemo(() => {
        const trunk: TreeNode = {
            position: new THREE.Vector3(0, 0, 0),
            direction: new THREE.Vector3(0, 1, 0),
            depth: 0,
            children: [],
        }

        const queue = [trunk]

        while (queue.length > 0) {
            const branch = queue.shift() as TreeNode

            if (branch.depth > splits) {
                continue
            }

            const numChildren = branch.depth === 0 ? 1 : randomInt(minBranchSplit, maxBranchSplit)

            for (let i = 0; i < numChildren; i++) {
                const direction = branch.direction.clone()

                const horizontal = branch.depth === 0 ? 0.1 : 2

                // Adjust vertical bias based on depth to encourage drooping
                const droopFactor = 0.05 * branch.depth // Increase droop as depth increases
                const verticalMax = 1 - droopFactor // Decrease verticalMax to make downward growth more likely
                const verticalMin = branch.depth === 0 ? 0.5 : -0.2 - droopFactor // Increase verticalMin (less negative) to encourage drooping

                direction.x += randomFloat(-horizontal, horizontal)
                direction.y += randomFloat(verticalMin, verticalMax)
                direction.z += randomFloat(-horizontal, horizontal)

                // Apply bias for moving out from the root
                const biasFactor = 1 + branch.depth * 0.1 // Increase bias with depth
                const outwardBias = new THREE.Vector3(
                    randomFloat(-horizontal, horizontal) * biasFactor,
                    randomFloat(verticalMin, verticalMax),
                    randomFloat(-horizontal, horizontal) * biasFactor,
                )

                // Apply bias for moving away from other child branches
                branch.children.forEach((child) => {
                    const distance = branch.position.distanceTo(child.position)
                    const directionToChild = child.position.clone().sub(branch.position).normalize()
                    const bias = directionToChild.clone().multiplyScalar(1 / distance)
                    outwardBias.add(bias)
                })

                direction.add(outwardBias)

                direction.normalize()

                direction.multiplyScalar(maxBranchLength - branch.depth * branchDepthLengthMultiplier)

                const position = branch.position.clone().add(direction)

                const child = {
                    position,
                    direction,
                    depth: branch.depth + 1,
                    children: [],
                    parent: branch,
                }

                branch.children.push(child)

                queue.push(child)
            }
        }

        const splitPoints: THREE.Vector3[] = []

        const branches: {
            from: THREE.Vector3
            to: THREE.Vector3
        }[] = []

        const getBranches = (branch: TreeNode) => {
            if (branch.parent) {
                branches.push({
                    from: branch.parent.position,
                    to: branch.position,
                })
            }

            branch.children.forEach((child) => {
                getBranches(child)
            })
        }

        const getSplitPoints = (branch: TreeNode) => {
            branch.children.forEach((child) => {
                splitPoints.push(child.position)

                getSplitPoints(child)
            })
        }

        getBranches(trunk)
        getSplitPoints(trunk)

        // console.log('trunk', trunk)
        // console.log('branches', branches)
        // console.log('splitPoints', splitPoints)

        return { branches, splitPoints }
    }, [])

    return (
        <group>
            {splitPoints.map((point) => {
                const key = point.toArray().join(',')

                return (
                    <mesh position={point} key={key}>
                        <sphereGeometry args={[0.1, 8, 8]} />
                        <meshBasicMaterial color="red" />
                    </mesh>
                )
            })}

            {branches.map(({ from, to }) => {
                const key = [from, to].map((v) => v.toArray().join(',')).join(' ')

                const geometry = new THREE.CylinderGeometry(0.05, 0.05, from.distanceTo(to), 8, 1, false)

                const center = from.clone().add(to).divideScalar(2)

                const quaternion = new THREE.Quaternion().setFromUnitVectors(
                    new THREE.Vector3(0, 1, 0),
                    to.clone().sub(from).normalize(),
                )

                return (
                    <mesh key={key} position={center} quaternion={quaternion}>
                        <primitive object={geometry} />
                        <meshBasicMaterial color="green" />
                    </mesh>
                )
            })}
        </group>
    )
}

export default function Sketch() {
    return (
        <WebGPUCanvas>
            <Tree />

            <OrbitControls makeDefault />
        </WebGPUCanvas>
    )
}