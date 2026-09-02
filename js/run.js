/* ========================================
   공정 입력 — 공정 진행 화면
   등록된 Lot을 눌러 단계를 시작하고 끝낸다.
   의존성: googleSheets.js, process.js(PRODUCT_CODES·REACTORS_BY_PROCESS), app.js(showScreen)
   ======================================== */

let run = {
    product: '',
    lots: null,        // [{lotNo, process, reactor, at, doneSteps, started, waiting, from}]
    recipes: {},       // '제품|공정' → 단계 배열
    lot: null,         // 지금 열어 놓은 Lot
    steps: null,       // 그 Lot의 레시피
    nextOpen: false,   // 「다음 Lot 만들기」 칸을 펼쳤는지
    nextReactor: '',
    locked: false,     // 남이 잠가 둔 걸 알고도 들어왔는지
    beat: null         // 잠금 연장 타이머
};

/* ----------------------------------------
   이 기기를 알아보는 이름.
   사람 이름이 아니라 기기 이름이다 — 누가 잡았는지가 아니라
   「나 말고 다른 데서 잡고 있다」만 알면 되기 때문이다.
   ---------------------------------------- */
function runWho() {
    const make = () => 'D' + Math.random().toString(36).slice(2, 8);
    try {
        let w = localStorage.getItem('facsys_device');
        if (!w) { w = make(); localStorage.setItem('facsys_device', w); }
        return w;
    } catch { return make(); }
}

function esc(s) {
    return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function setRunStatus(msg, isError, id) {
    const el = document.getElementById(id || 'run-status');
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
    el.className = 'entry-status' + (isError ? ' error' : '');
}

/**
 * 지금의 한국 시각.
 * ※ todayKSTDate()는 「오늘 0시」라 시·분이 없다. 여기서는 시·분이 필요하다.
 *   기기 시계가 다른 나라로 맞춰져 있어도 한국 시각이 나오게 밀어 준다.
 */
function kstNow() {
    const now = new Date();
    return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 9 * 3600000);
}

/** 'HH:MM' → 'yyyy-MM-dd HH:mm:ss' (오늘 날짜, KST) */
function runAtFrom(timeStr) {
    if (!timeStr || !/^\d{1,2}:\d{2}$/.test(timeStr)) return '';   // 비우면 서버가 지금 시각을 찍는다
    const d = kstNow();
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const [hh, mm] = timeStr.split(':');
    return `${ymd} ${String(hh).padStart(2, '0')}:${mm}:00`;
}

function nowHHMM() {
    const d = kstNow();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function nowStamp() {
    const d = kstNow();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` +
           ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

/** 시각 글자에서 「08-28 14:34」만 뽑는다 */
function shortAt(s) {
    const m = String(s || '').match(/\d{4}-(\d{2}-\d{2}) (\d{2}:\d{2})/);
    return m ? `${m[1]} ${m[2]}` : '';
}


/* ══════════════════════════════════════════
   Lot 목록
   ══════════════════════════════════════════ */

async function openProcessRun() {
    showScreen('run-screen', 'process');
    renderRunProducts();

    if (!entry.products) {
        setRunStatus('제품 목록을 불러오는 중…');
        try {
            entry.products = await googleSheetsManager.getRecipeProducts();
            setRunStatus('');
        } catch (err) {
            setRunStatus(
                `제품 목록을 불러오지 못했습니다.\n${err.message}\n\n` +
                `· 헤더의 「연결」에서 웹앱 URL이 설정돼 있는지\n` +
                `· Apps Script를 「새 버전」으로 재배포했는지 확인해 주세요.`,
                true
            );
            addRetryButton('run-status', 'openProcessRun');
            return;
        }
    }
    renderRunProducts();
    if (run.product) loadRunLots();
}

function renderRunProducts() {
    const box = document.getElementById('run-products');
    if (!box) return;
    if (!entry.products) { box.innerHTML = ''; return; }
    box.innerHTML = entry.products.map(p =>
        `<button type="button" class="pick-btn${p.product === run.product ? ' on' : ''}"
                 onclick="pickRunProduct('${esc(p.product)}')">${esc(p.product)}</button>`
    ).join('');
}

function pickRunProduct(product) {
    run.product = product;
    run.lots = null;
    renderRunProducts();
    loadRunLots();
}

async function loadRunLots() {
    const step = document.getElementById('run-step-lots');
    if (step) step.style.display = run.product ? 'block' : 'none';
    if (!run.product) return;

    setRunStatus('Lot을 불러오는 중…');
    renderRunLots();
    try {
        run.lots = await googleSheetsManager.getLots(run.product);
        setRunStatus('');
    } catch (err) {
        run.lots = [];
        setRunStatus(`Lot 목록을 불러오지 못했습니다.\n${err.message}`, true);
    }

    // 카드에 「3/6 단계」를 적으려면 레시피가 있어야 한다. 나온 공정만 미리 받아 둔다.
    const need = [...new Set((run.lots || []).map(l => l.process))];
    for (const proc of need) {
        try { await loadRecipe(run.product, proc); } catch { /* 없으면 단계 수만 못 적는다 */ }
    }
    renderRunLots();
}

async function loadRecipe(product, process) {
    const key = `${product}|${process}`;
    if (!run.recipes[key]) {
        run.recipes[key] = await googleSheetsManager.getRecipe(product, process);
    }
    return run.recipes[key];
}

/** 카드에 적을 한 줄 요약 */
function lotStateText(lot) {
    const steps = run.recipes[`${run.product}|${lot.process}`];
    const total = steps ? steps.length : 0;
    const doneN = (lot.doneSteps || []).length;

    if (lot.waiting) return { text: '대기 중 — 무게를 넣으면 끝납니다', cls: 'wait' };
    if (lot.started) return { text: `${lot.started.step} 진행 중`, cls: 'now' };
    if (doneN === 0)  return { text: '아직 시작 전', cls: 'idle' };
    if (total && doneN >= total) return { text: '모든 단계 끝 — 완료를 눌러 주세요', cls: 'ready' };

    const next = steps ? steps.find(s => !(lot.doneSteps || []).includes(s.order)) : null;
    return {
        text: `${doneN}${total ? '/' + total : ''} 단계 완료` + (next ? ` · 다음: ${next.step}` : ''),
        cls: 'idle'
    };
}

function renderRunLots() {
    const box = document.getElementById('run-lots');
    if (!box) return;

    if (!run.lots) { box.innerHTML = '<div class="recipe-empty">불러오는 중…</div>'; return; }
    if (!run.lots.length) {
        box.innerHTML = '<div class="recipe-empty">진행 중인 Lot이 없습니다.<br>' +
                        '「제품 입력」에서 Lot을 먼저 등록해 주세요.</div>';
        return;
    }

    box.innerHTML = run.lots.map(l => {
        const st = lotStateText(l);
        const from = l.from ? `<div class="lot-card-from">← ${esc(l.from)}</div>` : '';
        return `<button type="button" class="lot-card"
                        onclick="openLotRun('${esc(l.lotNo)}','${esc(l.process)}')">
                  <div class="lot-card-top">
                    <span class="lot-card-no">${esc(l.lotNo)}</span>
                    <span class="lot-card-meta">${esc(l.process)} · ${esc(l.reactor)}</span>
                  </div>
                  <div class="lot-card-state ${st.cls}">${esc(st.text)}</div>
                  ${from}
                </button>`;
    }).join('');
}


/* ══════════════════════════════════════════
   한 Lot의 단계 화면
   ══════════════════════════════════════════ */

async function openLotRun(lotNo, process) {
    const lot = (run.lots || []).find(l => l.lotNo === lotNo && l.process === process);
    if (!lot) { alert('그 Lot을 찾지 못했습니다. 목록을 새로고침해 주세요.'); return; }

    // 다른 사람이 만지고 있는지 먼저 확인한다.
    //
    // ★ 잠겼다고 아예 못 열게 하지는 않는다.
    //   같은 사람이 PC에서 열어 둔 채 휴대폰으로 보는 일이 흔하고,
    //   그때 「10분 기다리세요」는 현장을 세운다. 알려 주고 사람이 정하게 한다.
    run.locked = false;
    try {
        const got = await googleSheetsManager.claimLot(run.product, lotNo, process, runWho());
        if (got && got.ok === false) {
            const go = confirm(
                '이 Lot을 다른 기기에서 열어 두었습니다.\n\n' +
                `${lotNo} (${process})\n\n` +
                '그래도 여시겠습니까?\n' +
                '두 사람이 동시에 적으면 같은 기록이 두 번 들어갈 수 있습니다.\n' +
                '(다른 기기에서 「← Lot 목록」을 누르면 바로 풀립니다)'
            );
            if (!go) return;
            run.locked = true;   // 남의 잠금은 뺏지 않는다 — 그쪽이 먼저다
        }
    } catch (err) {
        // 잠금 확인이 안 돼도 작업은 막지 않는다. 현장이 멈추는 쪽이 더 나쁘다.
        console.warn('잠금 확인 실패 — 그냥 진행합니다:', err.message);
    }

    run.lot = lot;
    run.nextOpen = false;
    run.nextReactor = '';
    run.steps = null;
    showScreen('run-lot-screen', 'process');
    renderLotRun();

    setRunStatus('레시피를 불러오는 중…', false, 'run-lot-status');
    try {
        run.steps = await loadRecipe(run.product, process);
        setRunStatus('', false, 'run-lot-status');
    } catch (err) {
        setRunStatus(`레시피를 불러오지 못했습니다.\n${err.message}`, true, 'run-lot-status');
    }
    renderLotRun();

    // 열어 둔 동안 잠금을 이어 붙인다(서버 쪽은 10분).
    // 남의 잠금을 뺏고 들어온 경우(run.locked)에는 이어 붙이지 않는다.
    if (run.beat) clearInterval(run.beat);
    if (!run.locked) {
        run.beat = setInterval(() => {
            if (!run.lot) return;
            googleSheetsManager.claimLot(run.product, run.lot.lotNo, run.lot.process, runWho())
                .catch(() => {});
        }, 4 * 60 * 1000);
    }
}

function closeLotRun() {
    if (run.beat) { clearInterval(run.beat); run.beat = null; }
    if (run.lot && !run.locked) {
        googleSheetsManager.releaseLot(run.product, run.lot.lotNo, run.lot.process, runWho());
    }
    run.lot = null;
    run.steps = null;
    run.locked = false;
    showScreen('run-screen', 'process');
    loadRunLots();
}

/*
 * 창을 닫거나, 다른 앱으로 넘어가거나, 화면이 꺼질 때도 잠금을 푼다.
 * 「← Lot 목록」을 누르고 나오는 사람만 있는 게 아니다 —
 * 대부분은 그냥 브라우저를 닫거나 휴대폰을 주머니에 넣는다.
 */
window.addEventListener('pagehide', () => {
    if (!run.lot || run.locked) return;
    googleSheetsManager.releaseLotBeacon(run.product, run.lot.lotNo, run.lot.process, runWho());
});

function renderLotRun() {
    const L = run.lot;
    if (!L) return;

    const head = document.getElementById('run-lot-head');
    if (head) {
        head.innerHTML =
            `<div class="run-lot-no">${esc(L.lotNo)}</div>
             <div class="run-lot-meta">${esc(run.product)} · ${esc(L.process)} · ${esc(L.reactor)}</div>` +
            (L.from ? `<div class="run-lot-from">투입 Lot: ${esc(L.from)}</div>` : '') +
            (run.locked
                ? `<div class="run-lot-warn">⚠ 다른 기기에서도 이 Lot을 열어 두었습니다</div>` : '');
    }

    renderRunSteps();
    renderRunFinish();
    renderRunUndo();
}

/* ══════════════════════════════════════════
   되돌리기 — 방금 누른 것 취소
   ══════════════════════════════════════════ */

function renderRunUndo() {
    const box = document.getElementById('run-undo');
    if (!box) return;
    if (!run.lot || !run.steps) { box.innerHTML = ''; return; }

    box.innerHTML = `
        <button type="button" class="undo-link" id="btn-undo" onclick="undoLast()">
          ↩ 방금 한 것 되돌리기
        </button>
        <div class="undo-hint">
          마지막으로 누른 것 하나만 취소됩니다. 그 이전 것은 관리자가 시트에서 고칩니다.
        </div>`;
}

async function undoLast() {
    const L = run.lot;
    if (!L) return;

    const btn = document.getElementById('btn-undo');
    if (btn) { btn.disabled = true; btn.textContent = '확인 중…'; }

    let info;
    try {
        info = await googleSheetsManager.getUndoInfo(run.product, L.lotNo, L.process);
    } catch (err) {
        alert('확인하지 못했습니다.\n\n' + err.message);
        renderRunUndo();
        return;
    }
    renderRunUndo();

    if (!info || !info.can) {
        alert('되돌릴 수 없습니다.\n\n' + ((info && info.why) || '되돌릴 기록이 없습니다.'));
        return;
    }

    // 무엇이 지워지는지 먼저 보여 준다. 「되돌릴까요?」만 물으면 무엇이 지워지는지 모른다.
    const what = (info.step ? info.step + ' ' : '') + info.event;
    let msg = `${L.lotNo}\n\n마지막에 한 것을 되돌립니다.\n\n` +
              `  ${what}` + (info.at ? `  (${shortAt(info.at)})` : '') + '\n' +
              `  기록 ${info.rows}줄이 시트에서 지워집니다.\n\n`;

    if (info.lots && info.lots.length > 1) {
        msg += `함께 농축한 Lot ${info.lots.length}개가 같이 되돌아갑니다:\n` +
               info.lots.map(x => '  · ' + x).join('\n') + '\n\n';
    }
    if (info.event === 'Lot등록') {
        msg += '⚠ 이 Lot이 아예 없어집니다.\n\n';
    }
    msg += '계속할까요?';

    if (!confirm(msg)) return;

    await withBusy('btn-undo', async () => {
        await googleSheetsManager.undoLastStep(run.product, L.lotNo, L.process, runWho());
        alert(`↩ 되돌렸습니다.\n\n${what}`);
        // 화면 상태를 손으로 맞추지 않고 목록으로 나가 다시 읽는다.
        // 되돌리기는 여러 줄을 건드리므로 손으로 맞추면 어긋나기 쉽다.
        closeLotRun();
    });
}

function renderRunSteps() {
    const box = document.getElementById('run-steps');
    if (!box) return;

    const L = run.lot;
    const steps = run.steps;
    if (!steps) { box.innerHTML = ''; return; }
    if (!steps.length) {
        box.innerHTML = '<div class="recipe-empty">이 제품·공정의 레시피가 시트에 없습니다.</div>';
        return;
    }

    const done = new Set(L.doneSteps || []);
    const current = steps.find(s => !done.has(s.order));

    box.innerHTML = steps.map(s => {
        if (done.has(s.order)) {
            return `<div class="step-row done">
                      <div class="step-no">✓</div>
                      <div class="step-body"><div class="step-name">${esc(s.step)}</div></div>
                    </div>`;
        }
        if (!current || s.order !== current.order) {
            const cond = (s.conditions || []).map(c =>
                `<span class="cond">${esc(c.name)} ${esc(c.value)}${esc(c.unit)}</span>`).join('');
            return `<div class="step-row later">
                      <div class="step-no">${s.order}</div>
                      <div class="step-body">
                        <div class="step-name">${esc(s.step)}</div>
                        <div class="recipe-meta">${cond}</div>
                      </div>
                    </div>`;
        }
        return renderCurrentStep(s);
    }).join('');
}

/** 지금 차례인 단계 — 여기서만 입력을 받는다 */
function renderCurrentStep(s) {
    const L = run.lot;
    const running = L.started && L.started.no === s.order;
    const waiting = L.waiting && !running;

    // 아직 시작 전
    if (!running && !waiting) {
        const cond = (s.conditions || []).map(c =>
            `<span class="cond">${esc(c.name)} ${esc(c.value)}${esc(c.unit)}</span>`).join('');
        const note = s.note ? `<div class="recipe-note">${esc(s.note)}</div>` : '';
        return `<div class="step-row now">
                  <div class="step-no">${s.order}</div>
                  <div class="step-body">
                    <div class="step-name">${esc(s.step)}</div>
                    <div class="recipe-meta">${cond}</div>
                    ${note}
                    <div class="step-act">
                      <label class="at-field">시각
                        <input type="time" id="start-at" value="${nowHHMM()}">
                      </label>
                      <button type="button" class="btn-primary step-go" id="btn-start"
                              onclick="startStep(${s.order})">시작</button>
                    </div>
                  </div>
                </div>`;
    }

    // 대기 중 — DIPAS 농축
    if (waiting) return renderWaitPanel(s);

    // 진행 중 — 조건·계량값을 받는다
    const conds = (s.conditions || []).map((c, i) => `
        <div class="in-row">
          <div class="in-name">${esc(c.name)}</div>
          <input type="text" class="in-val" id="in-c${i}"
                 inputmode="${typeof c.value === 'number' ? 'decimal' : 'text'}"
                 placeholder="${esc(c.value)}" autocomplete="off">
          <div class="in-unit">${esc(c.unit || '')}</div>
          <div class="in-plan">계획 ${esc(c.value)}${esc(c.unit || '')}</div>
        </div>`).join('');

    const endIn = endItems(s).map((e, i) => `
        <div class="in-row measure">
          <div class="in-name">${esc(e.item)}</div>
          <input type="text" class="in-val" id="in-end${i}" inputmode="decimal"
                 placeholder="${e.base !== null && e.base !== undefined ? esc(e.base) : '계량값'}"
                 autocomplete="off">
          <div class="in-unit">${esc(e.unit)}</div>
          <div class="in-plan">${e.base !== null && e.base !== undefined
              ? '기준 ' + esc(e.base) + esc(e.unit) : '실제로 잰 값'}</div>
        </div>`).join('');

    const canWait = (run.product === 'DIPAS' && String(s.step).indexOf('농축') >= 0);
    const waitBtn = canWait
        ? `<button type="button" class="btn-secondary step-wait" id="btn-wait"
                   onclick="waitStep(${s.order})">대기</button>` : '';

    return `<div class="step-row now running">
              <div class="step-no">${s.order}</div>
              <div class="step-body">
                <div class="step-name">${esc(s.step)}
                  <span class="step-since">시작 ${esc(shortAt(L.started.at))}</span>
                </div>
                ${s.note ? `<div class="recipe-note">${esc(s.note)}</div>` : ''}
                <div class="in-list">
                  ${conds}
                  ${endIn}
                  <div class="in-row">
                    <div class="in-name">특이사항</div>
                    <input type="text" class="in-val wide" id="in-note" maxlength="200"
                           placeholder="없으면 비워 두세요" autocomplete="off">
                  </div>
                </div>
                <div class="step-act">
                  ${(s.conditions || []).length
                      ? `<button type="button" class="btn-secondary"
                                 onclick="fillPlanned(${s.order})">계획대로</button>` : ''}
                  <label class="at-field">시각
                    <input type="time" id="end-at" value="${nowHHMM()}">
                  </label>
                  ${waitBtn}
                  <button type="button" class="btn-primary step-go" id="btn-end"
                          onclick="endStep(${s.order})">종료</button>
                </div>
              </div>
            </div>`;
}

/** 조건 칸을 레시피 값으로 채운다 — 장갑 낀 손으로 일일이 치기 어렵다 */
function fillPlanned(order) {
    const s = (run.steps || []).find(x => x.order === order);
    if (!s) return;
    (s.conditions || []).forEach((c, i) => {
        const el = document.getElementById('in-c' + i);
        if (el && !el.value) el.value = c.value;
    });
}

/**
 * 종료할 때 적는 항목들.
 *
 * ★ 레시피 시트에는 「초류량 · 본류량 · 후류량」처럼 여러 가지가 한 칸에 적혀 있다.
 *   사람이 읽기엔 그게 낫지만, 적을 때는 칸이 따로 있어야 한다.
 *   그래서 「·」로 나눠 칸을 만들고, 시트에도 각각 다른 줄로 남긴다.
 *   그래야 나중에 「본류량만 뽑아 보기」가 된다.
 * ★ 기준값은 하나뿐이라 나눌 수 없으므로, 나뉜 항목에는 붙이지 않는다.
 */
function endItems(s) {
    if (!s.endInput) return [];
    const unit = s.endInput.unit || '';
    const names = String(s.endInput.item).split('·').map(x => x.trim()).filter(Boolean);
    if (names.length <= 1) {
        return [{ item: s.endInput.item, base: s.endInput.base, unit }];
    }
    return names.map(n => ({ item: n, base: null, unit }));
}

/** 화면의 입력칸을 모아 백엔드에 보낼 모양으로 만든다 */
function collectItems(s) {
    const items = [];
    (s.conditions || []).forEach((c, i) => {
        const el = document.getElementById('in-c' + i);
        const v = el ? el.value.trim() : '';
        // 안 적은 칸은 보내지 않는다. 안 잰 값을 잰 것처럼 남기면 안 된다.
        if (v === '') return;
        items.push({
            event: '조건', item: c.name,
            plan: c.value, actual: isNaN(Number(v)) ? v : Number(v),
            unit: c.unit || ''
        });
    });
    endItems(s).forEach((e, i) => {
        const el = document.getElementById('in-end' + i);
        const v = el ? el.value.trim() : '';
        if (v === '') return;
        const isNum = !isNaN(Number(v));
        items.push({
            event: '기록', item: e.item,
            plan: (e.base === null || e.base === undefined) ? '' : e.base,
            actual: isNum ? Number(v) : v,
            // 숫자가 아니면 단위를 붙이지 않는다 — 단위는 「잰 값」이라는 표시다.
            // 「투입 Lot」 칸에 kg가 붙으면 Lot 번호를 무게로 읽게 된다.
            unit: isNum ? e.unit : ''
        });
    });
    return items;
}


/* ══════════════════════════════════════════
   시작 · 종료 · 대기
   ══════════════════════════════════════════ */

async function startStep(order) {
    const s = (run.steps || []).find(x => x.order === order);
    if (!s) return;
    const at = runAtFrom((document.getElementById('start-at') || {}).value);

    await withBusy('btn-start', async () => {
        await googleSheetsManager.logStep(
            run.product, run.lot.lotNo, run.lot.process, run.lot.reactor,
            { stepNo: s.order, step: s.step, event: '시작', at }
        );
        // 화면을 바로 바꿔 준다. 다시 불러오면 느리고, 현장에서는 그 몇 초가 길다.
        run.lot.started = { no: s.order, step: s.step, at: at || nowStamp() };
        run.lot.waiting = false;
        renderLotRun();
    });
}

async function endStep(order) {
    const s = (run.steps || []).find(x => x.order === order);
    if (!s) return;
    const at = runAtFrom((document.getElementById('end-at') || {}).value);
    const note = ((document.getElementById('in-note') || {}).value || '').trim();
    const items = collectItems(s);

    const missing = endItems(s).filter(e => !items.some(i => i.item === e.item));
    if (missing.length) {
        if (!confirm(`「${missing.map(m => m.item).join('」 「')}」을 안 적으셨습니다.\n그냥 종료할까요?`)) return;
    }

    await withBusy('btn-end', async () => {
        await googleSheetsManager.logStep(
            run.product, run.lot.lotNo, run.lot.process, run.lot.reactor,
            { stepNo: s.order, step: s.step, event: '종료', at, note, items }
        );
        if (!run.lot.doneSteps.includes(s.order)) run.lot.doneSteps.push(s.order);
        run.lot.doneSteps.sort((a, b) => a - b);
        run.lot.started = null;
        run.lot.waiting = false;
        renderLotRun();
    });
}

async function waitStep(order) {
    const s = (run.steps || []).find(x => x.order === order);
    if (!s) return;
    const at = runAtFrom((document.getElementById('end-at') || {}).value);
    const note = ((document.getElementById('in-note') || {}).value || '').trim();

    await withBusy('btn-wait', async () => {
        await googleSheetsManager.logStep(
            run.product, run.lot.lotNo, run.lot.process, run.lot.reactor,
            { stepNo: s.order, step: s.step, event: '대기', at, note }
        );
        run.lot.waiting = true;
        run.lot.started = null;
        renderLotRun();
        alert('대기로 두었습니다.\n\n무게가 나오면 이 Lot을 다시 열어\n함께 농축한 Lot과 총 무게를 넣어 주세요.');
    });
}

/** 버튼을 잠그고 일을 시킨다 — 연타로 두 번 들어가는 걸 막는다 */
async function withBusy(btnId, fn) {
    const btn = document.getElementById(btnId);
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '저장 중…'; }
    try {
        await fn();
    } catch (err) {
        alert('저장하지 못했습니다.\n\n' + err.message +
              '\n\n같은 버튼을 다시 눌러 주세요. 지금까지 적은 값은 그대로 있습니다.');
        if (btn) { btn.disabled = false; btn.textContent = label; }
    }
}


/* ══════════════════════════════════════════
   DIPAS 농축 — 함께 농축한 Lot들에 총 무게를 나눠 적는다
   ══════════════════════════════════════════ */

function renderWaitPanel(s) {
    const L = run.lot;
    // 같은 제품·같은 공정에서 함께 대기 중인 Lot들
    const mates = (run.lots || []).filter(l =>
        l.process === L.process && l.waiting && l.lotNo !== L.lotNo);

    const picks = mates.map(l => `
        <label class="mate">
          <input type="checkbox" class="mate-box" value="${esc(l.lotNo)}"
                 data-reactor="${esc(l.reactor)}">
          <span>${esc(l.lotNo)}</span>
          <span class="mate-rx">${esc(l.reactor)}</span>
        </label>`).join('');

    return `<div class="step-row now waiting">
              <div class="step-no">${s.order}</div>
              <div class="step-body">
                <div class="step-name">${esc(s.step)} <span class="step-since">대기 중</span></div>
                <div class="wait-help">
                  함께 농축한 Lot을 모두 고르고, <b>합쳐서 나온 총 무게</b>를 넣어 주세요.
                  앱이 Lot 수로 나눠 적습니다.
                </div>

                <div class="mate-list">
                  <label class="mate self">
                    <input type="checkbox" checked disabled>
                    <span>${esc(L.lotNo)}</span>
                    <span class="mate-rx">${esc(L.reactor)}</span>
                  </label>
                  ${picks || '<div class="mate-none">함께 대기 중인 다른 Lot이 없습니다. 이 Lot만 기록됩니다.</div>'}
                </div>

                <div class="in-list">
                  <div class="in-row measure">
                    <div class="in-name">총 무게</div>
                    <input type="text" class="in-val" id="conc-total" inputmode="decimal"
                           placeholder="예: 1050" autocomplete="off" oninput="previewConc()">
                    <div class="in-unit">kg</div>
                    <div class="in-plan" id="conc-preview">고른 Lot 수로 나눕니다</div>
                  </div>
                  <div class="in-row">
                    <div class="in-name">특이사항</div>
                    <input type="text" class="in-val wide" id="conc-note" maxlength="200"
                           placeholder="없으면 비워 두세요" autocomplete="off">
                  </div>
                </div>

                <div class="step-act">
                  <button type="button" class="btn-primary step-go" id="btn-conc"
                          onclick="submitConcentrate(${s.order})">나눠 기록하고 종료</button>
                </div>
              </div>
            </div>`;
}

function concPicked() {
    const L = run.lot;
    const list = [{ lotNo: L.lotNo, reactor: L.reactor }];
    document.querySelectorAll('.mate-box:checked').forEach(b => {
        list.push({ lotNo: b.value, reactor: b.dataset.reactor || '' });
    });
    return list;
}

function previewConc() {
    const el = document.getElementById('conc-preview');
    if (!el) return;
    const t = Number((document.getElementById('conc-total') || {}).value);
    const n = concPicked().length;
    el.textContent = (t > 0)
        ? `${n}개로 나누면 각 ${Math.round((t / n) * 100) / 100}kg`
        : '고른 Lot 수로 나눕니다';
}

async function submitConcentrate(order) {
    const s = (run.steps || []).find(x => x.order === order);
    if (!s) return;
    const total = Number((document.getElementById('conc-total') || {}).value);
    if (!(total > 0)) { alert('총 무게를 숫자로 넣어 주세요.'); return; }

    const lots = concPicked();
    const note = ((document.getElementById('conc-note') || {}).value || '').trim();
    const each = Math.round((total / lots.length) * 100) / 100;

    if (!confirm(
        `함께 농축한 Lot ${lots.length}개\n` +
        lots.map(l => '  · ' + l.lotNo).join('\n') +
        `\n\n총 ${total}kg → 각 ${each}kg 으로 적습니다.\n` +
        `이 Lot들의 농축 단계가 모두 끝납니다.`
    )) return;

    await withBusy('btn-conc', async () => {
        await googleSheetsManager.concentrateGroup(
            run.product, run.lot.process, s.order, s.step, lots, total, 'kg', note
        );
        alert(`✅ ${lots.length}개 Lot에 각 ${each}kg으로 적었습니다.`);
        closeLotRun();
    });
}


/* ══════════════════════════════════════════
   공정 완료 · 다음 공정 Lot
   ══════════════════════════════════════════ */

/** DPS526-0828-A01 → S01,  DPS526-0828-S01 → S02 */
function nextProcessLotNo(lotNo) {
    const m = String(lotNo).match(/^(.*-)([A-Z]+)(\d+)$/);
    if (!m) return lotNo + '-S01';
    const head = m[1], letter = m[2], n = parseInt(m[3], 10);
    if (letter === 'A') return head + 'S01';
    return head + 'S' + String(n + 1).padStart(2, '0');
}

function renderRunFinish() {
    const box = document.getElementById('run-finish');
    if (!box) return;

    const L = run.lot, steps = run.steps;
    if (!L || !steps || !steps.length) { box.innerHTML = ''; return; }

    const done = new Set(L.doneSteps || []);
    if (!steps.every(s => done.has(s.order))) { box.innerHTML = ''; return; }

    const isSyn = (L.process === '합성');
    const doneLabel = isSyn ? '합성 완료' : '정제 완료';
    const waitLabel = isSyn ? '합성 완료 · 정제 대기' : '정제 완료 · 다음 정제 대기';

    const panel = run.nextOpen ? renderNextPanel() : '';

    box.innerHTML = `
        <div class="finish-box">
          <div class="finish-title">모든 단계가 끝났습니다</div>
          <div class="finish-acts">
            <button type="button" class="btn-primary finish-go" id="btn-finish"
                    onclick="finishProcess('정상완료','btn-finish')">${doneLabel}</button>
            <button type="button" class="btn-secondary finish-go"
                    onclick="toggleNextPanel()">${waitLabel}</button>
          </div>
          ${panel}
          <button type="button" class="finish-abort" id="btn-abort"
                  onclick="finishProcess('중단','btn-abort')">문제가 생겨 중단으로 마감</button>
        </div>`;
}

function toggleNextPanel() {
    run.nextOpen = !run.nextOpen;
    if (run.nextOpen && !run.nextReactor) run.nextReactor = '';
    renderRunFinish();
}

function renderNextPanel() {
    const L = run.lot;
    const suggested = nextProcessLotNo(L.lotNo);
    const list = (REACTORS_BY_PROCESS['정제'] || []).map(r =>
        `<button type="button" class="pick-btn mono${r === run.nextReactor ? ' on' : ''}"
                 onclick="pickNextReactor('${esc(r)}')">${esc(r)}</button>`).join('');

    return `<div class="next-panel">
              <div class="entry-label">다음 Lot 번호</div>
              <input type="text" class="lot-input" id="next-lot"
                     value="${esc(suggested)}" spellcheck="false" autocomplete="off">
              <div class="entry-hint">
                합성 번호를 그대로 쓰고 끝만 바꿉니다. 필요하면 고치셔도 됩니다.
              </div>

              <div class="entry-label">정제 반응기</div>
              <div class="pick-row">${list}</div>

              <button type="button" class="btn-primary finish-go" id="btn-next"
                      onclick="createNextLot()" ${run.nextReactor ? '' : 'disabled'}>
                이 공정 끝내고 다음 Lot 만들기
              </button>
            </div>`;
}

function pickNextReactor(r) {
    run.nextReactor = r;
    renderRunFinish();
}

async function finishProcess(mode, btnId) {
    const L = run.lot;
    const label = (L.process === '합성' ? '합성' : '정제');
    const msg = (mode === '중단')
        ? `${L.lotNo}\n\n이 ${label}을 「중단」으로 마감합니다.\n진행 목록에서 사라집니다. 계속할까요?`
        : `${L.lotNo}\n\n이 ${label}을 완료합니다.\n진행 목록에서 사라집니다. 계속할까요?`;
    if (!confirm(msg)) return;

    let note = '';
    if (mode === '중단') {
        note = (prompt('무슨 일이 있었는지 한 줄로 적어 주세요.') || '').trim();
    }

    await withBusy(btnId || 'btn-finish', async () => {
        await googleSheetsManager.completeProcess(
            run.product, L.lotNo, L.process, L.reactor, mode, note
        );
        alert(`✅ ${L.lotNo} ${label} ${mode === '중단' ? '중단' : '완료'}`);
        closeLotRun();
    });
}

async function createNextLot() {
    const L = run.lot;
    const nextNo = ((document.getElementById('next-lot') || {}).value || '').trim();
    if (!nextNo) { alert('다음 Lot 번호를 넣어 주세요.'); return; }
    if (!run.nextReactor) { alert('정제 반응기를 골라 주세요.'); return; }

    if (!confirm(
        `${L.lotNo} (${L.process}) 을 완료하고\n` +
        `${nextNo} (정제 · ${run.nextReactor}) 을 만듭니다.\n\n계속할까요?`
    )) return;

    await withBusy('btn-next', async () => {
        // 완료가 먼저다. 새 Lot부터 만들면 중간에 끊겼을 때 둘 다 열린 채로 남는다.
        await googleSheetsManager.completeProcess(
            run.product, L.lotNo, L.process, L.reactor, '정상완료', `다음: ${nextNo}`
        );
        await googleSheetsManager.nextLot(
            run.product, L.lotNo, L.process, '정제', nextNo, run.nextReactor
        );
        alert(`✅ ${L.lotNo} 완료\n\n${nextNo} 이(가) 정제 대기로 만들어졌습니다.`);
        closeLotRun();
    });
}
