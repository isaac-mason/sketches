type InstructionsProps = {
    children: React.ReactNode
}

const INSTRUCTIONS_STYLES: React.CSSProperties = {
    color: 'white',
    fontSize: '1.2em',
    left: '50px',
    position: 'absolute',
    bottom: '30px',
    lineHeight: '1.5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    fontFamily: 'monospace',
    whiteSpace: 'pre',
    textShadow: '1px 1px 1px black',
}

export const Instructions = ({ children }: InstructionsProps) => {
    return <div style={INSTRUCTIONS_STYLES}>{children}</div>
}
