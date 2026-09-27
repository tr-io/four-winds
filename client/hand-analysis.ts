import type { GameView, HandAnalysis } from '../shared/types';
/** At most one local calculation; closing the dialog terminates work immediately. */
export class HandAnalyzer {
  private cancelPending?: () => void;
  analyze(view: GameView): Promise<HandAnalysis> {
    this.cancel();
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./analysis-worker.ts', import.meta.url), {
        type: 'module',
      });
      let settled = false;
      const finish = (error?: Error, analysis?: HandAnalysis) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.terminate();
        this.cancelPending = undefined;
        if (error) reject(error);
        else resolve(analysis!);
      };
      const timer = setTimeout(
        () => finish(new Error('This hand took too long to analyze. Try again.')),
        8000,
      );
      this.cancelPending = () => finish(new DOMException('Analysis cancelled', 'AbortError'));
      worker.onmessage = ({ data }: { data: { analysis?: HandAnalysis; error?: string } }) =>
        finish(data.error ? new Error(data.error) : undefined, data.analysis);
      worker.onerror = (event) => {
        event.preventDefault();
        finish(new Error('Hand analysis is unavailable. Please try again.'));
      };
      worker.onmessageerror = () =>
        finish(new Error('Could not read the hand analysis. Please try again.'));
      worker.postMessage(view);
    });
  }
  cancel() {
    this.cancelPending?.();
  }
}
