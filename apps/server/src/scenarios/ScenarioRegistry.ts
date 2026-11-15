import {
  SCENARIO_CAPABILITY_DESCRIPTORS,
  type ScenarioCapabilityDescriptor,
  type ScenarioId,
} from '@cuex/protocol';

export class ScenarioNotImplementedError extends Error {
  readonly statusCode = 400;

  constructor(scenarioId: string) {
    super(
      `Scenario "${scenarioId}" is currently on the roadmap and not runnable yet. Only "presentation" is implemented.`,
    );
    this.name = 'ScenarioNotImplementedError';
  }
}

export class ScenarioRegistry {
  listScenarios(): ScenarioCapabilityDescriptor[] {
    return SCENARIO_CAPABILITY_DESCRIPTORS.map((item) => ({ ...item }));
  }

  getScenario(id: ScenarioId | string): ScenarioCapabilityDescriptor | undefined {
    const found = SCENARIO_CAPABILITY_DESCRIPTORS.find((item) => item.id === id);
    return found ? { ...found } : undefined;
  }

  assertRunnable(id: ScenarioId | string): ScenarioCapabilityDescriptor {
    const descriptor = this.getScenario(id);
    if (!descriptor || descriptor.status !== 'implemented') {
      throw new ScenarioNotImplementedError(id);
    }
    return { ...descriptor };
  }
}
