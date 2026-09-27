// Pure scoring modules shared with authoritative validation; this worker cannot send commands.
import { analyzeHand } from '../server/hand-analysis';
import { analysisGame } from '../shared/analysis-view';
import type { GameView } from '../shared/types';
self.onmessage = ({ data }: MessageEvent<GameView>) => {
  try {
    self.postMessage({ analysis: analyzeHand(analysisGame(data), data.seat) });
  } catch {
    self.postMessage({ error: 'Could not read this hand. Please try again.' });
  }
};
