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
    steps: null          // 레시피 단계
};

/* ----------------------------------------
   Lot 번호 만들기
   DPS526-0827-A01  =  코드 + 라인 + 연2자리 - 월일 - 공정문자 + 회차
   ※ 회차는 그 달의 몇 번째인지라 시트를 봐야 안다.
     지금은 01로 채워 두고 관리자가 고친다. 백엔드가 붙으면 자동으로 채운다.
   ---------------------------------------- */
function makeLotNo(product, process, reactor, seq) {
    const conf = PRODUCT_CODES[product] || { code: product, useLine: false };

    let line = '';
    if (conf.useLine && reactor) {
        const m = String(reactor).match(/EGR-(\d)/);
        if (m) line = m[1];
    }

    const d = todayKSTDate();
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const letter = PROCESS_LETTER[process] || 'A';
    const nn = String(seq || 1).padStart(2, '0');

    return `${conf.code}${line}${yy}-${mm}${dd}-${letter}${nn}`;
}

/* ----------------------------------------
   화면 열기
   ---------------------------------------- */
async function openProductEntry() {
    entry = { products: entry.products, product: '', process: '', reactor: '', steps: null };
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
        input.value = makeLotNo(entry.product, entry.process, entry.reactor, 1);
    }
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
    input.value = makeLotNo(entry.product, entry.process, entry.reactor, 1);
    updateEntrySubmit();
}

function renderEntryRecipe() {
    const step = document.getElementById('entry-step-recipe');
    const box = document.getElementById('entry-recipe');
    if (!step || !box) return;

    if (!entry.steps) { step.style.display = 'none'; box.innerHTML = ''; return; }
    step.style.display = 'block';

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
    const ready = entry.product && entry.process && entry.reactor && lot.trim() && entry.steps;
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
    const input = document.getElementById('entry-lot');
    if (input) { delete input.dataset.touched; input.value = ''; }
    renderEntry();
}

async function pickProcess(process) {
    entry.process = process;
    entry.reactor = '';
    entry.steps = null;
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
}

/* ----------------------------------------
   등록 — 백엔드는 다음 단계에서 붙인다
   ---------------------------------------- */
function submitProductEntry() {
    const lot = (document.getElementById('entry-lot') || {}).value.trim();
    alert(
        '아직 저장 기능은 만들지 않았습니다. 여기까지 골라졌습니다:\n\n' +
        `제품    ${entry.product}\n` +
        `공정    ${entry.process}\n` +
        `반응기  ${entry.reactor}\n` +
        `Lot     ${lot}\n` +
        `단계    ${entry.steps ? entry.steps.length : 0}개`
    );
}
