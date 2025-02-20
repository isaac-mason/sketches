export const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const image = new Image()
        image.src = url
        image.onload = () => {
            resolve(image)
        }
        image.onerror = (error) => {
            reject(error)
        }
    })
}
