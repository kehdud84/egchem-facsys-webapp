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

// 반응기
const REACTORS_BY_PROCESS = {
    '합성': ['EGR-101', 'EGR-102', 'EGR-201', 'EGR-202', 'EGR-301', 'EGR-401', 'EGR-501'],
    '정제': ['EGR-303', 'EGR-304', 'EGR-403', 'EGR-404', 'EGR-503', 'EGR-504',
             'EGR-601', 'EGR-602', 'EGR-603', 'EGR-604',
             'EGR-701', 'EGR-702', 'EGR-703', 'EGR-704',
             'EGR-801', 'EGR-802', 'EGR-803', 'EGR-804']
};

const PROCESS_LETTER = { '합성': 'A', '정제': 'S' };

/* ----------------------------------------
   제품을 라인별로 묶어 보여 준다.
   여덟 개를 한 줄로 늘어놓으면 어느 라인 것인지 안 보이고,
   급할 때 옆 칸을 누른다. 라인이 다르면 아예 다른 설비다.
   ★ 여기 없는 제품은 맨 아래 「기타」로 나온다 — 시트에 제품이 늘어도 사라지지 않게.
   ---------------------------------------- */
const PRODUCT_GROUPS = [
    { line: '100 · 200 Line', products: ['ZAC', 'HAC', 'TEMAZ', 'TDMATi'] },
    { line: '300 · 400 · 500 Line', products: ['DIPAS', 'NABAL', 'BDEAS', 'BTBAS'] }
];

/**
 * 제품 버튼을 라인별로 묶은 HTML.
 * 「제품 입력」과 「공정 진행」이 같은 걸 쓴다 — 두 화면이 달라 보이면 안 된다.
 */
function productGroupsHtml(products, selected, onclickFn) {
    const names = (products || []).map(p => p.product);
    const btn = n => `<button type="button" class="pick-btn${n === selected ? ' on' : ''}"
                 onclick="${onclickFn}('${esc(n)}')">${esc(n)}</button>`;

    const used = new Set();
    let html = '';

    PRODUCT_GROUPS.forEach(g => {
        // 시트에 없는 제품은 버튼을 만들지 않는다(레시피가 없으면 못 쓴다)
        const inGroup = g.products.filter(n => names.includes(n));
        if (!inGroup.length) return;
        inGroup.forEach(n => used.add(n));
        html += `<div class="prod-group">
                   <div class="prod-line">${esc(g.line)}</div>
                   <div class="pick-row">${inGroup.map(btn).join('')}</div>
                 </div>`;
    });

    const rest = names.filter(n => !used.has(n));
    if (rest.length) {
        html += `<div class="prod-group">
                   <div class="prod-line">기타</div>
                   <div class="pick-row">${rest.map(btn).join('')}</div>
                 </div>`;
    }
    return html;
}

/* ----------------------------------------
   어느 제품이 어느 반응기를 쓰는가.

   찾는 차례가 셋이다 —
     ① 제품마다 정해 둔 것         (DIPAS 합성 → 401·501)
     ② 없으면 그 제품 라인의 것     (100·200 Line 합성 → 101·102·201·202)
     ③ 그것도 없으면 전부

   ★ 아직 안 정해진 것을 막아 두지 않는다. 막으면 등록 자체를 못 한다.
   ★ 줄여 놨을 때는 「다른 반응기 보기」로 나머지를 펼칠 수 있다.
     표가 틀렸다는 이유로 현장이 멈추면 안 된다.
   ---------------------------------------- */
const REACTORS_BY_LINE = {
    '100 · 200 Line':       { '합성': ['EGR-101', 'EGR-102', 'EGR-201', 'EGR-202'] },
    '300 · 400 · 500 Line': { '합성': ['EGR-301', 'EGR-401', 'EGR-501'] }
};

const REACTORS_BY_PRODUCT = {
    'DIPAS': {
        '합성': ['EGR-401', 'EGR-501'],
        '정제': ['EGR-403', 'EGR-404', 'EGR-503', 'EGR-504']
    },
    'ZAC': {
        '합성': ['EGR-101', 'EGR-201'],
        '정제': ['EGR-701', 'EGR-702', 'EGR-703', 'EGR-704',
                 'EGR-801', 'EGR-802', 'EGR-803', 'EGR-804']
    },
    'NABAL': {
        '합성': ['EGR-301']
    },
    'BDEAS': {
        '정제': ['EGR-303', 'EGR-304']
    }
    // HAC · TDMATi · BTBAS · TEMAZ 는 아직 안 정해져서 라인 기준으로만 걸러진다.
    // 정제 위치가 없는 제품은 정제 반응기가 전부 보인다.
};

/** 그 제품이 속한 라인 이름 */
function lineOf(product) {
    const g = PRODUCT_GROUPS.find(g => g.products.includes(product));
    return g ? g.line : '';
}

/** 그 제품·공정에서 보여 줄 반응기 */
function reactorsFor(product, process, showAll) {
    const all = REACTORS_BY_PROCESS[process] || [];
    if (showAll) return all;

    const byProduct = (REACTORS_BY_PRODUCT[product] || {})[process];
    if (byProduct && byProduct.length) return byProduct;

    const byLine = (REACTORS_BY_LINE[lineOf(product)] || {})[process];
    if (byLine && byLine.length) return byLine;

    return all;
}

/** 「다른 반응기 보기」를 붙일지 — 줄여 놓은 게 있을 때만 */
function hasHiddenReactors(product, process) {
    const all = REACTORS_BY_PROCESS[process] || [];
    return reactorsFor(product, process, false).length < all.length;
}

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
    editRows: null,      // 고치기용 — 시트 칸 그대로 + 줄 번호
    allLots: null,       // 그 제품의 Lot 전부(끝난 것 포함) — 정제 번호를 셀 때 쓴다
    source: null,        // 정제할 원래 Lot {lotNo, process}
    sourceMode: '',      // 'pick' | 'manual'
    showAllReactors: false,  // 줄여 놓은 반응기 목록을 펼쳤는지
    lotFilter: ''        // Lot 고르기 검색어
};

/* ----------------------------------------
   정제 Lot 번호
   끝의 공정 부분만 갈아 끼운다. 이어 붙이지 않는다.
     ZAC26-0801-A01     합성
     ZAC26-0801-S01     1차 정제   ← A01 자리를 S01이 차지한다
     ZAC26-0801-S02     2차 정제
   ★ 몇 차인지는 시트에 이미 있는 번호를 세어서 정한다. 따로 저장하지 않는다 —
     저장해 두면 관리자가 줄을 지웠을 때 조용히 어긋난다.
   ★ 같은 날 합성한 A01·A02를 각각 정제하면 S01·S02가 된다.
     정제 차수와 합성 회차가 1:1로 맞지는 않는다 — 현장 번호 규칙이 그렇다.
   ---------------------------------------- */
function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** 'ZAC26-0801-A01' 또는 'ZAC26-0801-S02' → 'ZAC26-0801' */
function purifyBase(lotNo) {
    return String(lotNo || '').trim().replace(/-[AS]\d+$/i, '');
}

/** 그 Lot을 정제하면 붙을 다음 번호 */
function nextPurifyNo(lotNo, allLots) {
    const base = purifyBase(lotNo);
    if (!base) return '';
    const re = new RegExp('^' + escRe(base) + '-S(\\d+)$', 'i');
    let max = 0;
    (allLots || []).forEach(l => {
        const m = re.exec(String(l.lotNo || '').trim());
        if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
    });
    return base + '-S' + String(max + 1).padStart(2, '0');
}

/* ----------------------------------------
   Lot 번호 앞자리
     ZAC  + EGR-101 → 'ZAC26-08'      (라인 숫자 안 씀)
     DIPAS + EGR-501 → 'DPS526-08'    (DIPAS만 4·5 라인이 갈려서 숫자를 끼운다)
   뒤에 일(日)과 -A01 / -S01이 붙어 완성된다.
   ★ 이 앞자리는 그 달의 회차를 셀 때 시트 쪽으로도 그대로 넘어간다
     (fillNextSeq → getNextLotSeq). 여기 모양이 바뀌면 회차도 같이 어긋난다.
   ---------------------------------------- */
function lotCodePrefix(product, reactor) {
    const info = PRODUCT_CODES[product] || { code: product, useLine: false };
    let code = info.code || product;

    if (info.useLine) {
        // 'EGR-501' → '5'.  반응기를 아직 안 골랐으면 숫자 없이 둔다.
        const m = /(\d)\d\d$/.exec(String(reactor || ''));
        if (m) code += m[1];
    }

    const d = todayKSTDate();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${code}${yy}-${mm}`;
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
              steps: null, editing: false, editRows: null,
              allLots: null, source: null, sourceMode: '', lotFilter: '',
              showAllReactors: false };
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
    renderEntrySource();
    renderEntryStepNumbers();
    renderEntryReactors();
    renderEntryLot();
    renderEntryRecipe();
    updateEntrySubmit();
}

function renderEntryProducts() {
    const box = document.getElementById('entry-products');
    if (!box) return;
    if (!entry.products) { box.innerHTML = ''; return; }

    box.innerHTML = productGroupsHtml(entry.products, entry.product, 'pickProduct');
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

    // 정제는 「무엇을 정제하는지」부터 고르고 나서 반응기를 보여 준다.
    const ready = entry.process && (entry.process !== '정제' || entry.sourceMode);
    if (!ready) { step.style.display = 'none'; box.innerHTML = ''; return; }
    step.style.display = 'block';

    const list = reactorsFor(entry.product, entry.process, entry.showAllReactors);
    let html = list.map(r =>
        `<button type="button" class="pick-btn mono${r === entry.reactor ? ' on' : ''}"
                 onclick="pickReactor('${r}')">${r}</button>`
    ).join('');

    if (!entry.showAllReactors && hasHiddenReactors(entry.product, entry.process)) {
        html += `<button type="button" class="pick-btn more"
                         onclick="showAllReactors()">다른 반응기 보기</button>`;
    }
    box.innerHTML = html;
}

function showAllReactors() {
    entry.showAllReactors = true;
    renderEntryReactors();
}

function renderEntryLot() {
    const step = document.getElementById('entry-step-lot');
    const input = document.getElementById('entry-lot');
    const hint = document.getElementById('entry-lot-hint');
    if (!step || !input) return;

    if (!entry.reactor) { step.style.display = 'none'; return; }
    step.style.display = 'block';

    // 사용자가 직접 고친 번호는 건드리지 않는다.
    if (!input.dataset.touched) {
        if (entry.process === '정제') {
            input.value = entry.source ? nextPurifyNo(entry.source.lotNo, entry.allLots) : '';
        } else {
            input.value = makeLotNo(entry.product, entry.process, entry.reactor, entry.seq || 1);
        }
    }

    if (hint && entry.process === '정제') {
        hint.textContent = entry.source
            ? `${entry.source.lotNo} 을(를) 정제합니다. 필요하면 번호를 고치셔도 됩니다.`
            : '밖에서 온 Crude는 번호를 직접 적어 주세요.';
    }
}

/* ----------------------------------------
   정제할 Lot 고르기
   「몇 차 정제인가」를 사람이 세지 않게 한다 — 시트에 있는 번호를 앱이 센다.
   ---------------------------------------- */
function renderEntryStepNumbers() {
    const pur = (entry.process === '정제');
    const setNum = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
    setNum('entry-num-reactor', pur ? 4 : 3);
    setNum('entry-num-lot',     pur ? 5 : 4);
}

function renderEntrySource() {
    const step = document.getElementById('entry-step-source');
    const box = document.getElementById('entry-sources');
    if (!step || !box) return;

    if (entry.process !== '정제') { step.style.display = 'none'; box.innerHTML = ''; return; }
    step.style.display = 'block';

    if (!entry.allLots) {
        box.innerHTML = '<div class="recipe-empty">Lot을 불러오는 중…</div>';
        return;
    }

    const manual = `<button type="button" class="src-card manual${entry.sourceMode === 'manual' ? ' on' : ''}"
              onclick="pickSourceManual()">
              <div class="src-no">직접 입력</div>
              <div class="src-meta">밖에서 온 Crude처럼 앞 Lot이 없을 때</div>
            </button>`;

    const q = (entry.lotFilter || '').trim().toLowerCase();
    const list = entry.allLots.filter(l => !q || String(l.lotNo).toLowerCase().includes(q));

    if (!list.length) {
        box.innerHTML = (entry.allLots.length
            ? '<div class="recipe-empty">찾는 Lot이 없습니다.</div>'
            : '<div class="recipe-empty">이 제품에 등록된 Lot이 아직 없습니다.</div>') + manual;
        return;
    }

    // 너무 많으면 화면이 무거워진다. 최근 것부터 40개만 — 나머지는 검색으로.
    box.innerHTML = list.slice(0, 40).map(l => {
        const on = entry.sourceMode === 'pick' && entry.source &&
                   entry.source.lotNo === l.lotNo && entry.source.process === l.process;
        return `<button type="button" class="src-card${on ? ' on' : ''}"
                  onclick="pickSource('${esc(l.lotNo)}','${esc(l.process)}')">
                  <div class="src-no">${esc(l.lotNo)}</div>
                  <div class="src-meta">${esc(l.process)} · ${esc(l.reactor)} · ${l.done ? '완료' : '진행 중'}</div>
                  <div class="src-next">→ ${esc(nextPurifyNo(l.lotNo, entry.allLots))}</div>
                </button>`;
    }).join('') + manual +
    (list.length > 40 ? '<div class="entry-hint">40개만 보입니다. 위 칸에 번호를 쳐서 찾으세요.</div>' : '');
}

function filterSourceLots(v) {
    entry.lotFilter = v;
    renderEntrySource();
}

function clearSourcePick() {
    entry.source = null;
    entry.sourceMode = '';
    entry.reactor = '';
    const input = document.getElementById('entry-lot');
    if (input) { delete input.dataset.touched; input.value = ''; }
}

function pickSource(lotNo, process) {
    clearSourcePick();
    entry.source = { lotNo, process };
    entry.sourceMode = 'pick';
    renderEntry();
}

function pickSourceManual() {
    clearSourcePick();
    entry.sourceMode = 'manual';
    renderEntry();
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

// 「자동」 버튼. 화면을 처음 그릴 때와 똑같은 번호가 나와야 한다 —
// 정제는 고른 원래 Lot에서 뽑고, 합성은 그 달의 회차로 만든다.
function resetLotNo() {
    const input = document.getElementById('entry-lot');
    if (!input) return;
    delete input.dataset.touched;
    renderEntryLot();
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
    const sourceOk = entry.process !== '정제' || !!entry.sourceMode;
    const ready = entry.product && entry.process && entry.reactor && lot.trim()
                  && entry.steps && sourceOk && !entry.editing;
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
    entry.allLots = null;       // 제품이 바뀌면 Lot 목록도 다시 받아야 한다
    entry.source = null;
    entry.sourceMode = '';
    entry.lotFilter = '';
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
    entry.source = null;
    entry.sourceMode = '';
    entry.lotFilter = '';
    entry.showAllReactors = false;
    const filter = document.getElementById('entry-lot-filter');
    if (filter) filter.value = '';
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

    // 정제는 무엇을 정제하는지 골라야 한다 — 그 제품의 Lot을 끝난 것까지 다 받아 온다.
    if (process === '정제') await loadEntryLots();
}

/** 그 제품의 Lot 전부. 정제 차수를 세는 데도 쓰이므로 끝난 것까지 받는다. */
async function loadEntryLots(force) {
    if (entry.allLots && !force) { renderEntry(); return; }
    renderEntry();
    try {
        entry.allLots = await googleSheetsManager.getLots(entry.product, true);
    } catch (err) {
        entry.allLots = [];
        setEntryStatus(`Lot 목록을 불러오지 못했습니다.\n${err.message}`, true);
    }
    renderEntry();
}

function pickReactor(reactor) {
    entry.reactor = reactor;
    const input = document.getElementById('entry-lot');
    if (input) delete input.dataset.touched;   // 반응기가 바뀌면 라인 숫자도 바뀐다
    renderEntry();
    // 「그 달의 회차」는 합성 번호에만 쓰인다. 정제 번호는 앞 Lot에서 나온다.
    if (entry.process === '합성') fillNextSeq();
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
        if (entry.process === '정제' && entry.source) {
            // 계보 줄까지 같이 남긴다 — 「어느 Lot에서 왔는지」가 있어야
            // 진행 화면에서 투입 Lot이 저절로 채워진다.
            await googleSheetsManager.nextLot(
                entry.product, entry.source.lotNo, entry.source.process,
                '정제', lot, entry.reactor
            );
        } else {
            await googleSheetsManager.registerLot(
                entry.product, entry.process, lot, entry.reactor
            );
        }
        alert(
            '✅ Lot이 등록되었습니다.\n\n' +
            `${lot}\n` +
            `${entry.product} · ${entry.process} · ${entry.reactor}\n` +
            (entry.source ? `투입 Lot: ${entry.source.lotNo}\n` : '') +
            '\n「공정 진행」에서 이 Lot을 눌러 단계를 시작하시면 됩니다.'
        );
        // 다음 Lot을 이어서 등록하기 쉽게 제품·공정은 남기고 번호만 새로 받는다.
        delete input.dataset.touched;
        if (entry.process === '정제') {
            // 방금 만든 것까지 세어야 다음 차수가 맞는다.
            entry.source = null;
            entry.sourceMode = '';
            entry.reactor = '';
            input.value = '';
            await loadEntryLots(true);
        } else {
            await fillNextSeq();
        }
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
