import {desk} from '../evaluate.mjs';

export default class ResearchDeskProvider {
  id() {
    return 'eu-ai-act/retrieval';
  }

  async callApi(question) {
    return {output: JSON.stringify(desk.ask(question))};
  }
}
