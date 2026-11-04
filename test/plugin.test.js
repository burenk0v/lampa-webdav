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

test('built plugin registers WebDAV settings, menu and browser through SettingsApi', () => {
  const registered = { components: {}, menuItems: 0, settings: [], params: [] };
  const lampa = {
    Storage: { field() { return ''; }, set() {} },
    Component: {
      get(name) { return registered.components[name]; },
      add(name, component) { registered.components[name] = component; }
    },
    Activity: { push() {} },
    SettingsApi: {
      addComponent(value) { registered.settings.push(value); },
      addParam(value) { registered.params.push(value); }
    },
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
  assert.equal(registered.settings.length, 1);
  assert.equal(registered.settings[0].component, 'lampa_webdav');
  assert.equal(registered.params.length, 3);
  assert.deepEqual(registered.params.map((item) => item.param.name), [
    'lampa_webdav_url',
    'lampa_webdav_username',
    'lampa_webdav_password'
  ]);
  assert.ok(registered.params.every((item) => item.param.type === 'input'));
  assert.ok(registered.params.every((item) => item.param.values === ''), 'input params must initialize Lampa Params values as a string to avoid undefined[key] during settings rendering');
  assert.equal(typeof registered.params[2].onRender, 'function', 'password field must mask its displayed value');
  assert.equal(registered.params[0].onRender, undefined);
  assert.equal(registered.params[1].onRender, undefined);
  const maskedNode = { textContent: '' };
  const maskedItem = { find() { return [maskedNode]; } };
  let mutationCallback;
  context.MutationObserver = function (callback) {
    mutationCallback = callback;
    this.observe = function () {};
  };
  registered.params[2].onRender(maskedItem);
  maskedNode.textContent = 'secret123';
  mutationCallback();
  assert.equal(maskedNode.textContent, '*********');
  assert.ok(registered.settings.every((item) => !Object.hasOwn(item, 'after')));
  const component = new registered.components.lampa_webdav_browser({});
  assert.doesNotThrow(() => component.create());
  assert.equal(typeof component.render, 'function');
  assert.equal(typeof component.start, 'function');
  assert.equal(typeof component.pause, 'function');
  assert.equal(typeof component.stop, 'function');
  assert.doesNotThrow(() => component.start());
});

test('built plugin is guarded against duplicate initialization', () => {
  const registered = { components: {}, menuItems: 0, settings: [], params: [] };
  const lampa = {
    Storage: { field() { return ''; }, set() {} },
    Component: {
      get(name) { return registered.components[name]; },
      add(name, component) { registered.components[name] = component; }
    },
    Activity: { push() {} },
    SettingsApi: {
      addComponent(value) { registered.settings.push(value); },
      addParam(value) { registered.params.push(value); }
    },
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
