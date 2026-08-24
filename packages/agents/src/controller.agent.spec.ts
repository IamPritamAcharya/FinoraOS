import { describe, expect, it } from 'vitest';
import { ControllerAgent } from './controller.agent.js';

describe('ControllerAgent', () => {
  it('accepts a model-selected, validated tool call', async () => {
    const controller = new ControllerAgent({
      complete: async () => '{"tool":"getOrganizationSummary","arguments":{}}',
    });
    await expect(controller.route('how many memebrs are theer in our org')).resolves.toEqual({
      tool: 'getOrganizationSummary',
      arguments: {},
    });
  });

  it('uses a contextual reference only when the model returns it in a valid tool call', async () => {
    const controller = new ControllerAgent({
      complete: async () => '{"tool":"getSettlement","arguments":{"settlementId":"STL_0001"}}',
    });
    await expect(
      controller.route('what does the fee mean?', [{ role: 'user', text: 'STL_0001' }]),
    ).resolves.toMatchObject({ tool: 'getSettlement' });
  });

  it('rejects invented tools and falls back safely', async () => {
    const controller = new ControllerAgent({
      complete: async () => '{"tool":"executeSql","arguments":{"sql":"SELECT * FROM User"}}',
    });
    await expect(controller.route('show all users')).resolves.toEqual({
      tool: 'general',
      arguments: {},
    });
  });

  it('reports an invalid model tool call without exposing model output', async () => {
    const controller = new ControllerAgent({
      complete: async () => '{"tool":"executeSql","arguments":{"sql":"SELECT * FROM User"}}',
    });
    await expect(controller.routeDetailed('show all users')).resolves.toEqual({
      decision: { tool: 'general', arguments: {} },
      source: 'fallback',
      fallbackReason: 'invalid-tool-call',
    });
  });
});
