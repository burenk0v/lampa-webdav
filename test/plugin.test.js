const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('built plugin registers settings, browser component and menu entry', () => {
  const registered = { settings: [], params: [], components: {}, menuItems: 0 };
  const menu = {
    length: 1,
    append() { registered.menuItems++; },
    eq() { return this; }
  };
  function jquery() {
    return {
      length: 1,
      eq() { return this; },
      append() { registered.menuItems++; return this; },
      on() { return this; },
      text() { return this; },
      empty() { return this; },
      remove() { return this; }
    };
  }
  const lampa = {
    Storage: { field() { return ''; } },
    SettingsApi: {
      addComponent(value) { registered.settings.push(value); },
      addParam(value) { registered.params.push(value); }
    },
    Component: {
      get(name) { return registered.components[name]; },
      add(name, component) { registered.components[name] = component; }
    },
    Activity: { push() {} },
    Listener: { follow() {} }
  };
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
  context.LampaWebDAVCore = { normalizeBaseUrl: value => value, resolveHref: (base, value) => value };
  context.LampaWebDAVClient = { WebDAVClient: function () {} };
  vm.runInNewContext(fs.readFileSync('dist/lampa-webdav.js', 'utf8'), context);
  assert.equal(registered.settings.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(registered.settings[0], 'after'), false);
  assert.equal(registered.params.length, 3);
  assert.equal(typeof registered.components.lampa_webdav_browser, 'function');
  assert.equal(registered.menuItems, 1);
});

test('built plugin is guarded against duplicate initialization', () => {
  let settingsCalls = 0;
  const lampa = {
    Storage: { field() { return ''; } },
    SettingsApi: {
      addComponent() { settingsCalls++; },
      addParam() {}
    },
    Component: { get() { return true; }, add() {} },
    Listener: { follow() {} }
  };
  const jquery = function () {
    return { length: 1, eq() { return this; }, append() { return this; }, on() { return this; } };
  };
  const context = { URL, window: null, Lampa: lampa, $: jquery, jQuery: jquery, appready: true };
  context.window = context;
  context.Lampa = lampa;
  vm.runInNewContext(fs.readFileSync('dist/lampa-webdav.js', 'utf8'), context);
  vm.runInNewContext(fs.readFileSync('dist/lampa-webdav.js', 'utf8'), context);
  assert.equal(settingsCalls, 1);
});
