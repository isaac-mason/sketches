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

const create = (): BuildContext => {
    return {
        logs: [],
        times: [],
        _startTimes: {},
    };
};

const start = (context: BuildContext, name: string): void => {
    context._startTimes[name] = performance.now();
};

const end = (context: BuildContext, name: string): void => {
    const now = performance.now();
    const start = context._startTimes[name];
    const duration = now - start;
    delete context._startTimes[name];
    context.times.push({ name, duration });
};

const info = (context: BuildContext, message: string): void => {
    context.logs.push({
        type: BuildContextLogType.INFO,
        message,
    });
};

const warn = (context: BuildContext, message: string): void => {
    context.logs.push({
        type: BuildContextLogType.WARNING,
        message,
    });
};

const error = (context: BuildContext, message: string): void => {
    context.logs.push({
        type: BuildContextLogType.ERROR,
        message,
    });
};

export const buildContext = {
    create,
    startTimer: start,
    endTimer: end,
    info,
    warn,
    error,
};
