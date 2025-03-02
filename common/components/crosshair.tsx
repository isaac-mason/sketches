const CROSSHAIR_STYLES: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    transform: 'translate3d(-50%, -50%, 0)',
    border: '2px solid white',
    zIndex: 100,
}

export const Crosshair = () => {
    return <div style={CROSSHAIR_STYLES} />
}
