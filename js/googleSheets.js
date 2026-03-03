/* ========================================
   구글 시트 연동 관리 (GoogleSheetsManager)
   - JSONP 방식으로 Google Apps Script 웹앱과 통신
   - 점검 데이터 저장, 장비 목록 조회, 점검 항목 관리
   ======================================== */

// 🔥 중요: 기본 웹앱 URL 설정
// Google Apps Script에서 배포한 웹앱 URL을 여기에 입력하세요.
// 이 URL은 모든 기기(모바일, PC)에서 동일하게 사용됩니다.
// 형식: https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
const DEFAULT_WEB_APP_URL = ''; // 여기에 웹앱 URL을 입력하세요

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
    
    // JSONP 요청 헬퍼
    _jsonpRequest(params, timeoutMs = 10000) {
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
        const result = await this._jsonpRequest(params, 10000);
        
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
        
        const result = await this._jsonpRequest(params, 10000);
        
        if (result && result.success) {
            console.log(`[addInspectionData] ✅ 성공: ${sheetName} 시트에 데이터 저장 완료`);
            this.clearCache(); // 점검 완료 후 캐시 무효화
            return true;
        }
        throw new Error(result?.error || '데이터 저장 실패');
    }
    
    formatInspectionDataForSheet(inspectionData) {
        const now = new Date();
        const koreanTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
        const dateStr = koreanTime.toISOString().split('T')[0];
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
        
        const result = await this._jsonpRequest(params, 6000);
        
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
            A: ['스크러바', '자동 배기장치', '합성 반응기', '정제 반응기', 'Feeding Tank', '정제수 제조설비', '냉각수 시스템', '온수 시스템', '압축공기 시스템', '상활실 및 전기', '방화셔터', '승강기'],
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
        const result = await this._jsonpRequest(params, 10000);
        if (result && result.success) return true;
        throw new Error(result?.error || '장비 추가 실패');
    }
    
    // 장비 삭제 (구글 시트에서)
    async deleteEquipmentFromSheet(type, equipmentName) {
        const sheetName = currentSheetName || '1-A';
        const params = new URLSearchParams({ action: 'deleteEquipment', type, sheetName, sheet: sheetName, name: equipmentName });
        const result = await this._jsonpRequest(params, 10000);
        if (result && result.success) return true;
        throw new Error(result?.error || '장비 삭제 실패');
    }
    
    // 점검 항목 가져오기
    async getInspectionItemsFromSheet(type) {
        const params = new URLSearchParams({ action: 'getInspectionItems', type });
        const result = await this._jsonpRequest(params, 10000);
        if (result && result.success) return result.data || [];
        throw new Error(result?.error || '데이터 가져오기 실패');
    }
    
    // 점검 항목 추가
    async addInspectionItemToSheet(type, itemName) {
        const params = new URLSearchParams({ action: 'addInspectionItem', type, itemName });
        const result = await this._jsonpRequest(params, 10000);
        if (result && result.success) return true;
        throw new Error(result?.error || '점검 항목 추가 실패');
    }
    
    // 점검 항목 삭제
    async deleteInspectionItemFromSheet(type, itemName) {
        const params = new URLSearchParams({ action: 'deleteInspectionItem', type, itemName });
        const result = await this._jsonpRequest(params, 10000);
        if (result && result.success) return true;
        throw new Error(result?.error || '점검 항목 삭제 실패');
    }
    
    // 마지막 점검 날짜 업데이트
    async updateLastInspectionDate(type, equipmentName) {
        const params = new URLSearchParams({ action: 'updateLastInspectionDate', type, name: equipmentName });
        const result = await this._jsonpRequest(params, 10000);
        if (result && result.success) return true;
        throw new Error(result?.error || '점검 날짜 업데이트 실패');
    }
    
    // 마지막 점검 날짜 조회
    async getLastInspectionDate(type, equipmentName) {
        if (!this.webAppUrl) return null;
        try {
            const params = new URLSearchParams({ action: 'getLastInspectionDate', type, name: equipmentName });
            const result = await this._jsonpRequest(params, 10000);
            return (result && result.success && result.date) ? result.date : null;
        } catch {
            return null;
        }
    }
    
    async addRepairRecord(record) {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        const params = new URLSearchParams({
            action: 'addRepairRecord',
            date: record.date,
            sheet: record.sheet,
            type: record.type,
            equipment: record.equipment,
            notes: record.notes || ''
        });
        const result = await this._jsonpRequest(params, 10000);
        if (result && result.success) return true;
        throw new Error(result?.error || '수리 기록 저장 실패');
    }
    
    async getRepairRecords() {
        if (!this.webAppUrl) throw new Error('웹앱 URL이 설정되지 않았습니다.');
        
        const cacheKey = 'repair_records_all';
        const cached = this._getCache(cacheKey);
        if (cached) return cached;
        
        const params = new URLSearchParams({ action: 'getRepairRecords' });
        const result = await this._jsonpRequest(params, 10000);
        if (result && result.success) {
            const data = result.data || [];
            this._setCache(cacheKey, data);
            return data;
        }
        throw new Error(result?.error || '수리 기록 가져오기 실패');
    }
}

// 전역 인스턴스 생성
const googleSheetsManager = new GoogleSheetsManager();
