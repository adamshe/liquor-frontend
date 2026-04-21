/* Generic product-name autocomplete.
 *
 * Attach to any input + dropdown pair. Caller supplies a way to fetch
 * products and a callback to run when one is picked.
 *
 * Usage:
 *   createProductAutocomplete({
 *     input: document.getElementById('myInput'),
 *     dropdown: document.getElementById('myDropdown'),
 *     getItems: async () => {
 *       const r = await fetch('/api/stores/1/product-names');
 *       return r.json();              // [{name, sku?, vendor_id?, ...}, ...]
 *     },
 *     onSelect: (item) => {
 *       input.value = item.name;
 *       // also fill SKU field elsewhere etc
 *     },
 *   });
 *
 * Styling: expects the dropdown container to have CSS classes
 * .autocomplete (the container, shown/hidden by adding .active),
 * .autocomplete-item, and .autocomplete-item.selected. The styles from
 * index.html are compatible; poentry.html defines its own matching set.
 */
(function(global) {
  'use strict';

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function highlightMatch(name, query) {
    if (!query) return esc(name);
    const idx = name.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return esc(name);
    return esc(name.slice(0, idx))
      + '<mark>' + esc(name.slice(idx, idx + query.length)) + '</mark>'
      + esc(name.slice(idx + query.length));
  }

  /**
   * Create an autocomplete controller bound to the given input/dropdown pair.
   *
   * Options:
   *   input     (HTMLInputElement)  -- required
   *   dropdown  (HTMLElement)        -- required; will receive suggestion items
   *   getItems  (fn -> Promise|Array) -- required; list of {name, ...}
   *   onSelect  (fn(item) -> void)    -- required
   *   renderItem (optional)           -- (item, highlightKey) -> innerHTML
   *   customMatch (optional)          -- (items, inputEl) -> {matches, highlightKey}
   *      When provided, replaces the default "filter by full-input includes"
   *      strategy. Lets callers implement word-at-caret, multi-token AND,
   *      stop-words, etc. Return { matches: Item[], highlightKey: string }.
   *   limit     (number, default 12)  -- max suggestions shown
   *   minChars  (number, default 2)   -- start filtering after this many chars
   *   closeOnBlur (bool, default true) -- hide dropdown on input blur
   *   acceptTab (bool, default true)  -- Tab also picks the selected item
   *   captureKeyboard (bool, default false) -- attach keydown with capture=true
   *      and stopImmediatePropagation, so outer handlers don't see Enter/Tab/
   *      arrows when the dropdown is active. Use when the input is inside a
   *      form with its own Enter submit handler.
   */
  function createProductAutocomplete(opts) {
    const { input, dropdown, getItems, onSelect,
            renderItem, customMatch, limit = 12, minChars = 2,
            closeOnBlur = true, acceptTab = true,
            captureKeyboard = false } = opts;
    if (!input || !dropdown || !getItems || !onSelect) {
      throw new Error('createProductAutocomplete: missing required option');
    }

    let _items = null;
    let _matches = [];
    let _selected = -1;

    async function _ensureItems() {
      if (_items !== null) return _items;
      const result = getItems();
      _items = await Promise.resolve(result);
      if (!Array.isArray(_items)) _items = [];
      return _items;
    }

    function _getName(it) {
      if (!it) return '';
      if (typeof it === 'string') return it;
      return String(it.name || '');
    }

    const _defaultRender = (item, key) =>
      `<span class="ac-name">${highlightMatch(_getName(item), key)}</span>`;

    async function refresh() {
      const items = await _ensureItems();
      let matches, highlightKey;
      if (customMatch) {
        const r = customMatch(items, input) || {};
        matches = Array.isArray(r.matches) ? r.matches : [];
        highlightKey = r.highlightKey || '';
      } else {
        const q = (input.value || '').trim().toLowerCase();
        if (q.length < minChars) { close(); return; }
        matches = items.filter(i => _getName(i).toLowerCase().includes(q));
        highlightKey = q;
      }
      _matches = matches.slice(0, limit);
      if (_matches.length === 0) { close(); return; }
      _selected = 0;
      const renderFn = renderItem || _defaultRender;
      dropdown.innerHTML = _matches
        .map((m, i) => `<div class="autocomplete-item${i === 0 ? ' selected' : ''}" data-idx="${i}">${renderFn(m, highlightKey)}</div>`)
        .join('');
      dropdown.classList.add('active');
    }

    function close() {
      dropdown.classList.remove('active');
      _selected = -1;
    }

    function _updateSelected() {
      dropdown.querySelectorAll('.autocomplete-item').forEach((el, i) => {
        el.classList.toggle('selected', i === _selected);
      });
      const selEl = dropdown.querySelector('.autocomplete-item.selected');
      if (selEl && selEl.scrollIntoView) selEl.scrollIntoView({ block: 'nearest' });
    }

    function _pick(item) {
      close();
      try { onSelect(item); }
      catch (e) { console.error('autocomplete onSelect threw:', e); }
    }

    input.addEventListener('input', refresh);
    input.addEventListener('focus', refresh);
    if (closeOnBlur) {
      // Delay so mousedown on dropdown item fires before blur closes it.
      input.addEventListener('blur', () => setTimeout(close, 150));
    }
    input.addEventListener('keydown', (e) => {
      if (!dropdown.classList.contains('active') || _matches.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        _selected = Math.min(_matches.length - 1, _selected + 1);
        _updateSelected();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _selected = Math.max(0, _selected - 1);
        _updateSelected();
      } else if (e.key === 'Enter' && _selected >= 0) {
        e.preventDefault();
        _pick(_matches[_selected]);
      } else if (e.key === 'Escape') {
        close();
      }
    });
    dropdown.addEventListener('mousedown', (e) => {
      const el = e.target.closest('.autocomplete-item');
      if (el) {
        e.preventDefault();   // don't steal input focus before pick
        const idx = +el.dataset.idx;
        if (_matches[idx]) _pick(_matches[idx]);
      }
    });

    return {
      refresh,
      close,
      setItems: (items) => { _items = Array.isArray(items) ? items : []; },
      invalidate: () => { _items = null; },
    };
  }

  global.createProductAutocomplete = createProductAutocomplete;
})(typeof window !== 'undefined' ? window : this);
