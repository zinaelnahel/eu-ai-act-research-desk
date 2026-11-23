import {cases} from '../evaluate.mjs';

export default cases.map(fixture => ({
  description: fixture.name,
  vars: {question: fixture.question, caseName: fixture.name},
}));
