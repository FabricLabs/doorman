'use strict';

const crypto = require('crypto');

const INPUT_TYPES = ['none', 'confirm', 'choice', 'text'];
const ID_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const STEP_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const OPTION_PATTERN = /^[A-Za-z0-9_.-]{1,40}$/;
const MAX_STEPS = 100;
const MAX_OPTIONS = 100;
const MAX_TEXT = 4000;
const DEFAULT_MAX_LENGTH = 1000;
const YES = ['y', 'yes', 'ok', 'okay', 'continue', 'confirm', 'next', 'go', 'sure'];
const SKIP = ['skip', 'none', '-'];

function fail (message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function text (value, field, { required = false, max = MAX_TEXT } = {}) {
  if (value == null || value === '') {
    if (required) fail(`${field} is required`);
    return null;
  }
  if (typeof value !== 'string') fail(`${field} must be a string`);
  if (value.length > max) fail(`${field} is longer than ${max} characters`);
  return value;
}

/**
 * JSON with object keys sorted, so equal definitions hash equally.
 * @param {*} value
 * @returns {string}
 */
function canonical (value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/**
 * Value at a dotted path (`answers.features`), or undefined.
 * @param {Object} scope
 * @param {string} dotted
 * @returns {*}
 */
function lookup (scope, dotted) {
  return String(dotted).split('.').reduce((value, key) => (value == null ? undefined : value[key]), scope);
}

function empty (value) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

function normalizeOption (option, field) {
  if (typeof option === 'string') option = { id: option, label: option };
  if (!option || typeof option !== 'object') fail(`${field} must be an object`);
  const id = String(option.id == null ? '' : option.id);
  if (!OPTION_PATTERN.test(id)) fail(`${field}.id must be 1-40 letters, digits, "_", "-" or "."`);
  return {
    id,
    label: text(option.label == null ? id : String(option.label), `${field}.label`, { required: true, max: 100 }),
    description: text(option.description, `${field}.description`, { max: 100 })
  };
}

function normalizeInput (input, field) {
  const source = input == null ? {} : input;
  if (typeof source !== 'object' || Array.isArray(source)) fail(`${field} must be an object`);
  const type = source.type == null ? 'none' : source.type;
  if (!INPUT_TYPES.includes(type)) fail(`${field}.type must be one of ${INPUT_TYPES.join(', ')}`);
  const out = { type, optional: source.optional === true };
  if (type === 'choice') {
    if (source.optionsFrom != null) {
      out.optionsFrom = text(source.optionsFrom, `${field}.optionsFrom`, { required: true, max: 100 });
    } else {
      if (!Array.isArray(source.options) || !source.options.length) fail(`${field} needs options or optionsFrom`);
      if (source.options.length > MAX_OPTIONS) fail(`${field} has more than ${MAX_OPTIONS} options`);
      out.options = source.options.map((option, index) => normalizeOption(option, `${field}.options[${index}]`));
      const ids = out.options.map((option) => option.id);
      if (new Set(ids).size !== ids.length) fail(`${field}.options ids must be unique`);
    }
    out.multiple = source.multiple === true;
  }
  if (type === 'text') {
    out.maxLength = Math.min(Number(source.maxLength) || DEFAULT_MAX_LENGTH, MAX_TEXT);
    out.minLength = Math.max(Number(source.minLength) || 0, 0);
    if (source.pattern != null) {
      out.pattern = text(source.pattern, `${field}.pattern`, { required: true, max: 200 });
      try { new RegExp(out.pattern); } catch (_) { fail(`${field}.pattern is not a valid regular expression`); }
    }
    out.multiline = source.multiline === true;
  }
  out.label = text(source.label, `${field}.label`, { max: 45 });
  out.placeholder = text(source.placeholder, `${field}.placeholder`, { max: 100 });
  return out;
}

function normalizeNext (next, field) {
  if (next == null || next === 'end') return null;
  if (typeof next === 'string') return next;
  if (!Array.isArray(next)) fail(`${field} must be a step id, null, or a list of branches`);
  return next.map((branch, index) => {
    if (!branch || typeof branch !== 'object') fail(`${field}[${index}] must be an object`);
    const when = branch.when == null ? null : branch.when;
    if (when !== null && (typeof when !== 'object' || Array.isArray(when))) fail(`${field}[${index}].when must be an object`);
    const goto = branch.goto == null || branch.goto === 'end' ? null : branch.goto;
    if (goto !== null && typeof goto !== 'string') fail(`${field}[${index}].goto must be a step id`);
    return { when, goto };
  });
}

/**
 * A managed conversation: a data-only list of steps a bot walks one person
 * through (usually by direct message). Definitions are plain JSON so they can
 * be stored, versioned, and edited at runtime; behavior comes from the host
 * through named option sources (`optionsFrom`) and completion actions
 * (`onComplete`), never from code in the definition.
 */
class Script {
  /**
   * Validate and normalize a definition.
   * @param {Object} definition
   * @returns {Object} Normalized definition (throws an Error with `status: 400`).
   */
  static validate (definition) {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) fail('Script must be an object');
    const id = String(definition.id || '');
    if (!ID_PATTERN.test(id)) fail('id must be 1-64 lowercase letters, digits, "_", "-" or "."');
    const steps = definition.steps;
    if (!steps || typeof steps !== 'object' || Array.isArray(steps)) fail('steps must be an object');
    const names = Object.keys(steps);
    if (!names.length) fail('steps must not be empty');
    if (names.length > MAX_STEPS) fail(`a script has at most ${MAX_STEPS} steps`);

    const out = {
      id,
      title: text(definition.title, 'title', { required: true, max: 100 }),
      description: text(definition.description, 'description', { max: 1000 }),
      start: text(definition.start == null ? names[0] : definition.start, 'start', { required: true, max: 32 }),
      requires: [],
      ttlMs: definition.ttlMs == null ? null : Number(definition.ttlMs),
      steps: {},
      complete: { say: text(definition.complete && definition.complete.say, 'complete.say') },
      cancelled: { say: text(definition.cancelled && definition.cancelled.say, 'cancelled.say') },
      onComplete: []
    };
    if (out.ttlMs !== null && !(out.ttlMs > 0)) fail('ttlMs must be a positive number');
    if (definition.requires != null) {
      if (!Array.isArray(definition.requires)) fail('requires must be a list');
      out.requires = definition.requires.map((entry, index) => text(entry, `requires[${index}]`, { required: true, max: 64 }));
    }
    if (definition.onComplete != null) {
      if (!Array.isArray(definition.onComplete)) fail('onComplete must be a list');
      out.onComplete = definition.onComplete.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || typeof entry.action !== 'string' || !entry.action) {
          fail(`onComplete[${index}] needs an action name`);
        }
        return Object.assign({}, entry);
      });
    }

    for (const name of names) {
      if (!STEP_PATTERN.test(name)) fail(`step id "${name}" must be 1-32 letters, digits, "_" or "-"`);
      const step = steps[name];
      if (!step || typeof step !== 'object') fail(`steps.${name} must be an object`);
      const input = normalizeInput(step.input, `steps.${name}.input`);
      out.steps[name] = {
        say: text(step.say, `steps.${name}.say`, { required: true }),
        input,
        saveAs: input.type === 'none'
          ? null
          : text(step.saveAs == null ? name : step.saveAs, `steps.${name}.saveAs`, { required: true, max: 64 }),
        next: normalizeNext(step.next, `steps.${name}.next`)
      };
    }

    if (!out.steps[out.start]) fail(`start step "${out.start}" does not exist`);
    for (const [name, step] of Object.entries(out.steps)) {
      const targets = Array.isArray(step.next) ? step.next.map((branch) => branch.goto) : [step.next];
      for (const target of targets) {
        if (target !== null && !out.steps[target]) fail(`steps.${name}.next points at a missing step "${target}"`);
      }
    }
    return out;
  }

  /**
   * Content hash of a normalized definition.
   * @param {Object} definition
   * @returns {string} sha256 hex
   */
  static version (definition) {
    return crypto.createHash('sha256').update(canonical(definition)).digest('hex');
  }

  /**
   * Fill `{{path}}` / `{{path|fallback}}` placeholders from `scope`. Lists
   * join with ", "; missing values use the fallback (or nothing).
   * @param {string} template
   * @param {Object} scope
   * @returns {string}
   */
  static render (template, scope = {}) {
    return String(template || '').replace(/\{\{\s*([A-Za-z0-9_.]+)\s*(?:\|([^}]*))?\}\}/g, (match, dotted, fallback) => {
      const value = lookup(scope, dotted);
      if (empty(value)) return fallback == null ? '' : fallback.trim();
      return Array.isArray(value) ? value.join(', ') : String(value);
    });
  }

  /**
   * Does every condition in `when` hold? A condition value may be a single
   * value, a list (any of), or null (the value is missing or empty). A list
   * answer matches when it contains the value.
   * @param {Object|null} when
   * @param {Object} scope
   * @returns {boolean}
   */
  static match (when, scope = {}) {
    if (!when) return true;
    return Object.entries(when).every(([dotted, expected]) => {
      const value = lookup(scope, dotted);
      if (expected === null) return empty(value);
      const wanted = Array.isArray(expected) ? expected.map(String) : [String(expected)];
      const actual = Array.isArray(value) ? value.map(String) : (empty(value) ? [] : [String(value)]);
      return actual.some((entry) => wanted.includes(entry));
    });
  }

  /**
   * The step after `step`, or null when the script ends.
   * @param {Object} step Normalized step.
   * @param {Object} scope
   * @returns {string|null}
   */
  static next (step, scope = {}) {
    if (!Array.isArray(step.next)) return step.next;
    const branch = step.next.find((entry) => Script.match(entry.when, scope));
    return branch ? branch.goto : null;
  }

  /**
   * Turn a reply (a button value, select values, modal text, or a typed
   * message) into the answer for `step`.
   * @param {Object} step Normalized step.
   * @param {*} value Raw reply.
   * @param {Array<Object>} [options] Choice options in effect for the step.
   * @returns {{ ok: boolean, value?: *, label?: string, skipped?: boolean, error?: string }}
   */
  static parse (step, value, options = []) {
    const input = step.input;
    const raw = Array.isArray(value) ? value : (value == null ? '' : String(value).trim());
    const word = typeof raw === 'string' ? raw.toLowerCase() : null;

    if (input.optional && (value === null || (word !== null && SKIP.includes(word) && input.type !== 'confirm'))) {
      return { ok: true, value: null, label: 'Skipped', skipped: true };
    }

    switch (input.type) {
      case 'none':
        return { ok: true, value: null, label: null };
      case 'confirm':
        if (value === true || YES.includes(word)) return { ok: true, value: true, label: 'Continue' };
        return { ok: false, error: 'Press Continue, or reply "yes" to go on ("cancel" stops).' };
      case 'choice': {
        if (!Array.isArray(raw) && !input.multiple) {
          if (!raw) return { ok: false, error: 'Pick one of the options.' };
          const option = Script._findOption(raw, options);
          if (option) return { ok: true, value: option.id, label: option.label };
          return { ok: false, error: `"${raw}" is not one of the options.` };
        }
        // Typed lists: comma-separated; a part that is not an option may be space-separated numbers or ids.
        const picks = Array.isArray(raw)
          ? raw.map(String)
          : raw.split(',').map((part) => part.trim()).filter(Boolean)
            .flatMap((part) => (Script._findOption(part, options) ? [part] : part.split(/\s+/)));
        if (!picks.length) return { ok: false, error: 'Pick one of the options.' };
        if (!input.multiple && picks.length > 1) return { ok: false, error: 'Pick just one option.' };
        const found = [];
        for (const pick of picks) {
          const option = Script._findOption(pick, options);
          if (!option) return { ok: false, error: `"${pick}" is not one of the options.` };
          if (!found.includes(option)) found.push(option);
        }
        if (!input.multiple) return { ok: true, value: found[0].id, label: found[0].label };
        return { ok: true, value: found.map((option) => option.id), label: found.map((option) => option.label).join(', ') };
      }
      case 'text': {
        const answer = Array.isArray(raw) ? raw.join(' ') : raw;
        if (!answer) return { ok: false, error: input.optional ? 'Type an answer, or "skip".' : 'Type an answer.' };
        if (answer.length < input.minLength) return { ok: false, error: `Use at least ${input.minLength} characters.` };
        if (answer.length > input.maxLength) return { ok: false, error: `Keep it under ${input.maxLength} characters.` };
        if (input.pattern && !new RegExp(input.pattern).test(answer)) return { ok: false, error: 'That doesn\'t look right; try again.' };
        return { ok: true, value: answer, label: answer };
      }
      default:
        return { ok: false, error: 'Unsupported step.' };
    }
  }

  static _findOption (pick, options) {
    const value = String(pick).trim();
    const index = /^\d{1,3}$/.test(value) ? Number(value) : 0;
    if (index >= 1 && index <= options.length && !options.some((option) => option.id === value)) return options[index - 1];
    const lower = value.toLowerCase();
    return options.find((option) => option.id === value) ||
      options.find((option) => option.id.toLowerCase() === lower || option.label.toLowerCase() === lower) ||
      null;
  }

  /**
   * Plain-text rendering of a step for adapters without buttons or menus:
   * the prompt, numbered options, and how to answer.
   * @param {Object} step `ScriptStep` payload (see Scripts).
   * @returns {string}
   */
  static toText (step) {
    if (!step || typeof step !== 'object') return String(step == null ? '' : step);
    const lines = [step.text];
    const input = step.input || {};
    if (input.type === 'choice') {
      (input.options || []).forEach((option, index) => {
        lines.push(`${index + 1}. ${option.label}${option.description ? ` — ${option.description}` : ''}`);
      });
      lines.push(input.multiple ? 'Reply with the numbers of every option that applies, separated by commas.' : 'Reply with a number.');
    } else if (input.type === 'confirm') {
      lines.push('Reply "yes" to continue.');
    } else if (input.type === 'text') {
      lines.push('Reply with your answer.');
    }
    if (input.type && input.type !== 'none') {
      lines.push(`${input.optional ? '"skip" leaves this blank; ' : ''}"cancel" stops.`);
    }
    return lines.filter(Boolean).join('\n');
  }
}

module.exports = Script;
module.exports.INPUT_TYPES = INPUT_TYPES;
module.exports.canonical = canonical;
module.exports.lookup = lookup;
