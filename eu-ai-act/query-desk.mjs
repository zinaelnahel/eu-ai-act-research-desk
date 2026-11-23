import {readFileSync} from 'node:fs';
import {desk} from './evaluate.mjs';

const questions = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(questions.map(question => desk.ask(question))));
