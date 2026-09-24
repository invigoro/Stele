// Small builders for the control panel's form fields.

export interface Option<T extends string> {
  value: T;
  label: string;
}

let lastId = 0;
const uniqueId = (prefix: string) => `${prefix}-${++lastId}`;

function create<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** A labelled row. `id` links the label to the control it names. */
function field(label: string, id: string | null, ...children: (HTMLElement | null | undefined)[]): HTMLElement {
  const wrapper = create('div', 'field');
  const title = create('label', 'field-label', label);
  if (id) title.htmlFor = id;
  const row = create('div', 'field-row');
  row.append(...children.filter((child): child is HTMLElement => !!child));
  wrapper.append(title, row);
  return wrapper;
}

export function section(title: string, ...fields: HTMLElement[]): HTMLElement {
  const element = create('section', 'panel-section');
  element.append(create('h2', undefined, title), ...fields);
  return element;
}

export function slider(options: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onInput: (value: number) => void;
  extra?: HTMLElement;
}): HTMLElement {
  const id = uniqueId('slider');
  const input = create('input');
  input.type = 'range';
  input.id = id;
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(options.step);
  input.value = String(options.value);
  const output = create('output', 'field-value', options.format(options.value));
  output.htmlFor.add(id);
  input.addEventListener('input', () => {
    const value = Number(input.value);
    output.value = options.format(value);
    options.onInput(value);
  });
  return field(options.label, id, input, output, options.extra);
}

export function select<T extends string>(options: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}): HTMLElement {
  const id = uniqueId('select');
  const element = create('select');
  element.id = id;
  for (const option of options.options) {
    const item = create('option', undefined, option.label);
    item.value = option.value;
    item.selected = option.value === options.value;
    element.append(item);
  }
  element.addEventListener('change', () => options.onChange(element.value as T));
  return field(options.label, id, element);
}

/** A row of mutually exclusive buttons; `wrap` lets many of them flow onto more rows. */
export function segmented<T extends string>(options: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  wrap?: boolean;
}): HTMLElement {
  const group = create('div', options.wrap ? 'segmented wrap' : 'segmented');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', options.label);
  const buttons = options.options.map((option) => {
    const item = create('button', undefined, option.label);
    item.type = 'button';
    item.setAttribute('aria-pressed', String(option.value === options.value));
    item.addEventListener('click', () => {
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === item));
      options.onChange(option.value);
    });
    return item;
  });
  group.append(...buttons);
  return field(options.label, null, group);
}

export function textArea(options: {
  label: string;
  value: string;
  rows: number;
  onInput: (value: string) => void;
}): HTMLElement {
  const id = uniqueId('text');
  const element = create('textarea');
  element.id = id;
  element.rows = options.rows;
  element.value = options.value;
  element.spellcheck = false;
  element.addEventListener('input', () => options.onInput(element.value));
  return field(options.label, id, element);
}

export function checkbox(options: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const wrapper = create('label', 'checkbox');
  const input = create('input');
  input.type = 'checkbox';
  input.checked = options.checked;
  input.addEventListener('change', () => options.onChange(input.checked));
  wrapper.append(input, document.createTextNode(options.label));
  return wrapper;
}

/** A short explanatory note under a field. */
export function hint(html: string): HTMLElement {
  const element = create('p', 'hint');
  element.innerHTML = html;
  return element;
}

/** Buttons side by side. */
export function buttonRow(...buttons: HTMLElement[]): HTMLElement {
  const row = create('div', 'button-row');
  row.append(...buttons);
  return row;
}

export function button(label: string, onClick: () => void, options: { title?: string; className?: string } = {}) {
  const element = create('button', options.className, label);
  element.type = 'button';
  if (options.title) {
    element.title = options.title;
    element.setAttribute('aria-label', options.title);
  }
  element.addEventListener('click', onClick);
  return element;
}
