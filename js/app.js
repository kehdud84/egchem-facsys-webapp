/* ========================================
   EGChem FACSYS 메인 앱 로직
   - 화면 전환, 점검 워크플로우, 대시보드
   - 의존성: googleSheets.js, equipment.js
   ======================================== */

// 전역 장비 관리자 인스턴스
const equipmentManager = new EquipmentManager();

// 점검 데이터 (현재 세션)
let inspectionData = {
    type: '',
    equipment: [],    // 여러 장비 선택 가능
    inspections: [],
    notes: ''
};

let currentStep = 'type';

/* ========================================
   팀(시트) 선택
   ======================================== */
function selectSheet(sheetName) {
    console.log(`[selectSheet] 시트 전환: ${currentSheetName} -> ${sheetName}`);
    currentSheetName = sheetName;
    
    // 카드 선택 상태 업데이트
    const cards = {
        '1-A': 'site-card-1a', '1-B': 'site-card-1b', '1-C': 'site-card-1c',
        '1-D': 'site-card-1d', '1-E': 'site-card-1e'
    };
    
    Object.values(cards).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('selected');
    });
    
    const selectedCard = document.getElementById(cards[sheetName]);
    if (selectedCard) selectedCard.classList.add('selected');
    
    // 시트별 장비 목록 갱신
    equipmentManager.equipmentData = equipmentManager.loadEquipmentData();
    
    // 데이터 초기화
    inspectionData.equipment = [];
    inspectionData.inspections = [];
    inspectionData.notes = '';
    loadEquipmentList();
    openDashboard();
}

/* ========================================
   대시보드 화면
   ======================================== */
async function openDashboard() {
    try {
        const mainScreen = document.getElementById('main-screen');
        const inspectionScreen = document.getElementById('inspection-screen');
        const dashboardScreen = document.getElementById('dashboard-screen');
        const chartsContainer = document.getElementById('dashboard-charts');
        
        if (!dashboardScreen || !chartsContainer) {
            alert('대시보드 화면을 찾을 수 없습니다. 페이지를 새로고침해주세요.');
            return;
        }
        
        if (mainScreen) mainScreen.style.display = 'none';
        if (inspectionScreen) { inspectionScreen.style.display = 'none'; inspectionScreen.classList.remove('active'); }
        
        chartsContainer.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666; grid-column: 1 / -1;">데이터 로딩 중...</div>';
        chartsContainer.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 2rem; justify-items: center; min-height: 300px; width: 100%;';
        
        dashboardScreen.style.display = 'block';
        dashboardScreen.style.visibility = 'visible';
        dashboardScreen.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'instant' });
        
        await new Promise(resolve => setTimeout(resolve, 50));
        
        try {
            await loadDashboard();
        } catch (loadError) {
            console.error('대시보드 데이터 로드 오류:', loadError);
            chartsContainer.innerHTML = '<div style="text-align: center; padding: 2rem; color: #f44336; grid-column: 1 / -1;">데이터 로드 중 오류가 발생했습니다.<br><small>다시 시도해주세요.</small></div>';
        }
    } catch (error) {
        console.error('대시보드 열기 오류:', error);
    }
}

/* ========================================
   팀별 점검 현황 (전체 대시보드)
   ======================================== */
async function openAllTeamsDashboard() {
    const mainScreen = document.getElementById('main-screen');
    const inspectionScreen = document.getElementById('inspection-screen');
    const dashboardScreen = document.getElementById('dashboard-screen');
    const allTeamsScreen = document.getElementById('all-teams-dashboard-screen');
    const container = document.getElementById('all-teams-dashboard');

    if (mainScreen) mainScreen.style.display = 'none';
    if (inspectionScreen) { inspectionScreen.style.display = 'none'; inspectionScreen.classList.remove('active'); }
    if (dashboardScreen) { dashboardScreen.style.display = 'none'; dashboardScreen.classList.remove('active'); }

    if (!allTeamsScreen || !container) {
        alert('팀별 점검 현황 화면을 찾을 수 없습니다.');
        return;
    }

    allTeamsScreen.style.display = 'block';
    allTeamsScreen.style.visibility = 'visible';
    allTeamsScreen.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'instant' });
    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666;">데이터 로딩 중...</div>';

    try {
        await loadAllTeamsDashboard();
    } catch (error) {
        console.error('팀별 점검 현황 로드 오류:', error);
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #f44336;">데이터 로드 중 오류가 발생했습니다.</div>';
    }
}

// 팀별 점검 현황 테이블 로드 (5팀 병렬 처리)
async function loadAllTeamsDashboard() {
    const container = document.getElementById('all-teams-dashboard');
    if (!container) return;

    const inspectionTypes = ['주간점검', '월간점검', '분기점검', '반기점검', '연간점검'];
    const teams = [
        { sheet: '1-A', name: '제조팀' },
        { sheet: '1-B', name: '정제팀' },
        { sheet: '1-C', name: '출하팀' },
        { sheet: '1-D', name: '품질부' },
        { sheet: '1-E', name: '연구소' }
    ];

    const totalTasks = teams.length * inspectionTypes.length;
    let completedTasks = 0;

    container.innerHTML = '';
    const loadingDiv = document.createElement('div');
    loadingDiv.style.cssText = 'text-align: center; padding: 2rem; color: #666;';
    loadingDiv.textContent = `데이터 로딩 중... (0/${totalTasks})`;
    container.appendChild(loadingDiv);

    // 테이블 프레임 미리 생성
    const table = document.createElement('table');
    table.className = 'all-teams-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = '<th>팀</th>' + inspectionTypes.map(t => `<th>${t}</th>`).join('');
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    // 5팀 병렬 처리 (각 팀 내 5개 점검유형은 순차)
    // 전역 currentSheetName을 건드리지 않으므로 안전
    const teamResults = await Promise.all(teams.map(async (team) => {
        const rates = [];
        for (const type of inspectionTypes) {
            try {
                const rate = await calculateCompletionRate(type, team.sheet);
                rates.push(rate);
            } catch {
                rates.push({ percentage: 0, completed: 0, total: 0, status: 'unknown' });
            }
            completedTasks++;
            loadingDiv.textContent = `데이터 로딩 중... (${completedTasks}/${totalTasks})`;
        }
        return { team, rates };
    }));

    // 결과로 행 생성
    for (const { team, rates } of teamResults) {
        const row = document.createElement('tr');
        row.innerHTML = `<td class="team-name-cell">${team.name}</td>`;

        for (const rate of rates) {
            const statusClass = rate.status === 'alarm' ? 'alarm' : rate.status === 'warning' ? 'warning' : 'normal';
            const cell = document.createElement('td');
            cell.innerHTML = `<span class="status-badge ${statusClass}">${rate.percentage}%</span><span class="status-sub">${rate.completed}/${rate.total}</span>`;
            row.appendChild(cell);
        }
        tbody.appendChild(row);
    }

    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);
}

/* ========================================
   대시보드 데이터 로드 및 원그래프
   ======================================== */
async function loadDashboard() {
    const chartsContainer = document.getElementById('dashboard-charts');
    if (!chartsContainer) return;
    
    chartsContainer.innerHTML = '';
    chartsContainer.style.cssText = 'display: grid !important; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)) !important; gap: 2rem !important; justify-items: center !important; min-height: 300px !important; width: 100% !important;';
    
    const inspectionTypes = ['일일점검', '주간점검', '월간점검', '분기점검', '반기점검', '연간점검'];
    
    try {
        const targetSheet = currentSheetName || '1-A';
        const results = await Promise.all(inspectionTypes.map(async (type) => {
            try {
                const completionRate = await calculateCompletionRate(type, targetSheet);
                if (completionRate.total === 0) throw new Error('장비 목록 없음');
                return { type, completionRate };
            } catch (error) {
                console.error(`${type} 완료율 계산 실패:`, error);
                return { type, completionRate: { percentage: 0, completed: 0, total: 14, status: 'unknown' } };
            }
        }));
        
        chartsContainer.innerHTML = '';
        
        for (const { type, completionRate } of results) {
            const chartItem = createChart(type, completionRate);
            if (chartItem) chartsContainer.appendChild(chartItem);
        }
        
        if (chartsContainer.children.length === 0) {
            chartsContainer.innerHTML = '<div style="text-align: center; padding: 2rem; color: #f44336; grid-column: 1 / -1;">데이터를 불러올 수 없습니다.</div>';
        }
    } catch (error) {
        chartsContainer.innerHTML = '<div style="text-align: center; padding: 2rem; color: #f44336; grid-column: 1 / -1;">데이터 로드 중 오류가 발생했습니다.<br><button onclick="openDashboard()" style="margin-top: 1rem; padding: 0.5rem 1rem; background-color: #4CAF50; color: #fff; border: none; border-radius: 4px; cursor: pointer;">다시 시도</button></div>';
        throw error;
    }
}

// 각 점검 유형별 완료율 계산
// explicitSheet: 명시적 시트명 (전역 currentSheetName 대신 사용, 병렬 호출 안전)
async function calculateCompletionRate(inspectionType, explicitSheet) {
    const targetSheet = explicitSheet || currentSheetName || '1-A';
    
    // 전역 상태를 변경하지 않고 해당 시트의 장비 목록을 직접 가져옴
    const equipmentList = getEquipmentListForSheet(inspectionType, targetSheet);
    const totalEquipment = equipmentList.length;
    let completedCount = 0;
    
    if (googleSheetsManager.webAppUrl) {
        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('구글 시트 응답 타임아웃 (6초)')), 6000);
            });
            
            let sheetEquipment = null;
            for (let retry = 0; retry < 2; retry++) {
                try {
                    sheetEquipment = await Promise.race([
                        googleSheetsManager.getEquipmentFromSheet(inspectionType, targetSheet),
                        timeoutPromise
                    ]);
                    if (sheetEquipment && sheetEquipment.length > 0) break;
                    if (retry < 1) await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    if (retry < 1) await new Promise(resolve => setTimeout(resolve, 1000));
                    else throw error;
                }
            }
            
            if (sheetEquipment && Array.isArray(sheetEquipment) && sheetEquipment.length > 0) {
                for (const equipment of equipmentList) {
                    const normalizedName = equipment.name.trim().toLowerCase();
                    const sheetData = sheetEquipment.find(se => se?.name?.trim().toLowerCase() === normalizedName);
                    
                    if (sheetData && sheetData.lastInspectionDate) {
                        let dateString = sheetData.lastInspectionDate;
                        if (dateString instanceof Date) {
                            dateString = `${dateString.getFullYear()}-${String(dateString.getMonth()+1).padStart(2,'0')}-${String(dateString.getDate()).padStart(2,'0')}`;
                        } else if (typeof dateString === 'string') {
                            dateString = dateString.trim();
                            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) continue;
                        } else { continue; }
                        
                        const alarmStatus = inspectionTimeManager.calculateAlarmStatusFromDate(inspectionType, dateString);
                        if (alarmStatus === 'normal') completedCount++;
                    }
                }
            }
        } catch (error) {
            console.error(`[완료율 계산] 구글 시트 조회 실패 (${targetSheet}/${inspectionType}):`, error);
            throw error;
        }
    }
    
    const percentage = totalEquipment > 0 ? Math.round((completedCount / totalEquipment) * 100) : 0;
    let status = 'completed';
    if (percentage < 50) status = 'alarm';
    else if (percentage < 80) status = 'warning';
    
    return { percentage, completed: completedCount, total: totalEquipment, status };
}

// 전역 상태를 건드리지 않고 특정 시트의 장비 목록을 반환하는 헬퍼
function getEquipmentListForSheet(inspectionType, sheetName) {
    const equipmentBySheet = {
        '1-A': [
            { name: '진공펌프' }, { name: 'A/C Tower' }, { name: '스크러바' },
            { name: '자동 배기장치' }, { name: '합성 반응기' }, { name: '정제 반응기' },
            { name: 'Feeding Tank' }, { name: '정제수 제조설비' }, { name: '냉각수 시스템' },
            { name: '온수 시스템' }, { name: '압축공기 시스템' }, { name: '상활실 및 전기' },
            { name: '방화셔터' }, { name: '승강기' }
        ],
        '1-B': [
            { name: '진공펌프' }, { name: 'A/C Tower' }, { name: 'Oven' },
            { name: '긴급배기장치' }, { name: '맨틀' }, { name: '교반기' },
            { name: '칠러' }, { name: '퓨리파이시스템' }
        ],
        '1-C': [
            { name: '진공펌프' }, { name: '글러브박스' }, { name: '클린룸 공조설비' },
            { name: '초음파 세척기' }, { name: '자동 세정설비' }, { name: '자동 충진설비' },
            { name: '자동 퍼지설비' }, { name: '클린오븐' }, { name: '제품 출하 차량' }
        ],
        '1-D': [
            { name: '진공펌프' }, { name: '글러브박스' }, { name: '클린룸 공조설비' },
            { name: 'GC' }, { name: 'NMR' }, { name: 'ICP' },
            { name: 'IC' }, { name: 'KF' }, { name: '점도계' }, { name: 'APHA' }
        ],
        '1-E': [
            { name: '진공펌프' }, { name: '글러브박스' },
            { name: '맨틀' }, { name: '교반기' }, { name: '칠러' }
        ]
    };
    
    return (equipmentBySheet[sheetName] || equipmentBySheet['1-A'])
        .map(eq => ({ ...eq, status: 'normal', statusText: '정상' }));
}

// 원그래프 생성
function createChart(type, completionRate) {
    const { percentage, completed, total, status } = completionRate;
    
    const chartItem = document.createElement('div');
    chartItem.className = 'dashboard-chart-item';
    chartItem.style.cssText = 'display: flex !important; flex-direction: column !important; align-items: center !important; cursor: pointer !important; padding: 1rem !important; min-width: 150px !important; min-height: 200px !important; box-sizing: border-box !important;';
    
    chartItem.onclick = async () => {
        inspectionData.type = type;
        document.getElementById('dashboard-screen').style.display = 'none';
        document.getElementById('dashboard-screen').classList.remove('active');
        document.getElementById('inspection-screen').style.display = 'block';
        document.getElementById('inspection-screen').classList.add('active');
        document.querySelectorAll('.inspection-step').forEach(step => { step.style.display = 'none'; });
        currentStep = 'equipment';
        await showStep('equipment');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;
    const statusClass = status === 'alarm' ? 'alarm' : status === 'warning' ? 'warning' : 'completed';
    
    chartItem.innerHTML = `
        <div class="chart-container">
            <svg class="chart-svg" viewBox="0 0 120 120">
                <circle class="chart-circle-bg" cx="60" cy="60" r="${radius}"></circle>
                <circle class="chart-circle-progress ${statusClass}" cx="60" cy="60" r="${radius}"
                    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
            </svg>
            <div class="chart-percentage">${percentage}%</div>
        </div>
        <div class="chart-label">${type}</div>
        <div class="chart-count">${completed}/${total} 완료</div>
    `;
    
    return chartItem;
}

/* ========================================
   화면 전환 및 네비게이션
   ======================================== */
function goBackToMain() {
    setTimeout(() => { location.reload(); }, 100);
}

async function goBackToDashboard() {
    const inspectionScreen = document.getElementById('inspection-screen');
    if (inspectionScreen) { inspectionScreen.style.display = 'none'; inspectionScreen.classList.remove('active'); }
    await openDashboard();
}

async function showStep(stepName) {
    document.querySelectorAll('.inspection-step').forEach(step => { step.style.display = 'none'; });
    const stepElement = document.getElementById(`step-${stepName}`);
    if (stepElement) {
        stepElement.style.display = 'block';
        currentStep = stepName;
        if (stepName === 'equipment') await loadEquipmentList();
        else if (stepName === 'inspection') loadInspectionItems();
    }
}

async function nextStep(nextStepName) { saveCurrentStepData(); await showStep(nextStepName); }
async function prevStep(prevStepName) { await showStep(prevStepName); }

function saveCurrentStepData() {
    if (currentStep === 'notes') {
        inspectionData.notes = document.getElementById('notes').value.trim();
    }
}

function openInspection() {
    // 호환성을 위해 유지 (대시보드에서 직접 이동)
}

/* ========================================
   장비 목록 로드
   ======================================== */
async function loadEquipmentList() {
    const equipmentItems = document.getElementById('equipment-items');
    equipmentItems.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666;">장비 목록 로딩 중...</div>';
    
    equipmentManager.equipmentData = equipmentManager.loadEquipmentData();
    const hardcodedEquipment = equipmentManager.getEquipmentByType(inspectionData.type);
    let equipmentList = hardcodedEquipment.map(eq => ({ ...eq, lastInspectionDate: null }));
    
    // 구글 시트에서 마지막 점검일 정보 병합
    if (googleSheetsManager.webAppUrl) {
        try {
            const sheetEquipment = await googleSheetsManager.getEquipmentFromSheet(inspectionData.type);
            if (sheetEquipment && sheetEquipment.length > 0) {
                equipmentList = equipmentList.map(eq => {
                    const normalizedName = eq.name.trim().toLowerCase();
                    const sheetData = sheetEquipment.find(se => se?.name?.trim().toLowerCase() === normalizedName);
                    if (sheetData && sheetData.lastInspectionDate) {
                        return { ...eq, lastInspectionDate: sheetData.lastInspectionDate };
                    }
                    return eq;
                });
            }
        } catch (error) {
            console.error('구글 시트에서 점검일 정보 가져오기 실패:', error);
        }
    }
    
    if (equipmentList.length === 0) {
        equipmentItems.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666;">등록된 장비가 없습니다.</div>';
        return;
    }
    
    equipmentItems.innerHTML = '';
    
    for (const equipment of equipmentList) {
        let alarmStatus, alarmStatusText;
        
        if (equipment.lastInspectionDate) {
            alarmStatus = inspectionTimeManager.calculateAlarmStatusFromDate(inspectionData.type, equipment.lastInspectionDate);
        } else {
            alarmStatus = inspectionTimeManager.calculateAlarmStatus(inspectionData.type, equipment.name, currentSheetName || '1-A');
        }
        alarmStatusText = inspectionTimeManager.getAlarmStatusText(alarmStatus);
        
        const statusColors = { 'normal': '#4CAF50', 'warning': '#FF9800', 'alarm': '#f44336', 'unknown': '#666' };
        const statusColor = statusColors[alarmStatus] || '#666';
        
        const isInitiallySelected = inspectionData.equipment.includes(equipment.name);
        
        const itemDiv = document.createElement('div');
        itemDiv.className = 'equipment-item';
        itemDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1;">
                    <div class="equipment-name">${equipment.name}</div>
                    <div class="equipment-status" style="color: ${statusColor}; font-weight: bold;">${alarmStatusText}</div>
                </div>
                <div class="equipment-check" style="font-size: 1.5rem; opacity: 0; transition: opacity 0.3s ease;">✓</div>
            </div>
        `;
        
        if (isInitiallySelected) {
            itemDiv.classList.add('selected');
            const checkMark = itemDiv.querySelector('.equipment-check');
            if (checkMark) checkMark.style.opacity = '1';
        }
        
        itemDiv.addEventListener('click', () => {
            const isSelected = itemDiv.classList.contains('selected');
            const checkMark = itemDiv.querySelector('.equipment-check');
            
            if (isSelected) {
                itemDiv.classList.remove('selected');
                if (checkMark) checkMark.style.opacity = '0';
                const index = inspectionData.equipment.indexOf(equipment.name);
                if (index > -1) inspectionData.equipment.splice(index, 1);
            } else {
                itemDiv.classList.add('selected');
                if (checkMark) checkMark.style.opacity = '1';
                if (!inspectionData.equipment.includes(equipment.name)) {
                    inspectionData.equipment.push(equipment.name);
                }
            }
            updateEquipmentSelectionInfo();
        });
        
        equipmentItems.appendChild(itemDiv);
    }
    
    updateEquipmentSelectionInfo();
}

function updateEquipmentSelectionInfo() {
    const infoElement = document.getElementById('equipment-selection-info');
    const nextButton = document.getElementById('equipment-next-btn');
    const selectedCount = inspectionData.equipment.length;
    
    if (infoElement) {
        if (selectedCount === 0) {
            infoElement.textContent = '여러 장비를 선택할 수 있습니다. (선택: 0개)';
            infoElement.style.color = '#666';
            infoElement.style.fontWeight = 'normal';
        } else {
            infoElement.textContent = `선택된 장비: ${selectedCount}개`;
            infoElement.style.color = '#4CAF50';
            infoElement.style.fontWeight = 'bold';
        }
    }
    
    if (nextButton) {
        nextButton.disabled = selectedCount === 0;
        nextButton.style.opacity = selectedCount > 0 ? '1' : '0.5';
        nextButton.style.cursor = selectedCount > 0 ? 'pointer' : 'not-allowed';
    }
}

function updateInspectionSelectionInfo() {
    const nextButton = document.getElementById('inspection-next-btn');
    const selectedCount = inspectionData.inspections.length;
    if (nextButton) {
        nextButton.disabled = selectedCount === 0;
        nextButton.style.opacity = selectedCount > 0 ? '1' : '0.5';
        nextButton.style.cursor = selectedCount > 0 ? 'pointer' : 'not-allowed';
    }
}

/* ========================================
   장비/점검항목 추가·삭제
   ======================================== */
async function addEquipment() {
    if (!inspectionData.type) { alert('점검 유형을 먼저 선택해주세요.'); return; }
    const name = prompt('장비명을 입력하세요:', '');
    if (!name || name.trim() === '') return;
    
    if (!googleSheetsManager.webAppUrl) { alert('⚠️ 구글 시트 연결이 필요합니다.'); openConnectionSettings(); return; }
    
    try {
        await googleSheetsManager.addEquipmentToSheet(inspectionData.type, name.trim());
        await loadEquipmentList();
        alert(`✅ ${name.trim()} 장비가 추가되었습니다!`);
    } catch (error) {
        alert(`❌ 장비 추가 실패: ${error.message}`);
    }
}

async function deleteEquipment() {
    if (!inspectionData.type) { alert('점검 유형을 먼저 선택해주세요.'); return; }
    const name = prompt('삭제할 장비명을 입력하세요:', '');
    if (!name || name.trim() === '') return;
    if (!confirm(`정말로 "${name.trim()}" 장비를 삭제하시겠습니까?`)) return;
    
    if (!googleSheetsManager.webAppUrl) { alert('⚠️ 구글 시트 연결이 필요합니다.'); openConnectionSettings(); return; }
    
    try {
        await googleSheetsManager.deleteEquipmentFromSheet(inspectionData.type, name.trim());
        await loadEquipmentList();
        alert(`✅ ${name.trim()} 장비가 삭제되었습니다!`);
    } catch (error) {
        alert(`❌ 장비 삭제 실패: ${error.message}`);
    }
}

async function addInspectionItem() {
    if (!inspectionData.type) { alert('점검 유형을 먼저 선택해주세요.'); return; }
    const itemName = prompt('점검 항목명을 입력하세요:', '');
    if (!itemName || itemName.trim() === '') return;
    
    if (!googleSheetsManager.webAppUrl) { alert('⚠️ 구글 시트 연결이 필요합니다.'); openConnectionSettings(); return; }
    
    try {
        await googleSheetsManager.addInspectionItemToSheet(inspectionData.type, itemName.trim());
        loadInspectionItems();
        alert(`✅ ${itemName.trim()} 점검 항목이 추가되었습니다!`);
    } catch (error) {
        alert(`❌ 점검 항목 추가 실패: ${error.message}`);
    }
}

async function deleteInspectionItem() {
    if (!inspectionData.type) { alert('점검 유형을 먼저 선택해주세요.'); return; }
    const itemName = prompt('삭제할 점검 항목명을 입력하세요:', '');
    if (!itemName || itemName.trim() === '') return;
    if (!confirm(`정말로 "${itemName.trim()}" 점검 항목을 삭제하시겠습니까?`)) return;
    
    if (!googleSheetsManager.webAppUrl) { alert('⚠️ 구글 시트 연결이 필요합니다.'); openConnectionSettings(); return; }
    
    try {
        await googleSheetsManager.deleteInspectionItemFromSheet(inspectionData.type, itemName.trim());
        loadInspectionItems();
        alert(`✅ ${itemName.trim()} 점검 항목이 삭제되었습니다!`);
    } catch (error) {
        alert(`❌ 점검 항목 삭제 실패: ${error.message}`);
    }
}

/* ========================================
   점검 항목 로드
   ======================================== */
function loadInspectionItems() {
    const checkItems = document.getElementById('check-items');
    checkItems.innerHTML = '';
    
    const items = inspectionItemsManager.getInspectionItems(inspectionData.type);
    
    if (items.length === 0) {
        checkItems.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666;">등록된 점검 항목이 없습니다.</div>';
        updateInspectionSelectionInfo();
        return;
    }
    
    items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'inspection-item';
        itemDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 1rem; background-color: #ffffff; border: 2px solid #e0e0e0; border-radius: 4px; margin-bottom: 1rem; cursor: pointer; transition: all 0.3s ease;';
        itemDiv.innerHTML = `
            <div style="font-weight: bold; color: #333;">${item}</div>
            <div class="item-status" style="padding: 0.5rem 1rem; border-radius: 4px; font-weight: bold; background-color: #e0e0e0; color: #666;">미점검</div>
        `;
        
        itemDiv.addEventListener('click', () => {
            if (itemDiv.classList.contains('completed')) {
                itemDiv.classList.remove('completed');
                itemDiv.style.background = '#ffffff';
                itemDiv.style.borderColor = '#e0e0e0';
                itemDiv.querySelector('.item-status').textContent = '미점검';
                itemDiv.querySelector('.item-status').style.backgroundColor = '#e0e0e0';
                itemDiv.querySelector('.item-status').style.color = '#666';
                const index = inspectionData.inspections.findIndex(r => r.item === item);
                if (index !== -1) inspectionData.inspections.splice(index, 1);
            } else {
                itemDiv.classList.add('completed');
                itemDiv.style.background = 'linear-gradient(135deg, #64B5F6 0%, #42A5F5 100%)';
                itemDiv.querySelector('.item-status').textContent = '점검완료';
                itemDiv.querySelector('.item-status').style.backgroundColor = '#42A5F5';
                const existing = inspectionData.inspections.find(r => r.item === item);
                if (existing) { existing.result = '점검완료'; }
                else { inspectionData.inspections.push({ item, result: '점검완료' }); }
            }
            updateInspectionSelectionInfo();
        });
        
        checkItems.appendChild(itemDiv);
    });
    
    // "기타" 옵션
    const otherDiv = document.createElement('div');
    otherDiv.id = 'other-inspection-item';
    otherDiv.style.cssText = 'margin-top: 1rem;';
    
    const otherHeader = document.createElement('div');
    otherHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 1rem; background-color: #ffffff; border: 2px solid #e0e0e0; border-radius: 4px; cursor: pointer; transition: all 0.3s ease;';
    otherHeader.innerHTML = `
        <div style="font-weight: bold; color: #333;">기타 (직접 입력)</div>
        <div id="other-status" style="padding: 0.5rem 1rem; border-radius: 4px; font-weight: bold; background-color: #e0e0e0; color: #666;">미점검</div>
    `;
    
    const otherInputContainer = document.createElement('div');
    otherInputContainer.id = 'other-input-container';
    otherInputContainer.style.cssText = 'display: none; margin-top: 1rem; padding: 1.5rem; background-color: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 4px;';
    otherInputContainer.innerHTML = `
        <input type="text" id="other-input" placeholder="점검 항목을 직접 입력하세요" 
              style="width: 100%; padding: 0.75rem; background-color: #ffffff; color: #333; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 1rem; margin-bottom: 1rem; box-sizing: border-box;">
        <div style="display: flex; gap: 0.75rem;">
            <button onclick="confirmOtherItem()" style="flex: 1; padding: 0.75rem; background-color: #64B5F6; color: #fff; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">확인</button>
            <button onclick="cancelOtherItem()" style="flex: 1; padding: 0.75rem; background-color: #e0e0e0; color: #333; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">취소</button>
        </div>
    `;
    
    otherHeader.addEventListener('click', () => {
        const inputContainer = document.getElementById('other-input-container');
        const otherStatus = document.getElementById('other-status');
        
        if (otherHeader.classList.contains('completed')) {
            otherHeader.classList.remove('completed');
            otherHeader.style.background = '#ffffff';
            otherHeader.style.borderColor = '#e0e0e0';
            otherStatus.textContent = '미점검';
            otherStatus.style.backgroundColor = '#e0e0e0';
            otherStatus.style.color = '#666';
            inputContainer.style.display = 'none';
            const otherItem = inspectionData.inspections.find(r => r.item?.startsWith('기타: '));
            if (otherItem) {
                inspectionData.inspections.splice(inspectionData.inspections.indexOf(otherItem), 1);
            }
            updateInspectionSelectionInfo();
        } else {
            inputContainer.style.display = inputContainer.style.display === 'none' ? 'block' : 'none';
            if (inputContainer.style.display === 'block') document.getElementById('other-input').focus();
        }
    });
    
    otherDiv.appendChild(otherHeader);
    otherDiv.appendChild(otherInputContainer);
    checkItems.appendChild(otherDiv);
    updateInspectionSelectionInfo();
}

function confirmOtherItem() {
    const otherInput = document.getElementById('other-input');
    const otherHeader = document.getElementById('other-inspection-item').querySelector('div:first-child');
    const otherStatus = document.getElementById('other-status');
    const inputContainer = document.getElementById('other-input-container');
    
    const customItem = otherInput.value.trim();
    if (!customItem) { alert('점검 항목을 입력해주세요.'); return; }
    
    const otherItemName = `기타: ${customItem}`;
    otherHeader.classList.add('completed');
    otherHeader.style.background = 'linear-gradient(135deg, #64B5F6 0%, #42A5F5 100%)';
    otherStatus.textContent = '점검완료';
    otherStatus.style.backgroundColor = '#42A5F5';
    inputContainer.style.display = 'none';
    
    const existing = inspectionData.inspections.find(r => r.item?.startsWith('기타: '));
    if (existing) { existing.item = otherItemName; existing.result = '점검완료'; }
    else { inspectionData.inspections.push({ item: otherItemName, result: '점검완료' }); }
    
    otherHeader.querySelector('div:first-child').textContent = otherItemName;
    otherInput.value = '';
    updateInspectionSelectionInfo();
}

function cancelOtherItem() {
    document.getElementById('other-input-container').style.display = 'none';
    document.getElementById('other-input').value = '';
    updateInspectionSelectionInfo();
}

/* ========================================
   점검 완료 제출
   ======================================== */
async function submitInspection() {
    saveCurrentStepData();
    
    if (!inspectionData.type) { alert('점검 유형을 선택해주세요.'); return; }
    if (!inspectionData.equipment || inspectionData.equipment.length === 0) { alert('장비를 최소 1개 이상 선택해주세요.'); return; }
    if (inspectionData.inspections.length === 0) { alert('점검 내용을 선택해주세요.'); return; }
    
    const equipmentList = inspectionData.equipment;
    let successCount = 0;
    const failedEquipment = [];
    
    for (const equipmentName of equipmentList) {
        const data = {
            type: inspectionData.type,
            equipment: equipmentName,
            inspections: inspectionData.inspections,
            notes: inspectionData.notes
        };
        
        try {
            await googleSheetsManager.addInspectionData(data);
            inspectionTimeManager.recordInspection(inspectionData.type, equipmentName, currentSheetName || '1-A');
            successCount++;
        } catch (error) {
            console.error(`${equipmentName} 저장 실패:`, error);
            failedEquipment.push(equipmentName);
            inspectionTimeManager.recordInspection(inspectionData.type, equipmentName, currentSheetName || '1-A');
        }
    }
    
    let saveResult = '';
    if (successCount === equipmentList.length) {
        saveResult = `\n✅ 모든 장비(${successCount}개)가 구글 시트에 저장되었습니다!`;
    } else if (successCount > 0) {
        saveResult = `\n⚠️ ${successCount}개 성공, ${failedEquipment.length}개 실패: ${failedEquipment.join(', ')}`;
    } else {
        saveResult = `\n⚠️ 구글 시트 저장 실패. 로컬에만 저장되었습니다.`;
    }
    
    const equipmentListText = equipmentList.length === 1 
        ? equipmentList[0] : `${equipmentList[0]} 외 ${equipmentList.length - 1}개`;
    
    alert('✅ 점검이 완료되었습니다!\n\n' +
          `- 점검 유형: ${inspectionData.type}\n` +
          `- 장비: ${equipmentListText} (총 ${equipmentList.length}개)\n` +
          `- 점검 항목: ${inspectionData.inspections.length}개\n` +
          `- 특이사항: ${inspectionData.notes || '없음'}` + saveResult);
    
    goBackToMain();
}

/* ========================================
   연결 설정 모달
   ======================================== */
function openConnectionSettings() {
    document.getElementById('connection-modal').style.display = 'flex';
}

function closeConnectionSettings() {
    document.getElementById('connection-modal').style.display = 'none';
}

async function testConnection() {
    const webAppUrl = document.getElementById('webapp-url').value.trim();
    const debugInfo = document.getElementById('debug-info');
    
    if (!webAppUrl) { alert('웹앱 URL을 입력해주세요.'); return; }
    
    debugInfo.innerHTML = '연결 테스트 중...';
    
    try {
        googleSheetsManager.setWebAppUrl(webAppUrl);
        await googleSheetsManager.testConnection();
        debugInfo.innerHTML = '✅ 연결 성공!';
        googleSheetsManager.updateConnectionStatus(true);
        alert('✅ 연결 테스트 성공!');
    } catch (error) {
        debugInfo.innerHTML = `❌ 연결 실패: ${error.message}`;
        googleSheetsManager.updateConnectionStatus(false);
        alert(`❌ 연결 테스트 실패: ${error.message}`);
    }
}

function saveConnectionSettings() {
    const webAppUrl = document.getElementById('webapp-url').value.trim();
    if (!webAppUrl) { alert('웹앱 URL을 입력해주세요.'); return; }
    
    localStorage.setItem('google_webapp_url', webAppUrl);
    googleSheetsManager.setWebAppUrl(webAppUrl);
    googleSheetsManager.updateConnectionStatus(true);
    
    alert('✅ 연결 설정이 저장되었습니다!');
    closeConnectionSettings();
    
    if (document.getElementById('inspection-screen').style.display !== 'none') {
        const currentStepEl = document.querySelector('.inspection-step[style*="block"]');
        if (currentStepEl && currentStepEl.id === 'step-equipment') loadEquipmentList();
    }
}

/* ========================================
   초기화
   ======================================== */
console.log('✅ EGChem FACSYS 웹앱 로드 완료!');
