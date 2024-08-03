export const getUrlSearchParams = () => new URLSearchParams(window.location.search)

export const getQueryParamOrDefault = (key: string, defaulValue: string, validate: (value: string) => boolean) => {
    const value = getUrlSearchParams().get(key)
    if (value && validate(value)) return value
    return defaulValue
}
