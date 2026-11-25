import { buildContender } from '../lib/app/model';
import { anatomyView, playgroundScoreView } from '../lib/app/views';
import { calculate, formatSpecificity } from '../lib/cascade/specificity';
import { mount } from '../lib/view/h';

export function start(
  input: HTMLInputElement,
  output: HTMLElement,
  status: HTMLElement,
  score: HTMLElement,
): void {
  function render(): void {
    const contender = buildContender(input.value, calculate);
    if (contender.parsed.ok) {
      input.removeAttribute('aria-invalid');
      status.textContent = contender.parsed.value
        .map((result) => `${result.selector}: specificity ${formatSpecificity(result.value)}.`)
        .join(' ');
    } else {
      input.setAttribute('aria-invalid', 'true');
      status.textContent = contender.parsed.error.message;
    }
    mount(output, anatomyView([contender]));
    mount(score, playgroundScoreView(contender));
  }

  render();
  input.addEventListener('input', render);
}
