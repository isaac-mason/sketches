import { useFrame } from '@react-three/fiber'
import {
    ReactNode,
    createContext,
    forwardRef,
    useContext,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react'
import { Crowd, CrowdAgent, CrowdAgentParams, NavMesh, SoloNavMeshGeneratorConfig, init, vec3 } from 'recast-navigation'
import { NavMeshHelper, threeToSoloNavMesh } from 'recast-navigation/three'
import { suspend } from 'suspend-react'
import { Group, Mesh, MeshStandardMaterial, Vector3Tuple } from 'three'

type AIContextType = {
    navMesh: NavMesh | undefined
    crowd: Crowd | undefined
    active: { current: boolean }
}

const aiContext = createContext<AIContextType>(null!)

export const useAI = () => useContext(aiContext)

export type AIProps = {
    children: ReactNode
    debug?: boolean
    generatorConfig?: Partial<SoloNavMeshGeneratorConfig>
}

export const AI = ({ children, debug, generatorConfig }: AIProps) => {
    suspend(() => init(), [])

    const active = useRef(false)

    const [navMesh, setNavMesh] = useState<NavMesh | undefined>()
    const [crowd, setCrowd] = useState<Crowd | undefined>()

    const group = useRef<Group>(null!)

    useEffect(() => {
        const meshes: Mesh[] = []

        group.current.traverse((child) => {
            if (child.userData.traversable) {
                child.traverse((child) => {
                    if (child instanceof Mesh) {
                        meshes.push(child)
                    }
                })
            }
        })

        if (meshes.length === 0) return

        const { success, navMesh } = threeToSoloNavMesh(meshes, generatorConfig)

        if (!success) return

        const crowd = new Crowd({
            maxAgents: 1000,
            maxAgentRadius: 0.5,
            navMesh,
        })

        setNavMesh(navMesh)
        setCrowd(crowd)

        active.current = true

        return () => {
            active.current = false

            setCrowd(undefined)
            setNavMesh(undefined)
            crowd.destroy()
            navMesh.destroy()
        }
    }, [])

    useFrame((_, delta) => {
        if (!crowd || !active.current) return

        crowd.update(Math.min(delta, 0.1))
    })

    const navMeshHelper = useMemo(() => {
        if (!navMesh || !debug) return null

        return new NavMeshHelper({
            navMesh,
            navMeshMaterial: new MeshStandardMaterial({
                color: 'orange',
                opacity: 0.5,
                transparent: true,
                depthTest: false,
            }),
        })
    }, [navMesh, debug])

    const context = {
        navMesh,
        crowd,
        active,
    }

    return (
        <aiContext.Provider value={context}>
            <group ref={group}>{children}</group>
            {navMeshHelper && <primitive object={navMeshHelper} />}
        </aiContext.Provider>
    )
}

export const Traversable = ({ children }: { children: ReactNode }) => {
    return <object3D userData={{ traversable: true }}>{children}</object3D>
}

export type AgentProps = {
    initialPosition: Vector3Tuple
} & Partial<CrowdAgentParams>

export const Agent = forwardRef<CrowdAgent | undefined, AgentProps>(({ initialPosition, ...crowdAgentParams }, ref) => {
    const { navMesh, crowd, active } = useAI()

    const [agent, setAgent] = useState<CrowdAgent | undefined>()

    useImperativeHandle(ref, () => agent, [agent])

    useEffect(() => {
        if (!navMesh || !crowd || !active.current) return

        const agent = crowd.addAgent(vec3.fromArray(initialPosition), {
            height: 1,
            radius: 0.5,
            ...(crowdAgentParams ?? {}),
        })

        setAgent(agent)

        return () => {
            setAgent(undefined)

            crowd.removeAgent(agent)
        }
    }, [crowd])

    return null
})
