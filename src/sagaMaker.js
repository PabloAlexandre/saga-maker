/* eslint no-await-in-loop: 0 no-restricted-syntax: 0 */

async function timeout(delay) {
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}

module.exports = function SagaMaker(steps) {
  return {
    state: {},
    setState(state) {
      this.state = { ...this.state, ...state };
    },
    compensations: [],
    setCompensations(step, state) {
      this.compensations.push({ step, stepState: state });
    },
    async runCompensations(payload) {
      const operations = this.compensations.map(({ step, stepState }) => (step.compensate
        ? step.compensate(stepState, this.state, payload)
        : Promise.resolve()));

      return Promise.all(operations);
    },
    async run(payload) {
      let currentStatus = null;

      const executeStep = async (step, executionCount = 1) => {
        try {
          const status = await step.run.call(this, payload, currentStatus, this.state);
          this.setCompensations(step, status);

          return status;
        } catch (err) {
          if (step.retry && executionCount < step.retry) {
            await timeout(step.retryInterval || 1000);

            const status = executeStep(step, executionCount + 1);
            return status;
          }

          await this.runCompensations(payload);
          throw err;
        }
      };

      for (const step of steps) {
        currentStatus = await executeStep(step);
      }

      return currentStatus;
    },
  };
};
