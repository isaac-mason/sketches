import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { useNavigation } from './navigation'
import { Vector3Tuple } from 'three'
import { CrowdAgent, CrowdAgentParams, vec3 } from 'recast-navigation'

export type AgentProps = {
    initialPosition: Vector3Tuple
} & Partial<CrowdAgentParams>

export const Agent = forwardRef<CrowdAgent | undefined, AgentProps>(({ initialPosition, ...crowdAgentParams }, ref) => {
    const { crowd } = useNavigation()

    const [agent, setAgent] = useState<CrowdAgent | undefined>()

    useImperativeHandle(ref, () => agent, [agent])

    useEffect(() => {
        if (!crowd) return

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
