import styled from 'styled-components'
import { useScreenshot } from '../../screenshot'

const InstructionsWrapper = styled.div`
    color: white;
    font-size: 1.2em;
    left: 50px;
    position: absolute;
    bottom: 60px;
    line-height: 1.5;
    display: flex;
    align-items: center;
    justify-content: flex-end;

    pre {
        margin: 0;
    }
`

type InstructionsProps = {
    children: React.ReactNode
}

export const Instructions = ({ children }: InstructionsProps) => {
    const { screenshotMode } = useScreenshot()

    if (screenshotMode) return null

    return (
        <InstructionsWrapper>
            <pre>{children}</pre>
        </InstructionsWrapper>
    )
}
