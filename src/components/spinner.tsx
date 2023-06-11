import styled, { keyframes } from 'styled-components'

const SpinnerKeyframes = keyframes`
from {
    transform: rotate(0deg);
}
to {
    transform: rotate(360deg);
}
`

export const Spinner = styled.div`
    position: fixed;
    left: calc(50% - 25px);
    top: calc(50vh - 50px);
    width: 50px;
    height: 50px;
    border: 3px solid rgba(0, 0, 0, 0);
    border-top: 3px solid #fff;
    border-radius: 50%;
    animation: ${SpinnerKeyframes} 1s ease infinite;
`
