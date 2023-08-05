/**
 * @example
 * const inputSize = 3; // Number of sensor inputs
 * const hiddenSize = 4; // Number of neurons in the hidden layer
 * const outputSize = 2; // Number of output values (forward velocity and steering angle)
 *
 * const neuralNetwork = new NeuralNetwork(inputSize, hiddenSize, outputSize);
 * const sensorInputs = [0, 1, 2]; // Sample sensor inputs
 * const [forwardVelocity, steeringAngle] = neuralNetwork.predict(sensorInputs);
 * console.log(forwardVelocity, steeringAngle)
 * 
 * const child = neuralNetwork.createChild();
 * child.mutate();
 */
export class NeuralNetwork {
    private readonly inputSize: number
    private readonly hiddenSize: number
    private readonly outputSize: number
    private readonly weightsInputHidden: number[][]
    private readonly weightsHiddenOutput: number[][]

    constructor(inputSize: number, hiddenSize: number, outputSize: number) {
        this.inputSize = inputSize
        this.hiddenSize = hiddenSize
        this.outputSize = outputSize

        // Initialize weights with random values between -1 and 1
        this.weightsInputHidden = this.initializeWeights(inputSize, hiddenSize)
        this.weightsHiddenOutput = this.initializeWeights(hiddenSize, outputSize)
    }

    private initializeWeights(rows: number, cols: number): number[][] {
        const weights: number[][] = []
        for (let i = 0; i < rows; i++) {
            const row: number[] = []
            for (let j = 0; j < cols; j++) {
                row.push(this.randomWeight())
            }
            weights.push(row)
        }
        return weights
    }

    private randomWeight(): number {
        return Math.random() * 2 - 1 // Random value between -1 and 1
    }

    private dotProduct(a: number[], b: number[][]): number[] {
        const result: number[] = []
        for (let i = 0; i < b[0].length; i++) {
            let sum = 0
            for (let j = 0; j < a.length; j++) {
                sum += a[j] * b[j][i]
            }
            result.push(sum)
        }
        return result
    }

    private sigmoid(x: number): number {
        return 1 / (1 + Math.exp(-x))
    }

    predict(inputs: number[]): number[] {
        if (inputs.length !== this.inputSize) {
            throw new Error(`Input size must be ${this.inputSize}`)
        }

        // Calculate hidden layer values
        const hiddenLayer = this.dotProduct(inputs, this.weightsInputHidden)
        const hiddenLayerActivated = hiddenLayer.map(this.sigmoid)

        // Calculate output layer values
        const outputLayer = this.dotProduct(hiddenLayerActivated, this.weightsHiddenOutput)
        const outputLayerActivated = outputLayer.map(this.sigmoid)

        return outputLayerActivated
    }

    // New method to create a child neural network with inherited and random weights
    createChild(): NeuralNetwork {
        const child = new NeuralNetwork(this.inputSize, this.hiddenSize, this.outputSize)

        // Inherit weights from the current neural network
        for (let i = 0; i < this.hiddenSize; i++) {
            for (let j = 0; j < this.inputSize; j++) {
                child.weightsInputHidden[j][i] = this.weightsInputHidden[j][i]
            }
        }

        for (let i = 0; i < this.outputSize; i++) {
            for (let j = 0; j < this.hiddenSize; j++) {
                child.weightsHiddenOutput[j][i] = this.weightsHiddenOutput[j][i]
            }
        }

        return child
    }

    mutate(): void {
        // Mutation rate determines the amount of randomness
        const mutationRate = 0.1

        // Mutate the weightsInputHidden matrix
        for (let i = 0; i < this.hiddenSize; i++) {
            for (let j = 0; j < this.inputSize; j++) {
                if (Math.random() < mutationRate) {
                    // Add a small random value to the weight
                    this.weightsInputHidden[j][i] += this.randomWeight() * 0.5
                }
            }
        }

        // Mutate the weightsHiddenOutput matrix
        for (let i = 0; i < this.outputSize; i++) {
            for (let j = 0; j < this.hiddenSize; j++) {
                if (Math.random() < mutationRate) {
                    // Add a small random value to the weight
                    this.weightsHiddenOutput[j][i] += this.randomWeight() * 0.5
                }
            }
        }
    }
}
