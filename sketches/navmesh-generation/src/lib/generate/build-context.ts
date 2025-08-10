export enum BuildContextLogType {
    INFO = 0,
    WARNING = 1,
    ERROR = 2,
}

export type BuildContextLog = {
    type: BuildContextLogType;
    message: string;
}

export type BuildContextTime = {
    name: string;
    duration: number;
}

export type BuildContext = {
    logs: BuildContextLog[];
    times: BuildContextTime[];
    _startTimes: Record<string, number>;
}

export const create = (): BuildContext => {
    return {
        logs: [],
        times: [],
        _startTimes: {},
    };
};

export const startTimer = (context: BuildContext, name: string): void => {
    context._startTimes[name] = performance.now();
};

export const endTimer = (context: BuildContext, name: string): void => {
    const now = performance.now();
    const start = context._startTimes[name];
    const duration = now - start;
    delete context._startTimes[name];
    context.times.push({ name, duration });
};
