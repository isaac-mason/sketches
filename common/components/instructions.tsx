import styled from 'styled-components'

const InstructionsWrapper = styled.div`
    color: white;
    font-size: 1.2em;
    left: 50px;
    position: absolute;
    bottom: 30px;
    line-height: 1.5;
    display: flex;
    align-items: center;
    justify-content: flex-end;

    display: block;
    font-family: monospace;
    white-space: pre;

    text-shadow: 1px 1px 1px black;
`

type InstructionsProps = {
    children: React.ReactNode
}

export const Instructions = ({ children }: InstructionsProps) => {
    return <InstructionsWrapper>{children}</InstructionsWrapper>
}
