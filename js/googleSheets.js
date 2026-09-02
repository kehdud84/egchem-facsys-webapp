/* ========================================
   구글 시트 연동 관리 (GoogleSheetsManager)
   - JSONP 방식으로 Google Apps Script 웹앱과 통신
   - 점검 데이터 저장, 장비 목록 조회, 점검 항목 관리
   ======================================== */

/* ----------------------------------------
   공용 날짜 유틸 (한국 시간 기준)
   ⚠️ 반드시 이 함수만 사용할 것.
   `new Date(d.toLocaleString('en-US',{timeZone:'Asia/Seoul'})).toISOString()`
   패턴은 KST 벽시계를 로컬시간으로 재파싱한 뒤 다시 UTC로 변환하므로
   오전 9시 이전에 날짜가 하루 밀립니다. (2026-08 수정)
   ---------------------------------------- */
function todayKST(date = new Date()) {
    // en-CA 로케일은 YYYY-MM-DD 형식을 그대로 반환합니다.
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

// KST 기준 '오늘 자정'을 나타내는 Date (날짜 차이 계산용)
function todayKSTDate() {
    const [y, m, d] = todayKST().split('-').map(Number);
    return new Date(y, m - 1, d);
}

// 🔥 중요: 기본 웹앱 URL 설정
// Google Apps Script에서 배포한 웹앱 URL을 여기에 입력하세요.
// 이 URL은 모든 기기(모바일, PC)에서 동일하게 사용됩니다.
// 형식: https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
const DEFAULT_WEB_APP_URL = ''; // 여기에 웹앱 URL을 입력하세요

/* ----------------------------------------
   요청 타임아웃 (밀리초)
   Apps Script 웹앱은 한동안 호출이 없으면 콜드 스타트로 5~15초가 걸립니다.
   현장 통신이 느린 휴대폰에서는 여기에 더 얹혀서 예전 6초/10초로는 항상 실패했습니다.
   빠른 회선에서는 어차피 1~2초에 응답이 오므로, 값을 키워도 평소 체감 속도는 같습니다.
   (이 값은 "포기하기까지 기다리는 최대 시간"이지 "매번 기다리는 시간"이 아닙니다)
   ---------------------------------------- */
// Apps Script는 새 버전을 배포한 뒤 첫 호출이 느리다(코드를 새로 깨우기 때문).
// 20초로는 그때 못 기다린다. 평소에는 1~2초에 오므로 값을 키워도 체감은 같다.
const TIMEOUT_READ = 35000;    // 조회 (장비 목록, Lot 목록 등)
const TIMEOUT_WRITE = 45000;   // 저장 — 실패하면 데이터가 날아가므로 더 넉넉히

// 구글 시트 연동 클래스
class GoogleSheetsManager {
    constructor() {
        this.isConnected = false;
        this.webAppUrl = '';
        this._cache = new Map();      // API 응답 캐시
        this._cacheTTL = 30000;       // 캐시 유효시간 30초
        this.init();
    }
    
    // 캐시 조회 (유효시간 초과 시 null)
    _getCache(key) {
        const entry = this._cache.get(key);
        if (entry && (Date.now() - entry.time < this._cacheTTL)) {
            return entry.data;
        }
        this._cache.delete(key);
        return null;
    }
    
    // 캐시 저장
    _setCache(key, data) {
        this._cache.set(key, { data, time: Date.now() });
    }
    
    // 캐시 무효화 (점검 완료 후 호출)
    clearCache() {
        this._cache.clear();
    }
    
    // 응답 데이터에서 현재 시트 데이터만 남기는 헬퍼
    filterByCurrentSheet(data) {
        if (!Array.isArray(data)) return [];
        const sheetName = currentSheetName || '1-A';
        console.log(`[filterByCurrentSheet] 필터링 시작 - 현재 시트명: ${sheetName}, 입력 데이터: ${data.length}개`);
        
        const withSheet = [];
        const withoutSheet = [];
        
        data.forEach(se => {
            const sn = se?.sheetName || se?.sheet || se?.tab || se?.sheet_tab || se?.sheetname;
            if (sn) {
                withSheet.push(se);
            } else {
                withoutSheet.push(se);
            }
        });
        
        console.log(`[filterByCurrentSheet] 시트명이 있는 데이터: ${withSheet.length}개, 시트명이 없는 데이터: ${withoutSheet.length}개`);
        
        const filteredWithSheet = withSheet.filter(se => {
            const sn = se?.sheetName || se?.sheet || se?.tab || se?.sheet_tab || se?.sheetname;
            return sn === sheetName;
        });
        
        console.log(`[filterByCurrentSheet] 현재 시트와 일치하는 데이터: ${filteredWithSheet.length}개`);
        
        let result;
        if (sheetName === '1-A') {
            result = [...filteredWithSheet, ...withoutSheet];
            console.log(`[filterByCurrentSheet] 1-A: 시트명 없는 데이터도 허용, 최종 결과: ${result.length}개`);
        } else {
            result = filteredWithSheet;
            if (withoutSheet.length > 0) {
                console.warn(`[filterByCurrentSheet] ${sheetName}: 시트명 없는 데이터 ${withoutSheet.length}개 제외`);
            }
            console.log(`[filterByCurrentSheet] ${sheetName}: 시트명 있는 데이터만 허용, 최종 결과: ${result.length}개`);
        }
        
        if (result.length === 0 && data.length > 0) {
            const responseSheetNames = [...new Set(data.map(se => {
                const sn = se?.sheetName || se?.sheet || se?.tab || se?.sheet_tab || se?.sheetname;
                return sn || '(시트명 없음)';
            }))];
            console.error(`[filterByCurrentSheet] ❌ 필터링 후 데이터가 없습니다!`);
            console.error(`[filterByCurrentSheet] 요청한 시트: ${sheetName}, 응답 데이터의 시트명: ${responseSheetNames.join(', ')}`);
        }
        
        return result;
    }
    
    init() {
        let webAppUrl = localStorage.getItem('google_webapp_url');
        
        if (!webAppUrl && DEFAULT_WEB_APP_URL) {
            webAppUrl = DEFAULT_WEB_APP_URL;
            console.log('📋 기본 웹앱 URL 사용:', webAppUrl);
            localStorage.setItem('google_webapp_url', webAppUrl);
        }
        
        if (!webAppUrl && window.EGCHEM_CONFIG && window.EGCHEM_CONFIG.defaultWebAppUrl) {
            webAppUrl = window.EGCHEM_CONFIG.defaultWebAppUrl;
            console.log('📋 설정 파일에서 웹앱 URL 사용:', webAppUrl);
            localStorage.setItem('google_webapp_url', webAppUrl);
        }
        
        if (webAppUrl) {
            this.webAppUrl = webAppUrl;
            const urlInput = document.getElementById('webapp-url');
            if (urlInput) {
                urlInput.value = webAppUrl;
            }
            this.updateConnectionStatus(true);
            console.log('✅ 구글 시트 연결됨:', webAppUrl);
        } else {
            console.log('⚠️ 구글 시트 연결이 설정되지 않았습니다.');
            this.updateConnectionStatus(false);
        }
    }
    
    setWebAppUrl(url) {
        this.webAppUrl = url;
    }
    
    /**
     * JSONP 요청.
     *
     * ★ 조회는 실패하면 한 번 더 보낸다. 구글이 늦게 깨어나는 때가 있는데,
     *   그때마다 작업자가 「안 돼요」 하고 부르면 안 되기 때문이다.
     * ★ 저장은 절대 다시 보내지 않는다. 첫 번째가 실은 저장됐는데 화면만 실패로
     *   보였을 수 있고, 그러면 같은 기록이 두 번 들어간다.
     *   저장은 실패했다고 알려 주고 사람이 판단하게 한다.
     */
    _jsonpRequest(params, timeoutMs = TIMEOUT_READ) {
        const isWrite = (timeoutMs === TIMEOUT_WRITE);
        return this._jsonpOnce(params, timeoutMs).catch(err => {
            if (isWrite) throw err;
            console.warn(`⏳ 응답이 늦어 한 번 더 보냅니다: ${err.message}`);
            return this._jsonpOnce(params, timeoutMs);
        });
    }

    _jsonpOnce(params, timeoutMs = TIMEOUT_READ) {
        return new Promise((resolve, reject) => {
            const callbackName = `callback_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            let timeout;
            
            window[callbackName] = (result) => {
                clearTimeout(timeout);
                if (script.parentNode) document.head.removeChild(script);
                delete window[callbackName];
                resolve(result);
            };
            
            const script = document.createElement('script');
            params.set('callback', callbackName);
            script.src = `${this.webAppUrl}?${params.toString()}`;
            
            timeout = setTimeout(() => {
                if (script.parentNode) document.head.removeChild(script);
                delete window[callbackName];
                reject(new Error(`요청 타임아웃 (${timeoutMs / 1000}초)`));
            }, timeoutMs);
            
            script.onerror = () => {
                clearTimeout(timeout);
                if (script.parentNode) document.head.removeChild(script);
                delete window[callbackName];
                reject(new Error('웹앱 URL을 확인해주세요.'));
            };
            
            document.head.appendChild(script);
        });
    }
    
    async testConnection() {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        
        const params = new URLSearchParams({ action: 'testConnection' });
        const result = await this._jsonpRequest(params, TIMEOUT_READ);
        
        if (result && result.success) {
            this.isConnected = true;
            return true;
        }
        throw new Error(result?.error || '연결 실패');
    }
    
    async addInspectionData(inspectionData) {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        
        const sheetName = currentSheetName || "1-A";
        console.log(`[addInspectionData] 점검 데이터 저장 시작 - 시트: ${sheetName}, 장비: ${inspectionData.equipment}`);
        
        const rowData = this.formatInspectionDataForSheet(inspectionData);
        
        const params = new URLSearchParams({
            action: 'addInspectionData',
            sheetName: sheetName,
            sheet: sheetName,
            data: JSON.stringify(rowData[0])
        });

        const result = await this._jsonpRequest(params, TIMEOUT_WRITE);
        
        if (result && result.success) {
            console.log(`[addInspectionData] ✅ 성공: ${sheetName} 시트에 데이터 저장 완료`);
            this.clearCache(); // 점검 완료 후 캐시 무효화
            return true;
        }
        throw new Error(result?.error || '데이터 저장 실패');
    }
    
    formatInspectionDataForSheet(inspectionData) {
        const dateStr = todayKST();
        const inspectionType = inspectionData.type || '일일점검';
        const equipmentName = inspectionData.equipment;
        
        let checkContent = '';
        if (inspectionData.inspections && Array.isArray(inspectionData.inspections)) {
            checkContent = inspectionData.inspections.map(item => 
                typeof item === 'object' ? `${item.item}: ${item.result}` : item
            ).join(', ');
        } else if (inspectionData.inspections) {
            checkContent = String(inspectionData.inspections);
        }
        
        const notes = inspectionData.notes || '';
        
        return [[
            dateStr,           // A: 날짜
            inspectionType,    // B: 점검 유형
            equipmentName,     // C: 장비명
            '',                // D: 설치위치
            '',                // E: 점검자
            checkContent,      // F: 점검내용
            notes              // G: 특이사항
        ]];
    }
    
    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connection-status');
        const modalStatusElement = document.getElementById('modal-connection-status');
        const headerStatusText = document.getElementById('header-status-text');
        const headerStatusDot = document.getElementById('header-status-dot');
        const footerStatusText = document.getElementById('footer-status-text');
        const footerStatusDot = document.getElementById('footer-status-dot');
        
        if (connected) {
            if (statusElement) { statusElement.textContent = '✅ 연결됨'; statusElement.className = 'status-indicator connected'; }
            if (modalStatusElement) { modalStatusElement.textContent = '연결됨'; modalStatusElement.className = 'status-indicator connected'; }
            if (headerStatusText) headerStatusText.textContent = 'Connected';
            if (headerStatusDot) headerStatusDot.style.backgroundColor = '#4CAF50';
            if (footerStatusText) footerStatusText.textContent = 'Connected';
            if (footerStatusDot) footerStatusDot.style.backgroundColor = '#4CAF50';
        } else {
            if (statusElement) { statusElement.textContent = '❌ 연결 안됨'; statusElement.className = 'status-indicator disconnected'; }
            if (modalStatusElement) { modalStatusElement.textContent = '연결 안됨'; modalStatusElement.className = 'status-indicator disconnected'; }
            if (headerStatusText) headerStatusText.textContent = 'Disconnected';
            if (headerStatusDot) headerStatusDot.style.backgroundColor = '#f44336';
            if (footerStatusText) footerStatusText.textContent = 'Disconnected';
            if (footerStatusDot) footerStatusDot.style.backgroundColor = '#f44336';
        }
    }
    
    // 장비 목록 가져오기 (구글 시트에서)
    // explicitSheet: 명시적으로 시트명 지정 (전역 currentSheetName 대신 사용, 병렬 호출 안전)
    async getEquipmentFromSheet(type, explicitSheet) {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        
        const sheetName = explicitSheet || currentSheetName || '1-A';
        
        // 캐시 확인
        const cacheKey = `equip_${sheetName}_${type}`;
        const cached = this._getCache(cacheKey);
        if (cached) {
            console.log(`[getEquipmentFromSheet] 캐시 히트: ${sheetName}/${type} (${cached.length}개)`);
            return cached;
        }
        
        console.log(`[getEquipmentFromSheet] API 호출: ${sheetName}/${type}`);

        const params = new URLSearchParams({
            action: 'getEquipment',
            type: type,
            sheetName: sheetName,
            sheet: sheetName
        });

        // ⚠️ 예전에는 6초였습니다. 그런데 이 요청 하나가
        //    대시보드 완료율 / 장비 상태 / 팀 카드 / 종합 현황을 전부 결정합니다.
        //    Apps Script는 한동안 안 쓰다가 부르면 콜드 스타트로 5~15초가 걸리고,
        //    현장 통신이 느린 휴대폰은 여기서 매번 타임아웃이 났습니다.
        //    → 저장(쓰기)은 성공하는데 화면만 계속 '미점검 / 0%'로 남는 증상.
        //    빠른 회선에서는 1~2초에 끝나므로 이 값을 올려도 체감 속도는 그대로입니다.
        const result = await this._jsonpRequest(params, TIMEOUT_READ);
        
        if (result && result.success) {
            let rawData = result.data || [];
            
            // 장비 이름 기반 필터링 (잘못된 시트 데이터 방지)
            rawData = this._filterEquipmentBySheet(rawData, sheetName);
            
            // 시트명이 없는 데이터에 현재 시트명 추가
            rawData = rawData.map(se => {
                const existingSheetName = se?.sheetName || se?.sheet || se?.tab || se?.sheet_tab || se?.sheetname;
                if (!existingSheetName) {
                    return { ...se, sheetName: sheetName, sheet: sheetName };
                }
                return se;
            });
            
            const filtered = this._filterBySheet(rawData, sheetName);
            
            // 캐시 저장
            this._setCache(cacheKey, filtered);
            console.log(`✅ getEquipment 성공: ${filtered.length}개 장비 (시트: ${sheetName})`);
            return filtered;
        }
        throw new Error(result?.error || '데이터 가져오기 실패');
    }
    
    // 명시적 시트명으로 필터링 (filterByCurrentSheet의 전역 상태 무의존 버전)
    _filterBySheet(data, sheetName) {
        if (!Array.isArray(data)) return [];
        
        const withSheet = [];
        const withoutSheet = [];
        
        data.forEach(se => {
            const sn = se?.sheetName || se?.sheet || se?.tab || se?.sheet_tab || se?.sheetname;
            sn ? withSheet.push(se) : withoutSheet.push(se);
        });
        
        const filteredWithSheet = withSheet.filter(se => {
            const sn = se?.sheetName || se?.sheet || se?.tab || se?.sheet_tab || se?.sheetname;
            return sn === sheetName;
        });
        
        if (sheetName === '1-A') {
            return [...filteredWithSheet, ...withoutSheet];
        }
        return filteredWithSheet;
    }
    
    // 장비 이름 기반 시트 필터링 (백엔드 오류 방지)
    _filterEquipmentBySheet(rawData, sheetName) {
        const hardcoded = {
            A: ['스크러바', '자동 배기장치', '합성 반응기', '정제 반응기', 'Feeding Tank', '정제수 제조설비', '냉각수 시스템', '온수 시스템', '압축공기 시스템', '상활실 및 전기', '방화셔터', '승강기', '지게차'],
            B: ['Oven', '긴급배기장치', '퓨리파이시스템'],
            C: ['초음파 세척기', '자동 세정설비', '자동 충진설비', '자동 퍼지설비', '클린오븐', '제품 출하 차량'],
            D: ['GC', 'NMR', 'ICP', 'IC', 'KF', '점도계', 'APHA'],
            E: ['맨틀', '교반기', '칠러']
        };
        
        const responseNames = rawData.map(se => se.name).filter(Boolean);
        const sheetKey = sheetName.replace('1-', '');
        const ownEquipment = hardcoded[sheetKey] || [];
        const otherEquipment = Object.entries(hardcoded)
            .filter(([k]) => k !== sheetKey)
            .flatMap(([, v]) => v);
        
        const hasOwnData = responseNames.some(name => ownEquipment.includes(name));
        const hasOtherData = responseNames.some(name => otherEquipment.includes(name) && !ownEquipment.includes(name));
        
        if (hasOtherData && !hasOwnData) {
            console.warn(`[_filterEquipmentBySheet] 잘못된 시트 데이터 감지, 필터링 적용`);
            return rawData.filter(se => !otherEquipment.includes(se.name));
        }
        
        return rawData;
    }
    
    // 장비 추가 (구글 시트에)
    async addEquipmentToSheet(type, equipmentName) {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        const sheetName = currentSheetName || '1-A';
        const params = new URLSearchParams({ action: 'addEquipment', type, sheetName, sheet: sheetName, name: equipmentName });
        const result = await this._jsonpRequest(params, TIMEOUT_READ);
        if (result && result.success) return true;
        throw new Error(result?.error || '장비 추가 실패');
    }
    
    // 장비 삭제 (구글 시트에서)
    async deleteEquipmentFromSheet(type, equipmentName) {
        const sheetName = currentSheetName || '1-A';
        const params = new URLSearchParams({ action: 'deleteEquipment', type, sheetName, sheet: sheetName, name: equipmentName });
        const result = await this._jsonpRequest(params, TIMEOUT_READ);
        if (result && result.success) return true;
        throw new Error(result?.error || '장비 삭제 실패');
    }
    
    // 점검 항목 가져오기
    async getInspectionItemsFromSheet(type) {
        const params = new URLSearchParams({ action: 'getInspectionItems', type });
        const result = await this._jsonpRequest(params, TIMEOUT_READ);
        if (result && result.success) return result.data || [];
        throw new Error(result?.error || '데이터 가져오기 실패');
    }
    
    // 점검 항목 추가
    async addInspectionItemToSheet(type, itemName) {
        const params = new URLSearchParams({ action: 'addInspectionItem', type, itemName });
        const result = await this._jsonpRequest(params, TIMEOUT_READ);
        if (result && result.success) return true;
        throw new Error(result?.error || '점검 항목 추가 실패');
    }
    
    // 점검 항목 삭제
    async deleteInspectionItemFromSheet(type, itemName) {
        const params = new URLSearchParams({ action: 'deleteInspectionItem', type, itemName });
        const result = await this._jsonpRequest(params, TIMEOUT_READ);
        if (result && result.success) return true;
        throw new Error(result?.error || '점검 항목 삭제 실패');
    }
    
    // 마지막 점검 날짜 업데이트
    async updateLastInspectionDate(type, equipmentName) {
        const params = new URLSearchParams({ action: 'updateLastInspectionDate', type, name: equipmentName });
        const result = await this._jsonpRequest(params, TIMEOUT_READ);
        if (result && result.success) return true;
        throw new Error(result?.error || '점검 날짜 업데이트 실패');
    }
    
    // 마지막 점검 날짜 조회
    async getLastInspectionDate(type, equipmentName) {
        if (!this.webAppUrl) return null;
        try {
            const params = new URLSearchParams({ action: 'getLastInspectionDate', type, name: equipmentName });
            const result = await this._jsonpRequest(params, TIMEOUT_READ);
            return (result && result.success && result.date) ? result.date : null;
        } catch {
            return null;
        }
    }
    
    // ⚠️ 사용하지 않습니다. 백엔드(Code.gs)의 addRepairRecord는 아무 동작도 하지 않는
    //    빈 함수이며 항상 { success: true }만 돌려줍니다.
    //    수리 이력은 getRepairRecords()가 팀 시트의 점검 기록에서 '수리 진행'을 찾아
    //    그때그때 만들어내므로, 점검 데이터만 저장하면 자동으로 반영됩니다.
    //    호출하면 아무 효과 없이 왕복 시간만 늘어납니다. (2026-08 확인)
    async addRepairRecord(record) {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        const params = new URLSearchParams({
            action: 'addRepairRecord',
            date: record.date,
            sheet: record.sheet,
            sheetName: record.sheet,
            type: record.type,
            equipment: record.equipment,
            cost: String(record.cost || 0),
            notes: record.notes || ''
        });
        const result = await this._jsonpRequest(params, TIMEOUT_READ);
        if (result && result.success) {
            this._cache.delete('repair_records_all');
            return true;
        }
        throw new Error(result?.error || '수리 기록 저장 실패');
    }
    
    async getRepairRecords() {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        
        const cacheKey = 'repair_records_all';
        const cached = this._getCache(cacheKey);
        if (cached) return cached;
        
        const params = new URLSearchParams({ action: 'getRepairRecords' });
        const result = await this._jsonpRequest(params, TIMEOUT_READ);
        if (result && result.success) {
            const data = result.data || [];
            this._setCache(cacheKey, data);
            return data;
        }
        throw new Error(result?.error || '수리 기록 가져오기 실패');
    }

    /* ----------------------------------------
       레시피 — 공정 입력용 (2026-08-27 추가)
       백엔드 Code.gs의 getRecipeProducts / getRecipe 를 부른다.
       레시피는 자주 바뀌지 않으므로 캐시가 특히 잘 듣는다.
       ---------------------------------------- */

    // 제품 목록과 각 제품이 가진 공정(합성·정제)
    async getRecipeProducts() {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');

        const cacheKey = 'recipe_products';
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        const params = new URLSearchParams({ action: 'getRecipeProducts' });
        const result = await this._jsonpRequest(params, TIMEOUT_READ);
        if (result && result.success) {
            const data = result.data || [];
            this._setCache(cacheKey, data);
            console.log(`✅ 레시피 제품 ${data.length}종`);
            return data;
        }
        throw new Error(result?.error || '제품 목록 가져오기 실패');
    }

    // 한 제품·공정의 단계 목록
    async getRecipe(product, process) {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        if (!product || !process) throw new Error('제품과 공정을 모두 골라야 합니다.');

        const cacheKey = `recipe_${product}_${process}`;
        const cached = this._getCache(cacheKey);
        if (cached) return cached;

        const params = new URLSearchParams({ action: 'getRecipe', product, process });
        const result = await this._jsonpRequest(params, TIMEOUT_READ);
        if (result && result.success) {
            const data = result.data || [];
            this._setCache(cacheKey, data);
            console.log(`✅ 레시피 ${product}/${process} ${data.length}단계`);
            return data;
        }
        throw new Error(result?.error || '레시피 가져오기 실패');
    }

    // 시트에서 레시피를 고친 뒤 화면에 바로 반영하고 싶을 때
    clearRecipeCache() {
        for (const key of [...this._cache.keys()]) {
            if (key.startsWith('recipe_')) this._cache.delete(key);
        }
    }

    /* ----------------------------------------
       Lot 등록 (2026-08-28 추가)
       ---------------------------------------- */

    // 그 달의 다음 회차. codePrefix 예: 'DPS526-08', letter 예: 'A'
    // 캐시하지 않는다 — 등록하는 사이에 다른 사람이 먼저 등록했을 수 있다.
    async getNextLotSeq(product, codePrefix, letter) {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        const params = new URLSearchParams({ action: 'getNextLotSeq', product, codePrefix, letter });
        const result = await this._jsonpRequest(params, TIMEOUT_READ);
        if (result && result.success) return Number(result.data) || 1;
        throw new Error(result?.error || '회차를 가져오지 못했습니다');
    }

    async registerLot(product, process, lotNo, reactor) {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        const params = new URLSearchParams({
            action: 'registerLot', product, process, lotNo, reactor
        });
        const result = await this._jsonpRequest(params, TIMEOUT_WRITE);
        if (result && result.success) {
            console.log(`✅ Lot 등록: ${lotNo} / ${process}`);
            return result.data;
        }
        throw new Error(result?.error || 'Lot 등록 실패');
    }

    /* ----------------------------------------
       공정 진행 (2026-08-28 추가)
       ---------------------------------------- */

    // 아직 안 끝난 Lot들과 진행 상태
    async getLots(product) {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        const params = new URLSearchParams({ action: 'getLots', product });
        const result = await this._jsonpRequest(params, TIMEOUT_READ);
        if (result && result.success) return result.data || [];
        throw new Error(result?.error || 'Lot 목록을 가져오지 못했습니다');
    }

    // 단계 하나의 동작(시작·종료·대기)을 기록한다.
    // payload는 객체로 받아 여기서 JSON으로 만든다 — 부르는 쪽이 편하도록.
    async logStep(product, lotNo, process, reactor, payload) {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        const params = new URLSearchParams({
            action: 'logStep', product, lotNo, process,
            reactor: reactor || '', payload: JSON.stringify(payload || {})
        });
        const result = await this._jsonpRequest(params, TIMEOUT_WRITE);
        if (result && result.success) {
            console.log(`✅ ${lotNo} ${payload?.step || ''} ${payload?.event || ''}`);
            return result.data;
        }
        throw new Error(result?.error || '기록하지 못했습니다');
    }

    async completeProcess(product, lotNo, process, reactor, mode, note) {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        const params = new URLSearchParams({
            action: 'completeProcess', product, lotNo, process,
            reactor: reactor || '', mode: mode || '정상완료', note: note || ''
        });
        const result = await this._jsonpRequest(params, TIMEOUT_WRITE);
        if (result && result.success) return result.data;
        throw new Error(result?.error || '완료 처리를 하지 못했습니다');
    }

    async nextLot(product, fromLot, fromProcess, nextProcess, nextLotNo, nextReactor) {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        const params = new URLSearchParams({
            action: 'nextLot', product, fromLot, fromProcess,
            nextProcess, nextLotNo, nextReactor
        });
        const result = await this._jsonpRequest(params, TIMEOUT_WRITE);
        if (result && result.success) return result.data;
        throw new Error(result?.error || '다음 Lot을 만들지 못했습니다');
    }

    // DIPAS 농축 — 총 무게를 Lot 수로 나눠 적는다
    async concentrateGroup(product, process, stepNo, step, lots, total, unit, note) {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        const params = new URLSearchParams({
            action: 'concentrateGroup', product, process,
            stepNo: String(stepNo || ''), step: step || '농축',
            lots: JSON.stringify(lots || []),
            total: String(total), unit: unit || 'kg', note: note || ''
        });
        const result = await this._jsonpRequest(params, TIMEOUT_WRITE);
        if (result && result.success) return result.data;
        throw new Error(result?.error || '농축 기록을 하지 못했습니다');
    }

    // 두 사람이 같은 Lot을 만지지 않게 잠깐 표시해 둔다(10분).
    async claimLot(product, lotNo, process, who) {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        const params = new URLSearchParams({ action: 'claimLot', product, lotNo, process, who });
        const result = await this._jsonpRequest(params, TIMEOUT_READ);
        if (result && result.success) return result.data;
        throw new Error(result?.error || '확인하지 못했습니다');
    }

    async releaseLot(product, lotNo, process, who) {
        if (!this.webAppUrl) return;
        const params = new URLSearchParams({ action: 'releaseLot', product, lotNo, process, who });
        // 푸는 데 실패해도 시간이 지나면 저절로 풀리므로 조용히 넘어간다.
        try { await this._jsonpRequest(params, TIMEOUT_READ); } catch (e) { /* 무시 */ }
    }

    /* ---------- 되돌리기 ---------- */

    // 무엇이 되돌아가는지 미리 물어본다. 시트는 안 건드린다.
    async getUndoInfo(product, lotNo, process) {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        const params = new URLSearchParams({ action: 'getUndoInfo', product, lotNo, process });
        const result = await this._jsonpRequest(params, TIMEOUT_READ);
        if (result && result.success) return result.data;
        throw new Error(result?.error || '확인하지 못했습니다');
    }

    async undoLastStep(product, lotNo, process, who) {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        const params = new URLSearchParams({ action: 'undoLastStep', product, lotNo, process, who });
        const result = await this._jsonpRequest(params, TIMEOUT_WRITE);
        if (result && result.success) {
            console.log(`↩ 되돌림: ${lotNo} ${result.data?.step || ''} ${result.data?.event || ''}`);
            return result.data;
        }
        throw new Error(result?.error || '되돌리지 못했습니다');
    }

    /**
     * 창을 닫거나 앱을 나갈 때 잠금을 푼다.
     *
     * ★ 그 순간에는 보통의 요청이 끝까지 못 간다 — 브라우저가 페이지를 먼저 없앤다.
     *   sendBeacon은 페이지가 사라져도 끝까지 보내 준다.
     *   POST로 가지만 doPost가 doGet을 그대로 부르므로 서버 쪽은 같다.
     * ★ 이게 없으면 「휴대폰을 주머니에 넣었다」가 「10분 동안 아무도 못 연다」가 된다.
     */
    releaseLotBeacon(product, lotNo, process, who) {
        if (!this.webAppUrl || !navigator.sendBeacon) return false;
        const params = new URLSearchParams({ action: 'releaseLot', product, lotNo, process, who });
        try {
            return navigator.sendBeacon(`${this.webAppUrl}?${params.toString()}`);
        } catch (e) {
            return false;
        }
    }
}

// 전역 인스턴스 생성
const googleSheetsManager = new GoogleSheetsManager();
