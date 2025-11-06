import {
  changeRingingLibrary,
  permutationFamilies,
  symmetricGroupCatalog,
} from '../data/index.js';

const DEFAULT_SCALE = 'pentatonic';
const SCALE_RATIOS = {
  pentatonic: [1.0, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2.0, 9 / 4, 5 / 2, 3.0],
  harmonic: [1.0, 4 / 3, 3 / 2, 2.0, 5 / 2, 3.0],
  chromatic: Array.from({ length: 12 }, (_, i) => 2 ** (i / 12)),
  whole: Array.from({ length: 6 }, (_, i) => 2 ** (i / 6)),
};

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const DEFAULT_CHANGE_RINGING_OPTIONS = Object.freeze({
  baseFreq: 220,
  scale: DEFAULT_SCALE,
  rowsPerMinute: null,
  bellInterval: 0.18,
  rowGap: 0.04,
  strikeDuration: null,
  attack: 0.008,
  release: 0.05,
});

export const listChangeRingingPatterns = () =>
  changeRingingLibrary.map((entry) => ({
    id: entry.id,
    title: entry.title,
    stage: entry.stage,
    rows: entry.rows,
    huntBells: entry.huntBells ?? null,
    family: entry.family,
    comment: entry.metadata?.comment ?? null,
    sourceFile: entry.sourceFile,
  }));

export const getChangeRingingPatternById = (id) =>
  changeRingingLibrary.find((entry) => entry.id === id) || null;

export const getPermutationFamilies = () => permutationFamilies;

export const getSymmetricGroupCatalog = () => symmetricGroupCatalog;

export const generateBellFrequencies = (
  stage,
  { baseFreq = 220, scale = DEFAULT_SCALE } = {}
) => {
  const ratios = SCALE_RATIOS[scale] || SCALE_RATIOS[DEFAULT_SCALE];
  return Array.from({ length: stage }, (_, index) => {
    const ratio = ratios[index % ratios.length];
    const octave = Math.floor(index / ratios.length);
    return baseFreq * ratio * 2 ** octave;
  });
};

export const deriveTempoFromBellInterval = (stage, bellInterval) => {
  if (!bellInterval || bellInterval <= 0) {
    return null;
  }
  const rowDuration = stage * bellInterval;
  return rowDuration > 0 ? (60 / rowDuration) : null;
};

const clampPositive = (value, fallback) => {
  const num = toNumber(value, fallback);
  return num > 0 ? num : fallback;
};

export const createChangeRingingSchedule = (options = {}) => {
  const {
    patternId,
    pattern: patternOverride,
    baseFreq = DEFAULT_CHANGE_RINGING_OPTIONS.baseFreq,
    scale = DEFAULT_CHANGE_RINGING_OPTIONS.scale,
    rowsPerMinute = DEFAULT_CHANGE_RINGING_OPTIONS.rowsPerMinute,
    bellInterval: bellIntervalOverride = DEFAULT_CHANGE_RINGING_OPTIONS.bellInterval,
    rowGap = DEFAULT_CHANGE_RINGING_OPTIONS.rowGap,
    strikeDuration: strikeDurationOverride = DEFAULT_CHANGE_RINGING_OPTIONS.strikeDuration,
    attack = DEFAULT_CHANGE_RINGING_OPTIONS.attack,
    release = DEFAULT_CHANGE_RINGING_OPTIONS.release,
  } = options;

  const pattern =
    patternOverride ||
    (patternId ? getChangeRingingPatternById(patternId) : null);

  if (!pattern) {
    throw new Error(
      `Change-ringing pattern not found. Received id=${patternId}`
    );
  }

  const stage = pattern.stage;
  const bellIntervalFromTempo =
    rowsPerMinute && rowsPerMinute > 0
      ? (60 / rowsPerMinute) / stage
      : null;

  const bellInterval = clampPositive(
    bellIntervalFromTempo || bellIntervalOverride,
    DEFAULT_CHANGE_RINGING_OPTIONS.bellInterval
  );

  const strikeDuration =
    strikeDurationOverride && strikeDurationOverride > 0
      ? Math.min(strikeDurationOverride, bellInterval)
      : Math.min(bellInterval * 0.85, 0.22);

  const rowDuration = bellInterval * stage;
  const bellFrequencies = generateBellFrequencies(stage, { baseFreq, scale });

  const events = [];
  const bellHitCounts = Array.from({ length: stage }, () => 0);
  const rowSummaries = [];

  let currentRowStart = 0;

  pattern.rowsDetail.forEach((rowDetail, rowIndex) => {
    const rowEvents = [];
    rowDetail.permutation.forEach((bellIndex, strikeIndex) => {
      const startTime = currentRowStart + strikeIndex * bellInterval;
      const event = {
        time: startTime,
        bell: bellIndex,
        frequency: bellFrequencies[bellIndex],
        rowIndex,
        strikeIndex,
        notation: rowDetail.notation,
        rowParity: rowDetail.parity,
        isRowLead: strikeIndex === 0,
      };
      events.push(event);
      rowEvents.push(event);
      bellHitCounts[bellIndex] += 1;
    });

    rowSummaries.push({
      index: rowIndex,
      notation: rowDetail.notation,
      startTime: currentRowStart,
      parity: rowDetail.parity,
      cycleSignature: rowDetail.cycleSignature,
    });

    currentRowStart += rowDuration + rowGap;
  });

  const totalDuration =
    events.length > 0
      ? events[events.length - 1].time + strikeDuration + release
      : 0;

  return {
    patternId: pattern.id,
    patternTitle: pattern.title,
    family: pattern.family,
    stage,
    rows: pattern.rows,
    baseFreq,
    scale,
    bellInterval,
    rowDuration,
    rowGap,
    strikeDuration,
    attack,
    release,
    bellFrequencies,
    bellHitCounts,
    events,
    totalDuration,
    rowSummaries,
    metadata: pattern.metadata,
    sourceFile: pattern.sourceFile,
    permutations: pattern.rowsDetail,
    transitions: pattern.transitions,
  };
};

export const listChangeRingingIds = () =>
  changeRingingLibrary.map((entry) => entry.id);
