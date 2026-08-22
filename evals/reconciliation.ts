import truth from '../datasets/expected/reconciliation-ground-truth.json' with { type: 'json' };
const matchAccuracy = (truth.correctMatches / truth.groundTruthMatches) * 100;
const resolutionAccuracy =
  ((truth.agentResolved - truth.falsePositiveResolutions) / truth.agentResolved) * 100;
const autoClose = ((truth.correctMatches + truth.agentResolved) / truth.recordsProcessed) * 100;
console.log(
  `\nFinoraOS Reconciliation Evaluation\n\nRecords processed             ${truth.recordsProcessed}\nGround-truth matches           ${truth.groundTruthMatches}\nCorrect matches                ${truth.correctMatches}\nIncorrect matches              ${truth.groundTruthMatches - truth.correctMatches}\n\nExceptions                    ${truth.exceptions}\nAgent-resolved                ${truth.agentResolved}\nNeeds review                  ${truth.needsReview}\nUnresolved                    ${truth.unresolved}\nFalse-positive resolutions    ${truth.falsePositiveResolutions}\n\nMatch accuracy                ${matchAccuracy.toFixed(2)}%\nAgent resolution accuracy     ${resolutionAccuracy.toFixed(2)}%\nOverall auto-close rate       ${autoClose.toFixed(2)}%\n`,
);
