import { useState } from 'react'
import styled from 'styled-components'

const FullscreenLayout = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    width: 100%;
`

export type InteractionBarrierProps = {
    children: React.ReactNode
}

export const InteractionBarrier = ({ children }: InteractionBarrierProps) => {
    const [clicked, setClicked] = useState(false)
    const onClick = () => setClicked(true)

    if (!clicked)
        return (
            <FullscreenLayout>
                <button onClick={onClick}>Click to start</button>
            </FullscreenLayout>
        )

    return children
}
