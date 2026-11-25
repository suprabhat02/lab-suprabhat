import { analyze } from '../lib/audit/model';

interface Request {
  readonly id: number;
  readonly css: string;
}
self.addEventListener('message', (event: MessageEvent<Request>) => {
  self.postMessage({ id: event.data.id, result: analyze(event.data.css) });
});
