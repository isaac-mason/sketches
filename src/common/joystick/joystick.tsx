import nipplejs from 'nipplejs'
import { useEffect, useRef } from 'react'
import styled from 'styled-components'
import { create } from 'zustand'

const JoystickZone = styled.div`
    position: absolute;
    z-index: 1;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 100%;
    left: 0;
`

type JoystickState = {
    vector: [number, number]
}

export const createJoystick = () => {
    const useJoystick = create<JoystickState & { set: (state: Partial<JoystickState>) => void }>((set) => ({
        vector: [0, 0],
        set,
    }))

    const Joystick = () => {
        const ref = useRef<HTMLDivElement>(null!)

        useEffect(() => {
            const joystickManager = nipplejs.create({
                zone: ref.current,
                size: 120,
                color: 'orange',
            })

            joystickManager.on('start', () => {
                useJoystick.setState({ vector: [0, 0] })
            })

            joystickManager.on('move', (_, data) => {
                useJoystick.setState({ vector: [data.vector.x, data.vector.y] })
            })

            joystickManager.on('end', () => {
                useJoystick.setState({ vector: [0, 0] })
            })

            return () => {
                joystickManager.destroy()
            }
        })

        return <JoystickZone ref={ref} id="joystick" />
    }

    return { Joystick, useJoystick, getJoystickState: () => useJoystick.getState() }
}
