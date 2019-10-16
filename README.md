# Saga Maker

A Saga Maker for Node.JS. Create sagas and compensate when some event failed. 
_In future, we have plans to work in browser too._


## Installing

```
npm install --save saga-maker
```

## Usage

To getting started, lets see a basic usage. Let's imaginate we have an online book store. Every time you register a book in system, you need to save in database, and also index this item in ElasticSearch for performatic searches. If for a reason you can't index in ElasticSearch, you need to remove this register from database to avoid inconsistency. You can implementate this using Saga Maker:

```
const SagaMaker = require('saga-maker');

const { save, delete } = require('./databaseStub');
const { saveElastic } = require('./elasticSearchStub');

const sagaSteps = [{
  name: 'Save in database',
  run: initialPayload => save(initialPayload),
  compensate: state => delete(state.id)
}, {
  name: 'Index in ElasticSearch',
  run: (initialPayload, currentState) => saveElastic(currentState)
}];

const bookStub = {
  name: 'Animal Farm',
  author: 'George Orwell'
};

module.exports = async (book = bookStub) => {
  const sagaResult = await SagaMaker(sagaSteps).run(book);
  console.log('Saga Completed');
}

```

In this example, we can see SagaSteps. SagaSteps help us to describe instructions to handle saga execution. Each step has this structure:

| Property | Type     | Description       | Parameters |
|----------|----------|-------------------| ---------- |
| name     | String   | A identifier for this step. It's purely descritive | - |
| run*     | Function | Callback to handle step execution. Will be invoked when this step starts | `initialPayload` - Payload passed when saga starts <br> `currentState` - Value returned from last step. Is null in first step <br> `state` - Global state of Saga. You can set global state inside `run`, using `this.state({ parameter: 'value' })`. Will merge with previous global state.
| compensate | Function | Callback to compensate when some element of saga failed. Compensate works in pattern `n-1`, so if step failed, compensate will be invoked in previous step of saga. | `stepState` - Is value returned when this step has been executed. <br> `state` - Global state of Saga. <br> `initialPayload` - Payload passed when saga starts.
| retries  | Number   | Number of retries to execute `run` and `compensate`. Default value is `1`. | - | 


## Combining Sagas

You can combine sagas to create complex workflows. Each saga can works as saga steps:

```
const SagaMaker = require('saga-maker');

const { save, delete } = require('./databaseStub');
const { saveElastic, deleteElastic } = require('./elasticSearchStub');
const { publish } = require('./api);

const saveBookSagaSteps = [{
  name: 'Save in database',
  run: initialPayload => save(initialPayload),
  compensate: state => delete(state.id)
}, {
  name: 'Index in ElasticSearch',
  run: (initialPayload, currentState) => saveElastic(currentState),
  compensate: state => deleteElastic(state.id)
}];

const saveBookSaga = SagaMaker(saveBookSagaSteps);

const saveAndShareBookSagaSteps = [{
  name: 'Save Book',
  run: saveBookSaga.run,
  compensate: saveBookSaga.compensate
}, {
  name: 'Publish book',
  run: initialPayload => publish(initialPayload.name, initialPayload.author)
}];

const bookStub = {
  name: 'Animal Farm',
  author: 'George Orwell'
};

module.exports = async (book = bookStub) => {
  const sagaResult = await SagaMaker(saveAndShareBookSagaSteps).run(book);
  console.log('Saga Completed');
}

```

## Contributing

If you want to contribute to saga-maker, check the file CONTRIBUTE.md to learn how to contribute.