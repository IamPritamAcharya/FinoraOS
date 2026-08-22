import { reconciliationGroundTruth as truth } from '../datasets/expected/reconciliation-ground-truth.ts';
import { syntheticReconciliationDataset } from '../datasets/synthetic/reconciliation-fixture.ts';
import { runReconciliation } from '@finora/reconciliation';

const dataset = syntheticReconciliationDataset();
const result = runReconciliation(dataset.leftRecords, dataset.rightRecords);
const actualPairs = new Set(
  result.matches.map((match) => `${match.leftRecordId}:${match.rightRecordId}`),
);
const expectedPairs = new Set(dataset.expectedMatchPairs);
const correctMatches = [...actualPairs].filter((pair) => expectedPairs.has(pair)).length;
const falseAutoMatches = [...actualPairs].filter((pair) => !expectedPairs.has(pair)).length;
const expectedExceptions = new Set(dataset.expectedExceptionLeftRecordIds);
const incorrectExceptions = result.exceptions.filter(
  (exception) => !expectedExceptions.has(exception.leftRecordId),
).length;
const matchAccuracy = (correctMatches / expectedPairs.size) * 100;
console.log(
  `\nFinoraOS Reconciliation Evaluation\n\nRecords processed             ${result.metrics.recordsProcessed}\nCorrect matches                ${correctMatches}\nIncorrect matches              ${expectedPairs.size - correctMatches}\nFalse auto-matches            ${falseAutoMatches}\n\nExceptions                    ${result.metrics.exceptions}\nUnexpected exceptions         ${incorrectExceptions}\nUnresolved count              ${result.exceptions.length}\n\nMatch accuracy                ${matchAccuracy.toFixed(2)}%\n`,
);

if (
  result.metrics.recordsProcessed !== truth.recordsProcessed ||
  correctMatches !== truth.correctMatches ||
  result.metrics.exceptions !== truth.exceptions ||
  falseAutoMatches !== truth.falseAutoMatches
) {
  process.exitCode = 1;
}
