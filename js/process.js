/* ========================================
   공정 입력 — 제품 입력 화면
   제품·공정을 고르면 레시피가 따라오고, Lot 번호를 만들어 등록한다.
   의존성: googleSheets.js (googleSheetsManager, todayKSTDate), app.js (화면 전환)
   ======================================== */

/* ----------------------------------------
   설정 — 나중에 구글시트로 옮기기 쉽게 한곳에 모아 둔다.
   ---------------------------------------- */

// Lot 번호에 쓰는 제품 코드.
// useLine: 반응기 라인 숫자를 코드 뒤에 끼워 넣을지 (DIPAS만 DPS4·DPS5로 갈린다)
// ※ 하반기에 DIPAS가 반응기 하나만 쓰게 되면 useLine을 false로 바꾸면 된다.
const PRODUCT_CODES = {
    'DIPAS':  { code: 'DPS',    useLine: true  },
    'HAC':    { code: 'HAC',    useLine: false },
    'ZAC':    { code: 'ZAC',    useLine: false },
    'NABAL':  { code: 'NABAL',  useLine: false },
    'BDEAS':  { code: 'BDS',    useLine: false },
    'TDMATi': { code: 'TDMATi', useLine: false },
    'BTBAS':  { code: 'BTS',    useLine: false },
    'TEMAZ':  { code: 'TEMAZ',  useLine: false }
};

// 반응기 — 끝자리 01·02는 합성, 03·04는 정제
const REACTORS_BY_PROCESS = {
    '합성': ['EGR-101', 'EGR-102', 'EGR-201', 'EGR-202', 'EGR-301', 'EGR-401', 'EGR-501'],
    '정제': ['EGR-303', 'EGR-304', 'EGR-403', 'EGR-404', 'EGR-503', 'EGR-504']
};

const PROCESS_LETTER = { '합성': 'A', '정제': 'S' };

/* ----------------------------------------
   지금 고르고 있는 것
   ---------------------------------------- */
let entry = {
    products: null,      // [{product, processes}]
    product: '',
    process: '',
    reactor: '',
    seq: 1,              // 그 달의 회차
    steps: null,         // 레시피 단계 (화면에 그리기 좋게 다듬어진 것)
    editing: false,      // 레시피 고치는 중인지
    editRows: null       // 고치기용 — 시트 칸 그대로 + 줄 번호
};

/* ----------------------------------------
   Lot 번호 만들기
   DPS526-0827-A01  =  코드 + 라인 + 연2자리 - 월일 - 공정문자 + 회차
   ※ 회차(끝 두 자리)는 그 달의 몇 번째인지라 시트를 세어 봐야 안다.
     반응기를 고르는 순간 백엔드에 물어서 채운다(fillNextSeq).
     못 세어 오면 01로 두고 화면에 그 사실을 적는다 — 화면은 계속 돌아야 한다.
   ---------------------------------------- */
// 코드 + 라인 + 연2자리 + '-' + 월  (회차를 셀 때 쓰는 그 달의 접두사)
function lotCodePrefix(product, reactor) {
    const conf = PRODUCT_CODES[product] || { code: product, useLine: false };

    let line = '';
    if (conf.useLine && reactor) {
        const m = String(reactor).match(/EGR-(\d)/);
        if (m) line = m[1];
    }

    const d = todayKSTDate();
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${conf.code}${line}${yy}-${mm}`;
}

function makeLotNo(product, process, reactor, seq) {
    const d = todayKSTDate();
    const dd = String(d.getDate()).padStart(2, '0');
    const letter = PROCESS_LETTER[process] || 'A';
    const nn = String(seq || 1).padStart(2, '0');
    return `${lotCodePrefix(product, reactor)}${dd}-${letter}${nn}`;
}

/* ----------------------------------------
   화면 열기
   ---------------------------------------- */
async function openProductEntry() {
    entry = { products: entry.products, product: '', process: '', reactor: '', seq: 1,
              steps: null, editing: false, editRows: null };
    showScreen('product-entry-screen', 'process');
    renderEntry();

    if (!entry.products) {
        setEntryStatus('제품 목록을 불러오는 중…');
        try {
            entry.products = await googleSheetsManager.getRecipeProducts();
            setEntryStatus('');
        } catch (err) {
            // 왜 안 되는지 화면에 그대로 적는다. "실패"만 띄우면 원인을 못 찾는다.
            setEntryStatus(
                `제품 목록을 불러오지 못했습니다.\n${err.message}\n\n` +
                `· 헤더의 「연결」에서 웹앱 URL이 설정돼 있는지\n` +
                `· Apps Script를 「새 버전」으로 재배포했는지 확인해 주세요.`,
                true
            );
            addRetryButton('entry-status', 'openProductEntry');
            return;
        }
    }
    renderEntry();
}

function setEntryStatus(msg, isError) {
    const el = document.getElementById('entry-status');
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
    el.className = 'entry-status' + (isError ? ' error' : '');
}

/**
 * 안내문 아래에 「다시 불러오기」 버튼을 붙인다.
 * 실패했을 때 화면을 나갔다 들어오게 하지 않으려는 것이다 —
 * 현장에서는 그 왕복이 생각보다 크다.
 * ※ setEntryStatus/setRunStatus가 textContent를 쓰므로 반드시 그 뒤에 부를 것.
 */
function addRetryButton(statusId, fnName) {
    const el = document.getElementById(statusId);
    if (!el) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-secondary';
    b.style.marginTop = '0.8rem';
    b.textContent = '다시 불러오기';
    b.onclick = () => { const f = window[fnName]; if (typeof f === 'function') f(); };
    el.appendChild(b);
}

/* ----------------------------------------
   그리기
   ---------------------------------------- */
function renderEntry() {
    renderEntryProducts();
    renderEntryProcesses();
    renderEntryReactors();
    renderEntryLot();
    renderEntryRecipe();
    updateEntrySubmit();
}

function renderEntryProducts() {
    const box = document.getElementById('entry-products');
    if (!box) return;
    if (!entry.products) { box.innerHTML = ''; return; }

    box.innerHTML = entry.products.map(p =>
        `<button type="button" class="pick-btn${p.product === entry.product ? ' on' : ''}"
                 onclick="pickProduct('${p.product}')">${p.product}</button>`
    ).join('');
}

function renderEntryProcesses() {
    const step = document.getElementById('entry-step-process');
    const box = document.getElementById('entry-processes');
    if (!step || !box) return;

    if (!entry.product) { step.style.display = 'none'; box.innerHTML = ''; return; }
    step.style.display = 'block';

    const found = entry.products.find(p => p.product === entry.product);
    const list = (found && found.processes) || [];
    box.innerHTML = list.map(pr =>
        `<button type="button" class="pick-btn${pr === entry.process ? ' on' : ''}"
                 onclick="pickProcess('${pr}')">${pr}</button>`
    ).join('');
}

function renderEntryReactors() {
    const step = document.getElementById('entry-step-reactor');
    const box = document.getElementById('entry-reactors');
    if (!step || !box) return;

    if (!entry.process) { step.style.display = 'none'; box.innerHTML = ''; return; }
    step.style.display = 'block';

    const list = REACTORS_BY_PROCESS[entry.process] || [];
    box.innerHTML = list.map(r =>
        `<button type="button" class="pick-btn mono${r === entry.reactor ? ' on' : ''}"
                 onclick="pickReactor('${r}')">${r}</button>`
    ).join('');
}

function renderEntryLot() {
    const step = document.getElementById('entry-step-lot');
    const input = document.getElementById('entry-lot');
    if (!step || !input) return;

    if (!entry.reactor) { step.style.display = 'none'; return; }
    step.style.display = 'block';

    // 사용자가 직접 고친 번호는 건드리지 않는다.
    if (!input.dataset.touched) {
        input.value = makeLotNo(entry.product, entry.process, entry.reactor, entry.seq || 1);
    }
}

// 그 달의 다음 회차를 시트에서 세어 온다.
// 못 가져와도 화면은 돌아야 하므로, 실패하면 01로 두고 안내만 한다.
async function fillNextSeq() {
    const hint = document.getElementById('entry-lot-hint');
    if (!entry.product || !entry.process || !entry.reactor) return;

    if (hint) hint.textContent = '그 달의 몇 번째인지 세는 중…';
    try {
        entry.seq = await googleSheetsManager.getNextLotSeq(
            entry.product,
            lotCodePrefix(entry.product, entry.reactor),
            PROCESS_LETTER[entry.process] || 'A'
        );
        if (hint) hint.textContent = '시트를 세어 만든 번호입니다. 필요하면 고치셔도 됩니다.';
    } catch (err) {
        entry.seq = 1;
        if (hint) {
            hint.textContent = `회차를 세지 못했습니다(${err.message}). 끝 두 자리를 확인해 주세요.`;
        }
    }
    renderEntryLot();
    updateEntrySubmit();
}

function markLotTouched() {
    const input = document.getElementById('entry-lot');
    if (input) input.dataset.touched = '1';
    updateEntrySubmit();
}

function resetLotNo() {
    const input = document.getElementById('entry-lot');
    if (!input) return;
    delete input.dataset.touched;
    input.value = makeLotNo(entry.product, entry.process, entry.reactor, entry.seq || 1);
    updateEntrySubmit();
}

function renderEntryRecipe() {
    const step = document.getElementById('entry-step-recipe');
    const box = document.getElementById('entry-recipe');
    if (!step || !box) return;

    if (!entry.steps) { step.style.display = 'none'; box.innerHTML = ''; return; }
    step.style.display = 'block';

    renderRecipeEditButton();
    if (entry.editing) { box.innerHTML = recipeEditHtml(); return; }

    if (entry.steps.length === 0) {
        box.innerHTML = '<div class="recipe-empty">이 제품·공정의 레시피가 시트에 없습니다.</div>';
        return;
    }

    box.innerHTML = entry.steps.map(s => {
        const cond = (s.conditions || []).map(c =>
            `<span class="cond">${c.name} ${c.value}${c.unit}</span>`
        ).join('');
        const end = s.endInput
            ? `<span class="endin">→ ${s.endInput.item}` +
              (s.endInput.base !== null && s.endInput.base !== undefined
                  ? ` <b>${s.endInput.base}</b>${s.endInput.unit || ''}` : '') +
              `</span>`
            : '';
        const note = s.note ? `<div class="recipe-note">${s.note}</div>` : '';
        return `<div class="recipe-row">
                  <div class="recipe-no">${s.order}</div>
                  <div class="recipe-body">
                    <div class="recipe-step">${s.step}</div>
                    <div class="recipe-meta">${cond}${end}</div>
                    ${note}
                  </div>
                </div>`;
    }).join('');
}

function updateEntrySubmit() {
    const btn = document.getElementById('entry-submit');
    if (!btn) return;
    const lot = (document.getElementById('entry-lot') || {}).value || '';
    const ready = entry.product && entry.process && entry.reactor && lot.trim()
                  && entry.steps && !entry.editing;
    btn.disabled = !ready;
}

/* ----------------------------------------
   고르기
   ---------------------------------------- */
function pickProduct(product) {
    entry.product = product;
    entry.process = '';
    entry.reactor = '';
    entry.steps = null;
    entry.editing = false;      // 제품이 바뀌면 고치던 것은 버린다
    entry.editRows = null;
    const input = document.getElementById('entry-lot');
    if (input) { delete input.dataset.touched; input.value = ''; }
    renderEntry();
}

async function pickProcess(process) {
    entry.process = process;
    entry.reactor = '';
    entry.steps = null;
    entry.editing = false;
    entry.editRows = null;
    const input = document.getElementById('entry-lot');
    if (input) { delete input.dataset.touched; input.value = ''; }
    renderEntry();

    setEntryStatus('레시피를 불러오는 중…');
    try {
        entry.steps = await googleSheetsManager.getRecipe(entry.product, entry.process);
        setEntryStatus('');
    } catch (err) {
        setEntryStatus(`레시피를 불러오지 못했습니다.\n${err.message}`, true);
        entry.steps = null;
    }
    renderEntry();
}

function pickReactor(reactor) {
    entry.reactor = reactor;
    const input = document.getElementById('entry-lot');
    if (input) delete input.dataset.touched;   // 반응기가 바뀌면 라인 숫자도 바뀐다
    renderEntry();
    fillNextSeq();
}

/* ----------------------------------------
   등록
   ---------------------------------------- */
async function submitProductEntry() {
    const input = document.getElementById('entry-lot');
    const btn = document.getElementById('entry-submit');
    const lot = (input.value || '').trim();
    if (!lot) { alert('Lot 번호를 입력해 주세요.'); return; }

    // 연타로 같은 Lot이 두 번 들어가지 않게 잠근다.
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = '등록 중…';

    try {
        await googleSheetsManager.registerLot(
            entry.product, entry.process, lot, entry.reactor
        );
        alert(
            '✅ Lot이 등록되었습니다.\n\n' +
            `${lot}\n` +
            `${entry.product} · ${entry.process} · ${entry.reactor}\n\n` +
            '「공정 진행」에서 이 Lot을 눌러 단계를 시작하시면 됩니다.'
        );
        // 다음 Lot을 이어서 등록하기 쉽게 제품·공정은 남기고 번호만 새로 받는다.
        delete input.dataset.touched;
        await fillNextSeq();
    } catch (err) {
        alert('등록하지 못했습니다.\n\n' + err.message);
    } finally {
        btn.textContent = label;
        updateEntrySubmit();
    }
}


/* ══════════════════════════════════════════
   레시피 고치기
   화면에 뜬 레시피가 틀렸다는 걸 알아채는 자리가 바로 여기다.
   시트를 따로 열러 가게 하지 않는다.

   ★ 값만 고친다. 순번(단계 순서)은 못 고친다 —
     순서를 바꾸면 「3단계까지 끝냄」인 Lot이 엉뚱한 단계를 가리키게 되고,
     그 어긋남은 오류 없이 조용하다.
   ══════════════════════════════════════════ */

const RECIPE_FIELDS = [
    { key: 'step',    label: '단계',        wide: true  },
    { key: 'inner',   label: '내부온도',    hint: '℃'   },
    { key: 'col',     label: '컬럼온도',    hint: '℃'   },
    { key: 'rpm',     label: '교반',        hint: 'RPM'  },
    { key: 'press',   label: '압력',        hint: '감압 · 상압 · 가압' },
    { key: 'endItem', label: '종료 시 입력', wide: true, hint: '여럿이면 · 로 이어 적으세요' },
    { key: 'base',    label: '기준값'                    },
    { key: 'unit',    label: '단위'                      },
    { key: 'note',    label: '비고',        wide: true   }
];

function renderRecipeEditButton() {
    const el = document.getElementById('entry-recipe-edit');
    if (!el) return;
    if (!entry.product || !entry.process) { el.innerHTML = ''; return; }
    el.innerHTML = entry.editing
        ? `<button type="button" class="btn-secondary lot-reset" onclick="cancelRecipeEdit()">취소</button>`
        : `<button type="button" class="btn-secondary lot-reset" onclick="startRecipeEdit()">고치기</button>`;
}

async function startRecipeEdit() {
    setEntryStatus('레시피를 고칠 수 있게 불러오는 중…');
    try {
        // 다듬어진 것 말고 「칸 그대로」를 받아 온다. 빈 칸도 보여야 채울 수 있다.
        entry.editRows = await googleSheetsManager.getRecipeRows(entry.product, entry.process);
        setEntryStatus('');
    } catch (err) {
        setEntryStatus(`레시피를 불러오지 못했습니다.\n${err.message}`, true);
        return;
    }
    if (!entry.editRows.length) {
        setEntryStatus(
            `${entry.product} · ${entry.process} 의 줄이 레시피 시트에 없습니다.\n` +
            `단계를 새로 만드는 것은 아직 시트에서 해야 합니다.`, true);
        return;
    }
    entry.editing = true;
    renderEntry();
}

function cancelRecipeEdit() {
    entry.editing = false;
    entry.editRows = null;
    setEntryStatus('');
    renderEntry();
}

function recipeEditHtml() {
    const rows = entry.editRows || [];
    const body = rows.map((r, i) => {
        const cells = RECIPE_FIELDS.map(f => `
            <label class="rc-field${f.wide ? ' wide' : ''}">
              <span class="rc-label">${f.label}</span>
              <input type="text" class="rc-input" id="rc-${f.key}-${i}"
                     value="${esc(r[f.key] === null || r[f.key] === undefined ? '' : r[f.key])}"
                     placeholder="${esc(f.hint || '비워 두면 없음')}" autocomplete="off">
            </label>`).join('');
        return `<div class="rc-row">
                  <div class="rc-no">${esc(r.no)}</div>
                  <div class="rc-fields">${cells}</div>
                </div>`;
    }).join('');

    return `<div class="rc-warn">
              고치면 <b>앞으로 등록할 Lot과 지금 돌고 있는 Lot 모두</b> 이 값을 보게 됩니다.<br>
              단계를 넣거나 빼는 것은 여기서 못 합니다 — 진행 중인 Lot의 단계 번호가 어긋나기 때문입니다.
            </div>
            <div class="rc-list">${body}</div>
            <div class="rc-actions">
              <button type="button" class="btn-secondary" onclick="cancelRecipeEdit()">취소</button>
              <button type="button" class="btn-primary" id="rc-save"
                      onclick="saveRecipeEdit()">고친 것 저장</button>
            </div>`;
}

/** 화면 값과 원래 값을 견줘 바뀐 줄만 골라낸다 */
function collectRecipeChanges() {
    const rows = entry.editRows || [];
    const out = [];
    rows.forEach((r, i) => {
        const patch = {};
        let n = 0;
        RECIPE_FIELDS.forEach(f => {
            const el = document.getElementById(`rc-${f.key}-${i}`);
            if (!el) return;
            const now = el.value.trim();
            const was = String(r[f.key] === null || r[f.key] === undefined ? '' : r[f.key]).trim();
            if (now === was) return;
            patch[f.key] = now;
            n++;
        });
        if (n) out.push({ row: r.row, no: r.no, step: r.step, patch, count: n });
    });
    return out;
}

async function saveRecipeEdit() {
    const changes = collectRecipeChanges();
    if (!changes.length) { alert('고친 것이 없습니다.'); return; }

    const summary = changes.map(c =>
        `  ${c.no}. ${c.step || '(이름 없음)'} — ${c.count}칸`).join('\n');
    if (!confirm(
        `${entry.product} · ${entry.process} 레시피를 고칩니다.\n\n${summary}\n\n` +
        `구글시트에 바로 저장됩니다. 계속할까요?`
    )) return;

    const btn = document.getElementById('rc-save');
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; }

    // 한 줄씩 보낸다. 한꺼번에 보내면 주소가 너무 길어지고,
    // 중간에 실패했을 때 어디까지 됐는지 알 수 없다.
    const done = [], failed = [];
    for (let i = 0; i < changes.length; i++) {
        const c = changes[i];
        if (btn) btn.textContent = `저장 중… (${i + 1}/${changes.length})`;
        try {
            await googleSheetsManager.updateRecipeRow(entry.product, entry.process, c.row, c.patch);
            done.push(c);
        } catch (err) {
            failed.push({ c, msg: err.message });
        }
    }
    if (btn) { btn.disabled = false; btn.textContent = label; }

    // 고쳤으니 기억해 둔 옛 레시피를 버린다. 안 버리면 화면이 옛 값을 계속 보여 준다.
    googleSheetsManager.clearRecipeCache();
    if (typeof run !== 'undefined' && run && run.recipes) run.recipes = {};

    if (failed.length) {
        alert(`${done.length}줄은 저장했고 ${failed.length}줄은 실패했습니다.\n\n` +
              failed.map(f => `  ${f.c.no}. ${f.c.step}\n    ${f.msg}`).join('\n\n'));
    } else {
        alert(`✅ ${done.length}줄을 고쳤습니다.`);
    }

    entry.editing = false;
    entry.editRows = null;

    // 고친 레시피를 다시 받아 화면에 반영한다
    setEntryStatus('고친 레시피를 다시 불러오는 중…');
    try {
        entry.steps = await googleSheetsManager.getRecipe(entry.product, entry.process);
        setEntryStatus('');
    } catch (err) {
        setEntryStatus(`다시 불러오지 못했습니다.\n${err.message}`, true);
    }
    renderEntry();
}
