const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createJQuery(registered) {
  return function (selector) {
    const isMenu = selector === '.menu .menu__list';
    return {
      length: 1,
      eq() { return this; },
      append() { if (isMenu && registered) registered.menuItems++; return this; },
      on() { return this; },
      text() { return this; },
      empty() { return this; },
      remove() { return this; }
    };
  };
}

test('built plugin registers its menu and browser without using global SettingsApi', () => {
  const registered = { components: {}, menuItems: 0 };
  const lampa = {
    Storage: { field() { return ''; }, set() {} },
    Component: {
      get(name) { return registered.components[name]; },
      add(name, component) { registered.components[name] = component; }
    },
    Activity: { push() {} },
    Input: { show() {} },
    Listener: { follow() {} }
  };
  const jquery = createJQuery(registered);
  const context = {
    console,
    URL,
    window: null,
    Lampa: lampa,
    jQuery: jquery,
    $: jquery,
    appready: true
  };
  context.window = context;
  context.Lampa = lampa;
  context.LampaWebDAVCore = {
    normalizeBaseUrl(value) { if (!value) throw new Error('missing'); return value; },
    resolveHref(base, value) { return value || base; }
  };
  context.LampaWebDAVClient = { WebDAVClient: function () {} };
  vm.runInNewContext(fs.readFileSync('dist/lampa-webdav.js', 'utf8'), context);
  assert.equal(typeof registered.components.lampa_webdav_browser, 'function');
  assert.equal(registered.menuItems, 1);
  const component = new registered.components.lampa_webdav_browser({});
  assert.doesNotThrow(() => component.create());
  assert.equal(typeof component.render, 'function');
  assert.equal(typeof component.start, 'function');
  assert.equal(typeof component.pause, 'function');
  assert.equal(typeof component.stop, 'function');
  assert.doesNotThrow(() => component.start());
});

test('built plugin is guarded against duplicate initialization', () => {
  const registered = { components: {}, menuItems: 0 };
  const lampa = {
    Storage: { field() { return ''; }, set() {} },
    Component: {
      get(name) { return registered.components[name]; },
      add(name, component) { registered.components[name] = component; }
    },
    Activity: { push() {} },
    Input: { show() {} },
    Listener: { follow() {} }
  };
  const jquery = createJQuery(registered);
  const context = { URL, window: null, Lampa: lampa, $: jquery, jQuery: jquery, appready: true };
  context.window = context;
  context.Lampa = lampa;
  context.LampaWebDAVCore = {};
  context.LampaWebDAVClient = {};
  vm.runInNewContext(fs.readFileSync('dist/lampa-webdav.js', 'utf8'), context);
  vm.runInNewContext(fs.readFileSync('dist/lampa-webdav.js', 'utf8'), context);
  assert.equal(registered.menuItems, 1);
});
