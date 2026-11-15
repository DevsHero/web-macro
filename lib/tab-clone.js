// Copy definitions with fresh runtime identities, never execution history/timers.
function buildCloneOptions(source, url) {
  return {
    url,
    label: `${source.name} Copy`,
    defaultPosition: structuredClone(source.defaultPosition),
    pausedAll: true,
    resumeWorkflows: true,
    backgroundNavigation: true,
    workflows: source.workflows.map((workflow) => ({
      name: workflow.name,
      sortOrder: workflow.sortOrder,
      enabled: workflow.enabled,
      intervalSeconds: workflow.intervalSeconds,
      startDelaySeconds: workflow.startDelaySeconds,
      description: workflow.description,
      notes: workflow.notes,
      overlapPolicy: workflow.overlapPolicy,
      tabActivationPolicy: workflow.tabActivationPolicy,
      steps: workflow.steps.map((step) => {
        const copy = structuredClone(step);
        delete copy.id;
        return copy;
      }),
    })),
  };
}

module.exports = { buildCloneOptions };
