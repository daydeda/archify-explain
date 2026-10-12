    /* Explain panel, floating language/guide switch and file guide. All three
       read optional JSON emitted outside the SVG, so canonical exports stay
       unchanged. Without explain or guide data nothing is shown. */
    Archify.explainPanel = (function () {
      function readJson(id) {
        var element = document.getElementById(id);
        if (!element) return null;
        try {
          var parsed = JSON.parse(element.textContent || 'null');
          return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (_) { return null; }
      }
      var explain = readJson('archify-explain-data');
      var guide = readJson('archify-guide-data');
      var components = explain && explain.components && typeof explain.components === 'object' ? explain.components : null;
      var links = explain && Array.isArray(explain.links) ? explain.links : [];
      var panel = document.getElementById('explain-panel');
      var panelBody = document.getElementById('explain-panel-body');
      var panelClose = document.getElementById('explain-panel-close');
      var dock = document.getElementById('explain-dock');
      var tip = document.getElementById('explain-tip');
      var guideSection = document.getElementById('archify-guide');
      var container = document.querySelector('.diagram-container');
      var language = Archify.alternateLanguage;
      var html = document.documentElement;
      var current = null;
      var includeComponents = !guide || guide.include_components !== false;
      var hasGuide = Boolean((guide && Array.isArray(guide.sections) && guide.sections.length) || (components && includeComponents));

      // Panel chrome follows whichever language is showing. Languages without
      // an entry fall back to English.
      var UI = {
        en: { what: 'What it does', how: 'How it works', incoming: 'Incoming (who uses this)', outgoing: 'Outgoing (what this calls)', none: 'None', from: 'from', to: 'to', hint: 'Click a box name in a connection to jump to it · press Esc to close', close: 'Close', tip: 'Click any box to see what it does and how it connects', guide: 'Guide', guideTitle: 'File guide: what each part does and how it connects', files: 'Every part, one by one', why: 'Why', qa: 'Questions', open: 'Details and connections' },
        th: { what: 'ทำอะไร', how: 'ทำงานยังไง', incoming: 'เส้นที่เข้ามา (ใครเรียกส่วนนี้)', outgoing: 'เส้นที่ออกไป (ส่วนนี้เรียกใคร)', none: 'ไม่มี', from: 'จาก', to: 'ไปที่', hint: 'คลิกชื่อกล่องในเส้นเชื่อมเพื่อกระโดดไปดู · กด Esc เพื่อปิด', close: 'ปิด', tip: 'คลิกกล่องไหนก็ได้ เพื่อดูว่าทำอะไรและเชื่อมกับใคร', guide: 'คู่มือ', guideTitle: 'คู่มือไฟล์: แต่ละส่วนทำอะไร และเชื่อมกันยังไง', files: 'ทุกส่วน ทีละส่วน', why: 'ทำไม', qa: 'คำถามที่พบบ่อย', open: 'ดูรายละเอียดและเส้นเชื่อม' },
        zh: { what: '作用', how: '工作原理', incoming: '传入（谁使用它）', outgoing: '传出（它调用谁）', none: '无', from: '来自', to: '指向', hint: '点击连接中的名称跳转 · 按 Esc 关闭', close: '关闭', tip: '点击任意方框，查看它的作用和连接', guide: '指南', guideTitle: '文件指南：每个部分做什么、如何连接', files: '逐个说明各部分', why: '为什么', qa: '问答', open: '详情与连接' }
      };
      function ui(key) {
        var code = String(html.getAttribute('lang') || 'en').split('-')[0].toLowerCase();
        var table = UI[code] || UI.en;
        return table[key] || UI.en[key];
      }
      function t(value) {
        var text = value == null ? '' : String(value);
        return language && language.available() ? language.text(text) : text;
      }
      function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) appendRich(node, text);
        return node;
      }
      // Code-looking tokens (`quoted`, calls, dotted names, paths) become
      // <code>. Text is only ever inserted as text nodes.
      var CODE_RE = /`([^`]+)`|((?:[A-Za-z_$][\w$]*\.)+[A-Za-z_$][\w$]*(?:\([^()]*\))?|[A-Za-z_$][\w$]*\([^()]*\)|(?:[\w.-]+\/)+[\w.-]+)/g;
      function appendRich(node, text) {
        var value = String(text);
        var last = 0;
        var match;
        CODE_RE.lastIndex = 0;
        while ((match = CODE_RE.exec(value))) {
          if (match.index > last) node.appendChild(document.createTextNode(value.slice(last, match.index)));
          var code = document.createElement('code');
          code.textContent = match[1] || match[2];
          node.appendChild(code);
          last = CODE_RE.lastIndex;
        }
        if (last < value.length) node.appendChild(document.createTextNode(value.slice(last)));
      }
      function list(tag, items) {
        var listNode = el(tag);
        items.forEach(function (item) { listNode.appendChild(el('li', null, t(item))); });
        return listNode;
      }
      function labelOf(id) {
        var entry = components && components[id];
        return t(entry && entry.label ? entry.label : id);
      }
      function badges(target, file, owner, layer) {
        if (file) target.appendChild(el('div', 'explain-path', file));
        if (owner || layer) {
          var row = el('div', 'explain-badges');
          if (layer) row.appendChild(el('span', 'explain-badge', t(layer)));
          if (owner) row.appendChild(el('span', 'explain-badge owner', t(owner)));
          target.appendChild(row);
        }
      }

      function connections(id, direction) {
        var matches = links.filter(function (link) { return direction === 'in' ? link.to === id : link.from === id; });
        if (!matches.length) return [el('p', 'explain-none', ui('none'))];
        return matches.map(function (link) {
          var other = direction === 'in' ? link.from : link.to;
          var box = el('div', 'explain-edge');
          box.appendChild(el('span', 'explain-edge-dir', direction === 'in' ? ui('from') : ui('to')));
          box.appendChild(document.createTextNode(' '));
          var jump = document.createElement('button');
          jump.type = 'button';
          jump.className = 'explain-jump';
          jump.setAttribute('data-explain-go', other);
          jump.textContent = labelOf(other);
          box.appendChild(jump);
          if (link.label) {
            box.appendChild(document.createTextNode(' · '));
            var code = document.createElement('code');
            code.textContent = t(link.label);
            box.appendChild(code);
          }
          if (link.explanation) box.appendChild(el('div', 'explain-why', t(link.explanation)));
          return box;
        });
      }

      function render(id) {
        var entry = components && components[id];
        if (!entry || !panel) return;
        current = id;
        panelBody.textContent = '';
        panelBody.appendChild(el('h2', 'explain-title', t(entry.label || id)));
        if (entry.sublabel) panelBody.appendChild(el('p', 'explain-sublabel', t(entry.sublabel)));
        badges(panelBody, entry.file, entry.owner, entry.layer);
        if (entry.summary) {
          panelBody.appendChild(el('h3', null, ui('what')));
          panelBody.appendChild(el('p', null, t(entry.summary)));
        }
        if (Array.isArray(entry.steps) && entry.steps.length) {
          panelBody.appendChild(el('h3', null, ui('how')));
          panelBody.appendChild(list('ol', entry.steps));
        }
        panelBody.appendChild(el('h3', null, ui('incoming')));
        connections(id, 'in').forEach(function (node) { panelBody.appendChild(node); });
        panelBody.appendChild(el('h3', null, ui('outgoing')));
        connections(id, 'out').forEach(function (node) { panelBody.appendChild(node); });
        panelBody.appendChild(el('p', 'explain-hint', ui('hint')));
        panelClose.setAttribute('aria-label', ui('close'));
        panel.hidden = false;
        html.classList.add('explain-panel-open');
        panel.scrollTop = 0;
      }
      function close() {
        if (!panel || panel.hidden) return;
        panel.hidden = true;
        html.classList.remove('explain-panel-open');
        current = null;
      }

      function guideCard(card) {
        var box = el('div', 'guide-card');
        box.appendChild(el('h3', null, t(card.title)));
        badges(box, card.file, card.owner, card.layer);
        if (card.text) box.appendChild(el('p', null, t(card.text)));
        if (Array.isArray(card.steps) && card.steps.length) box.appendChild(list('ol', card.steps));
        if (Array.isArray(card.items) && card.items.length) box.appendChild(list('ul', card.items));
        if (card.why) {
          var why = el('div', 'guide-why');
          why.appendChild(el('strong', null, ui('why') + ': '));
          appendRich(why, t(card.why));
          box.appendChild(why);
        }
        if (Array.isArray(card.qa) && card.qa.length) {
          var qa = el('div', 'guide-qa');
          qa.appendChild(el('strong', null, ui('qa')));
          card.qa.forEach(function (pair) {
            qa.appendChild(el('p', 'guide-q', t(pair.q)));
            qa.appendChild(el('p', 'guide-a', t(pair.a)));
          });
          box.appendChild(qa);
        }
        if (card.node) {
          var open = document.createElement('button');
          open.type = 'button';
          open.className = 'explain-jump';
          open.setAttribute('data-explain-go', card.node);
          open.textContent = ui('open') + ' →';
          box.appendChild(open);
        }
        return box;
      }
      function renderGuide() {
        if (!guideSection || !hasGuide) return;
        guideSection.textContent = '';
        guideSection.appendChild(el('h2', null, '📘 ' + (guide && guide.title ? t(guide.title) : ui('guideTitle'))));
        if (guide && guide.intro) guideSection.appendChild(el('p', 'guide-intro', t(guide.intro)));
        (guide && Array.isArray(guide.sections) ? guide.sections : []).forEach(function (section) {
          guideSection.appendChild(el('h2', 'guide-section-title', t(section.title)));
          if (section.intro) guideSection.appendChild(el('p', 'guide-intro', t(section.intro)));
          var grid = el('div', 'guide-grid');
          (section.cards || []).forEach(function (card) { grid.appendChild(guideCard(card)); });
          guideSection.appendChild(grid);
        });
        if (components && includeComponents) {
          guideSection.appendChild(el('h2', 'guide-section-title', '🗂️ ' + ui('files')));
          var grid = el('div', 'guide-grid');
          Object.keys(components).forEach(function (id) {
            var entry = components[id];
            if (!entry.summary && !(entry.steps && entry.steps.length)) return;
            grid.appendChild(guideCard({ title: entry.label || id, file: entry.file, owner: entry.owner, layer: entry.layer, text: entry.summary, steps: entry.steps, node: id }));
          });
          guideSection.appendChild(grid);
        }
        guideSection.hidden = false;
      }

      function renderDock() {
        if (!dock) return;
        dock.textContent = '';
        var showLanguage = language && language.available();
        if (showLanguage) {
          var info = language.labels();
          [[false, info.base], [true, info.alternate]].forEach(function (pair) {
            var button = document.createElement('button');
            button.type = 'button';
            button.textContent = pair[1];
            button.setAttribute('aria-pressed', language.active() === pair[0] ? 'true' : 'false');
            button.addEventListener('click', function () { language.set(pair[0]); });
            dock.appendChild(button);
          });
        }
        if (hasGuide) {
          var guideButton = document.createElement('button');
          guideButton.type = 'button';
          guideButton.className = 'explain-dock-guide';
          guideButton.textContent = '📘 ' + ui('guide');
          guideButton.addEventListener('click', function () {
            close();
            guideSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
          dock.appendChild(guideButton);
        }
        dock.hidden = !dock.childNodes.length;
      }

      function refresh() {
        renderDock();
        renderGuide();
        if (current) render(current);
        if (tip && !tip.hidden) tip.textContent = '👆 ' + ui('tip');
      }

      if (components && panel) {
        document.addEventListener('click', function (event) {
          var target = event.target;
          if (!target || typeof target.closest !== 'function') return;
          var go = target.closest('[data-explain-go]');
          if (go) { render(go.getAttribute('data-explain-go')); return; }
          if (target.closest('#explain-panel-close')) { close(); return; }
          var node = target.closest('.diagram-container [data-node-id]');
          if (node && container && container.getAttribute('data-just-panned') !== 'true') render(node.getAttribute('data-node-id'));
        });
        document.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') { close(); return; }
          var target = event.target;
          if ((event.key === 'Enter' || event.key === ' ') && target && target.closest) {
            var node = target.closest('.diagram-container [data-node-id]');
            if (node) render(node.getAttribute('data-node-id'));
          }
        });
        if (tip) {
          tip.hidden = false;
          setTimeout(function () { tip.classList.add('fading'); setTimeout(function () { tip.hidden = true; }, 700); }, 9000);
        }
      }
      if (components || hasGuide) {
        new MutationObserver(refresh).observe(html, { attributes: true, attributeFilter: ['lang'] });
        refresh();
      }
      return { open: render, close: close };
    })();
