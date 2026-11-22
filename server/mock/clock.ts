import { istMidnightUtcMs } from "@core/domain/time";

export interface MockClock {
  now: () => Date;
  speed: () => number;
  setSpeed: (factor: number) => void;
  jumpTo: (minutesOfDay: number) => void;
  reset: () => void;
  state: () => ClockState;
  setState: (state: ClockState) => void;
}

export interface ClockState {
  anchorReal: number;
  anchorVirtual: number;
  factor: number;
}

export interface MockClockOptions {
  startMinutesOfDay?: number;
  realNowMs?: () => number;
}

export function createMockClock(options: MockClockOptions = {}): MockClock {
  const startMinutes = options.startMinutesOfDay ?? 10 * 60 + 10;
  const realNow = options.realNowMs ?? (() => Date.now());
  let midnightMs = istMidnightUtcMs(new Date(realNow()));

  let anchorReal = realNow();
  let anchorVirtual = midnightMs + startMinutes * 60_000;
  let factor = 1;

  const virtualNowMs = () => anchorVirtual + (realNow() - anchorReal) * factor;

  const reanchor = (virtualMs: number) => {
    anchorReal = realNow();
    anchorVirtual = virtualMs;
  };

  return {
    now: () => new Date(virtualNowMs()),
    speed: () => factor,
    setSpeed: (next) => {
      reanchor(virtualNowMs());
      factor = Math.max(next, 0);
    },
    jumpTo: (minutesOfDay) => reanchor(midnightMs + minutesOfDay * 60_000),
    reset: () => {
      factor = 1;
      midnightMs = istMidnightUtcMs(new Date(realNow()));
      reanchor(midnightMs + startMinutes * 60_000);
    },
    state: () => ({ anchorReal, anchorVirtual, factor }),
    setState: (next) => {
      anchorReal = next.anchorReal;
      anchorVirtual = next.anchorVirtual;
      factor = next.factor;
    },
  };
}
