export type FixedTimeStepProps = {
    maxSubSteps?: number
    timeStep?: number
    step: () => void
}

export class FixedTimeStep {
    paused = false

    private step: () => void

    private timeStepMs: number

    private maxSubSteps: number

    private time = 0

    private lastTime = 0

    private accumulator = 0

    constructor({ maxSubSteps = 10, timeStep = 1 / 60, step }: FixedTimeStepProps) {
        this.step = step
        this.timeStepMs = timeStep * 1000
        this.maxSubSteps = maxSubSteps
    }

    update(delta: number): void {
        const nowTime = this.time + (this.paused ? 0 : delta * 1000)
        this.time = nowTime

        const timeSinceLast = nowTime - this.lastTime
        this.lastTime = nowTime
        this.accumulator += timeSinceLast

        if (!this.paused) {
            let subSteps = 0
            while (this.accumulator >= this.timeStepMs && subSteps < this.maxSubSteps) {
                this.step()

                subSteps++
                this.accumulator -= this.timeStepMs
            }
        }
    }
}
