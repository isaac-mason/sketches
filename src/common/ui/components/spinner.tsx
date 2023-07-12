import styled, { keyframes } from 'styled-components'

const SpinnerKeyframes = keyframes`
from {
    transform: rotate(0deg);
}
to {
    transform: rotate(360deg);
}
`

const CenterLayout = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    width: 100%;
`

const SpinnerDiv = styled.div`
    width: 50px;
    height: 50px;
    border: 3px solid rgba(0, 0, 0, 0);
    border-top: 3px solid #fff;
    border-radius: 50%;
    animation: ${SpinnerKeyframes} 1s ease infinite;
`

export const Spinner = () => (
    <CenterLayout>
        <SpinnerDiv />
    </CenterLayout>
)
