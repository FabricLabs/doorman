'use strict';

const STATUSES = ['draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled'];
const LISTS = ['platforms', 'guilds', 'roles', 'excludeGuilds', 'excludeRoles', 'excludeCampaigns'];
const SCRIPT_ID = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const CAMPAIGN_ID = /^[0-9a-f]{12}$/;
const LIST_ITEM = /^[^\s/]{1,100}$/;
const MAX_TEXT = 1800;
const MAX_TITLE = 100;
const MAX_LIST = 50;
const MAX_ACTIVE_DAYS = 365;
const MAX_INACTIVE_DAYS = 3650;

function fail (message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function days (value, field, max) {
  if (value === '' || value === undefined || value === null) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) fail(`filter.${field} must be a whole number from 1 to ${max}`);
  return number;
}

function list (value, field) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`filter.${field} must be a list`);
  if (value.length > MAX_LIST) fail(`filter.${field} takes at most ${MAX_LIST} entries`);
  const items = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  for (const item of items) {
    if (field === 'excludeCampaigns' ? !CAMPAIGN_ID.test(item) : !LIST_ITEM.test(item)) fail(`filter.${field} has an invalid entry: ${item}`);
  }
  return items;
}

/**
 * A campaign: one message (optionally offering a {@link Script}) sent by
 * private message to every member a filter selects. Data only — the
 * Campaigns plugin owns delivery.
 */
class Campaign {
  /**
   * Validate and normalize what a campaign says.
   * @param {Object} content `{ type: 'message'|'script', text, script? }`
   * @returns {{ type: string, text: string, script: string|null }}
   */
  static content (content) {
    if (!content || typeof content !== 'object') fail('content is required');
    const type = content.type == null ? 'message' : String(content.type);
    if (!['message', 'script'].includes(type)) fail('content.type must be "message" or "script"');
    const text = String(content.text == null ? '' : content.text).trim();
    if (!text) fail('content.text is required');
    if (text.length > MAX_TEXT) fail(`content.text must be at most ${MAX_TEXT} characters`);
    const script = type === 'script' ? String(content.script || '') : null;
    if (type === 'script' && !SCRIPT_ID.test(script)) fail('content.script must name a script');
    return { type, text, script };
  }

  /**
   * Validate and normalize who a campaign reaches. `activeWithinDays` keeps
   * people active in the last N days; `inactiveForDays` keeps people whose
   * last activity is at least N days old (never-seen people are left out),
   * most inactive first. Together they select a window.
   * @param {Object} [filter]
   * @returns {Object} `{ platforms, guilds, roles, excludeGuilds, excludeRoles, excludeCampaigns, activeWithinDays, inactiveForDays }`
   */
  static filter (filter) {
    if (filter == null) filter = {};
    if (typeof filter !== 'object' || Array.isArray(filter)) fail('filter must be an object');
    const normalized = Object.fromEntries(LISTS.map((field) => [field, list(filter[field], field)]));
    normalized.activeWithinDays = days(filter.activeWithinDays, 'activeWithinDays', MAX_ACTIVE_DAYS);
    normalized.inactiveForDays = days(filter.inactiveForDays, 'inactiveForDays', MAX_INACTIVE_DAYS);
    if (normalized.activeWithinDays !== null && normalized.inactiveForDays !== null &&
      normalized.activeWithinDays <= normalized.inactiveForDays) {
      fail('filter.activeWithinDays must be more than filter.inactiveForDays');
    }
    return normalized;
  }

  /**
   * Validate a whole draft.
   * @param {Object} input `{ title?, content, filter? }`
   * @returns {{ title: string, content: Object, filter: Object }}
   */
  static draft (input) {
    if (!input || typeof input !== 'object') fail('campaign must be an object');
    const content = Campaign.content(input.content);
    const filter = Campaign.filter(input.filter);
    const title = String(input.title == null ? '' : input.title).trim().slice(0, MAX_TITLE) ||
      content.text.split('\n')[0].slice(0, 60);
    return { title, content, filter };
  }

  /**
   * Plain text for adapters without buttons: the message, who sent it, and
   * the typed replies that work.
   * @param {Object} message `CampaignMessage`
   * @returns {string}
   */
  static toText (message) {
    if (!message || typeof message !== 'object') return String(message == null ? '' : message);
    const sender = [message.sourceName, message.via].filter(Boolean);
    const lines = [message.text, ''];
    if (sender.length) lines.push(`— Sent by ${sender.join(' via ')}`);
    if (message.start) lines.push('Reply START to begin.');
    lines.push('Reply STOP to stop these messages.');
    return lines.join('\n');
  }
}

module.exports = Campaign;
module.exports.STATUSES = STATUSES;
module.exports.CAMPAIGN_ID = CAMPAIGN_ID;
module.exports.MAX_TEXT = MAX_TEXT;
