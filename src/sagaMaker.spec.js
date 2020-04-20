const Chance = require('chance');

const SagaMaker = require('./');

describe('Testing Saga Maker', () => {
  const chance = new Chance();

  it('Should create saga and run asynchronously', async () => {
    const idStub = chance.guid();
    const payloadStub = {
      bookName: chance.name(),
      author: chance.name(),
    };

    const steps = [{
      run: jest.fn((payload) => Promise.resolve({ ...payload, id: idStub })),
    }, {
      run: jest.fn((_, currentState) => Promise.resolve(currentState)),
    }];

    const sagaResult = await SagaMaker(steps).run(payloadStub);

    const [step1, step2] = steps;
    const accumulatedPayloadStub = {
      ...payloadStub,
      id: idStub,
    };

    expect(sagaResult).toStrictEqual(accumulatedPayloadStub);

    expect(step1.run).toBeCalledWith(payloadStub, null, {});
    expect(step2.run).toBeCalledWith(payloadStub, accumulatedPayloadStub, {});
  });

  it('Should create saga and run synchronously', async () => {
    const idStub = chance.guid();
    const payloadStub = {
      bookName: chance.name(),
      author: chance.name(),
    };

    const steps = [{
      run: jest.fn((payload) => ({ ...payload, id: idStub })),
    }, {
      run: jest.fn((_, currentState) => currentState),
    }];

    const sagaResult = await SagaMaker(steps).run(payloadStub);

    const [step1, step2] = steps;
    const accumulatedPayloadStub = {
      ...payloadStub,
      id: idStub,
    };

    expect(sagaResult).toStrictEqual(accumulatedPayloadStub);

    expect(step1.run).toBeCalledWith(payloadStub, null, {});
    expect(step2.run).toBeCalledWith(payloadStub, accumulatedPayloadStub, {});
  });

  it('Should create saga and run adding saga state', async () => {
    const oldPayload = {
      bookName: chance.name(),
      author: chance.name(),
    };

    const patchPayload = {
      author: chance.name(),
    };

    const updateInDatabase = jest.fn((payload) => ({
      oldState: oldPayload,
      newState: { ...oldPayload, ...payload },
    }));

    const steps = [{
      async run(payload) {
        const { oldState, newState } = await updateInDatabase(payload);

        /*
        * This setState will help us when we need to compensate saga. In this case, we need to pass
        * patched state forward, but if saga failed, we can access saga state to update this
        * registry and compensate update
        */
        this.setState({ oldBook: oldState });

        return newState;
      },
    }, {
      run: jest.fn((_, currentState) => Promise.resolve(currentState)),
    }];

    const sagaResult = await SagaMaker(steps).run(patchPayload);

    const [, step2] = steps;
    const accumulatedPayloadStub = {
      ...oldPayload,
      ...patchPayload,
    };

    expect(sagaResult).toStrictEqual(accumulatedPayloadStub);

    expect(updateInDatabase).toBeCalledWith(patchPayload);
    expect(step2.run).toBeCalledWith(patchPayload, accumulatedPayloadStub, { oldBook: oldPayload });
  });

  it('Should create saga and run compensate when some step fails', async () => {
    const idStub = chance.guid();
    const payloadStub = {
      bookName: chance.name(),
      author: chance.name(),
    };

    const steps = [{
      run: jest.fn((payload) => Promise.resolve({ ...payload, id: idStub })),
      compensate: jest.fn(),
    }, {
      run: jest.fn((payload) => Promise.resolve(payload)),
      compensate: jest.fn(),
    }, {
      run: jest.fn(() => Promise.reject(new Error('Some Exception'))),
    }];

    try {
      await SagaMaker(steps).run(payloadStub);
    } catch (err) {
      const [step1, step2, step3] = steps;
      const accumulatedPayloadStub = {
        ...payloadStub,
        id: idStub,
      };

      expect(step1.run).toBeCalledWith(payloadStub, null, {});
      expect(step2.run).toBeCalledWith(payloadStub, accumulatedPayloadStub, {});
      expect(step3.run).toBeCalledWith(payloadStub, payloadStub, {});

      expect(step1.compensate).toBeCalledWith(accumulatedPayloadStub, {}, payloadStub);
      expect(step2.compensate).toBeCalledWith(payloadStub, {}, payloadStub);
    }
  });

  it('Should ignore compensate when not defined in some step', async () => {
    const idStub = chance.guid();
    const payloadStub = {
      bookName: chance.name(),
      author: chance.name(),
    };

    const steps = [{
      run: jest.fn((payload) => Promise.resolve({ ...payload, id: idStub })),
      compensate: jest.fn(),
    }, {
      run: jest.fn((payload) => Promise.resolve(payload)),
    }, {
      run: jest.fn(() => Promise.reject(new Error('Some Exception'))),
    }];

    try {
      await SagaMaker(steps).run(payloadStub);
    } catch (err) {
      const [step1, step2, step3] = steps;
      const accumulatedPayloadStub = {
        ...payloadStub,
        id: idStub,
      };

      expect(step1.run).toBeCalledWith(payloadStub, null, {});
      expect(step2.run).toBeCalledWith(payloadStub, accumulatedPayloadStub, {});
      expect(step3.run).toBeCalledWith(payloadStub, payloadStub, {});

      expect(step1.compensate).toBeCalledWith(accumulatedPayloadStub, {}, payloadStub);
    }
  });

  it('Should create saga and run with success, retrying when step fails', async () => {
    const idStub = chance.guid();
    const payloadStub = {
      bookName: chance.name(),
      author: chance.name(),
    };

    let counter = 0;
    const runFnFailingTwoFirstTimes = jest.fn((_, currentState) => {
      counter += 1;
      return counter === 3 ? Promise.resolve(currentState) : Promise.reject(new Error('Exception'));
    });

    const steps = [{
      run: jest.fn((payload) => Promise.resolve({ ...payload, id: idStub })),
    }, {
      run: runFnFailingTwoFirstTimes,
      retry: 3,
    }];

    const sagaResult = await SagaMaker(steps).run(payloadStub);

    const [step1, step2] = steps;
    const accumulatedPayloadStub = {
      ...payloadStub,
      id: idStub,
    };

    expect(sagaResult).toStrictEqual(accumulatedPayloadStub);

    expect(step1.run).toBeCalledWith(payloadStub, null, {});

    expect(step2.run).toHaveBeenCalledTimes(3);
    expect(step2.run).toBeCalledWith(payloadStub, accumulatedPayloadStub, {});
  });

  it('Should create saga and run throwing error, retrying when step fails', async () => {
    const idStub = chance.guid();
    const payloadStub = {
      bookName: chance.name(),
      author: chance.name(),
    };

    const steps = [{
      run: jest.fn((payload) => Promise.resolve({ ...payload, id: idStub })),
      compensate: jest.fn(),
    }, {
      run: jest.fn(() => Promise.reject(new Error('Exception'))),
      retry: 3,
      retryInterval: 10,
    }];

    try {
      await SagaMaker(steps).run(payloadStub);
    } catch (err) {
      const [step1, step2] = steps;
      const accumulatedPayloadStub = {
        ...payloadStub,
        id: idStub,
      };

      expect(step1.run).toBeCalledWith(payloadStub, null, {});
      expect(step2.run).toHaveBeenCalledTimes(3);

      expect(step1.compensate).toBeCalledWith(accumulatedPayloadStub, {}, payloadStub);
    }
  });
});
