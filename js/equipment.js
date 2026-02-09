/* ========================================
   점검 항목 관리 (InspectionItemsManager)
   - 하드코딩된 점검 항목 관리
   ======================================== */

class InspectionItemsManager {
    constructor() {
        this.maxItems = 50;
        this.inspectionItems = this.loadInspectionItems();
    }
    
    loadInspectionItems() {
        // ⚠️ 점검 항목 목록은 하드코딩되어 있습니다!
        // 수정하려면 아래 목록을 변경한 후 배포하세요.
        const defaultItems = ['일반점검', '정기점검', '외관확인', '소음확인'];
        return {
            '일일점검': defaultItems,
            '주간점검': defaultItems,
            '월간점검': defaultItems,
            '분기점검': defaultItems,
            '반기점검': defaultItems,
            '연간점검': defaultItems
        };
    }
    
    saveInspectionItems() {
        localStorage.setItem('inspection_items', JSON.stringify(this.inspectionItems));
    }
    
    addInspectionItem(type, itemName) {
        if (!this.inspectionItems[type]) this.inspectionItems[type] = [];
        if (this.inspectionItems[type].length >= this.maxItems) throw new Error(`최대 ${this.maxItems}개까지만 추가할 수 있습니다.`);
        if (this.inspectionItems[type].includes(itemName)) throw new Error('이미 존재하는 점검 항목입니다.');
        this.inspectionItems[type].push(itemName);
        this.saveInspectionItems();
        return true;
    }
    
    deleteInspectionItem(type, itemName) {
        if (!this.inspectionItems[type]) throw new Error('해당 점검 유형을 찾을 수 없습니다.');
        const index = this.inspectionItems[type].indexOf(itemName);
        if (index === -1) throw new Error('해당 점검 항목을 찾을 수 없습니다.');
        this.inspectionItems[type].splice(index, 1);
        this.saveInspectionItems();
        return true;
    }
    
    getInspectionItems(type) {
        return this.inspectionItems[type] || [];
    }
}

const inspectionItemsManager = new InspectionItemsManager();


/* ========================================
   점검 완료 시점 관리 (InspectionTimeManager)
   - 점검 이력 저장 및 알람 상태 계산
   ======================================== */

class InspectionTimeManager {
    constructor() {
        this.inspectionTimes = this.loadInspectionTimes();
    }
    
    buildKey(type, equipmentName, sheetName = currentSheetName || '1-A') {
        return `${sheetName}_${type}_${equipmentName}`;
    }
    
    loadInspectionTimes() {
        const saved = localStorage.getItem('inspection_times');
        return saved ? JSON.parse(saved) : {};
    }
    
    saveInspectionTimes() {
        localStorage.setItem('inspection_times', JSON.stringify(this.inspectionTimes));
    }
    
    recordInspection(type, equipmentName, sheetName = currentSheetName || '1-A') {
        const now = new Date();
        const key = this.buildKey(type, equipmentName, sheetName);
        this.inspectionTimes[key] = {
            lastInspection: now.toISOString(),
            type: type,
            equipment: equipmentName,
            sheet: sheetName
        };
        this.saveInspectionTimes();
        console.log(`점검 완료 기록: ${sheetName} / ${type} - ${equipmentName} (${now.toLocaleString()})`);
    }
    
    getLastInspectionTime(type, equipmentName, sheetName = currentSheetName || '1-A') {
        const key = this.buildKey(type, equipmentName, sheetName);
        return this.inspectionTimes[key]?.lastInspection || null;
    }
    
    calculateAlarmStatus(type, equipmentName, sheetName = currentSheetName || '1-A') {
        const lastInspection = this.getLastInspectionTime(type, equipmentName, sheetName);
        if (!lastInspection) return 'unknown';
        
        const lastDate = new Date(lastInspection);
        const now = new Date();
        const daysDiff = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
        
        const cycles = { '일일점검': 1, '주간점검': 7, '월간점검': 30, '분기점검': 90, '반기점검': 180, '연간점검': 365 };
        const cycle = cycles[type] || 7;
        const warningThreshold = cycle - 3;
        
        if (cycle === 1) return 'normal';
        if (daysDiff >= cycle) return 'alarm';
        if (daysDiff >= warningThreshold) return 'warning';
        return 'normal';
    }
    
    // 날짜 문자열로 알람 상태 계산 (구글 시트용)
    calculateAlarmStatusFromDate(type, dateString) {
        if (!dateString) return 'unknown';
        
        try {
            let lastDate;
            if (typeof dateString === 'string') {
                const dateParts = dateString.trim().split('-');
                if (dateParts.length === 3) {
                    lastDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
                } else {
                    lastDate = new Date(dateString);
                }
            } else if (dateString instanceof Date) {
                lastDate = dateString;
            } else {
                return 'unknown';
            }
            
            if (isNaN(lastDate.getTime())) return 'unknown';
            
            const now = new Date();
            const koreanTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
            const today = new Date(koreanTime.getFullYear(), koreanTime.getMonth(), koreanTime.getDate());
            const lastInspectionDate = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
            const daysDiff = Math.floor((today - lastInspectionDate) / (1000 * 60 * 60 * 24));
            
            const cycles = { '일일점검': 1, '주간점검': 7, '월간점검': 30, '분기점검': 90, '반기점검': 180, '연간점검': 365 };
            const cycle = cycles[type] || 7;
            const warningThreshold = cycle - 3;
            
            if (daysDiff < 0) return 'normal';
            
            if (cycle === 1) {
                return daysDiff === 0 ? 'normal' : 'alarm';
            }
            
            if (daysDiff === 0) return 'normal';
            if (daysDiff >= cycle) return 'alarm';
            if (daysDiff >= warningThreshold) return 'warning';
            return 'normal';
        } catch (error) {
            console.error('알람 상태 계산 오류:', error, '날짜:', dateString);
            return 'unknown';
        }
    }
    
    getAlarmStatusText(status) {
        const statusMap = { 'normal': '정상', 'warning': '점검예정', 'alarm': '점검필요', 'unknown': '미점검' };
        return statusMap[status] || '알 수 없음';
    }
}

const inspectionTimeManager = new InspectionTimeManager();


/* ========================================
   장비 관리 (EquipmentManager)
   - 팀(시트)별 하드코딩된 장비 목록 관리
   ======================================== */

class EquipmentManager {
    constructor() {
        this.maxEquipment = 100;
        this.equipmentData = this.loadEquipmentData();
    }
    
    loadEquipmentData() {
        // ⚠️ 장비 목록은 하드코딩되어 있습니다!
        // 수정하려면 아래 목록을 변경한 후 배포하세요.
        const currentSheet = currentSheetName || '1-A';
        
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
        
        const equipmentCategories = (equipmentBySheet[currentSheet] || equipmentBySheet['1-A'])
            .map(eq => ({ ...eq, status: 'normal', statusText: '정상' }));
        
        console.log(`[loadEquipmentData] 시트: ${currentSheet}, 장비: ${equipmentCategories.length}개`);
        
        return {
            '일일점검': equipmentCategories,
            '주간점검': equipmentCategories,
            '월간점검': equipmentCategories,
            '분기점검': equipmentCategories,
            '반기점검': equipmentCategories,
            '연간점검': equipmentCategories
        };
    }
    
    saveEquipmentData() {
        localStorage.setItem('equipment_data_by_type', JSON.stringify(this.equipmentData));
    }
    
    addEquipment(type, name, status = 'normal') {
        if (!this.equipmentData[type]) this.equipmentData[type] = [];
        if (this.equipmentData[type].length >= this.maxEquipment) throw new Error(`최대 ${this.maxEquipment}개까지만 추가할 수 있습니다.`);
        if (this.equipmentData[type].some(eq => eq.name === name)) throw new Error('이미 존재하는 장비명입니다.');
        
        const newEquipment = { name, status, statusText: this.getStatusText(status) };
        this.equipmentData[type].push(newEquipment);
        this.saveEquipmentData();
        return newEquipment;
    }
    
    deleteEquipment(type, name) {
        if (!this.equipmentData[type]) throw new Error('해당 점검 유형을 찾을 수 없습니다.');
        const index = this.equipmentData[type].findIndex(eq => eq.name === name);
        if (index === -1) throw new Error('해당 장비를 찾을 수 없습니다.');
        this.equipmentData[type].splice(index, 1);
        this.saveEquipmentData();
        return true;
    }
    
    getEquipmentByType(type) {
        return this.equipmentData[type] || [];
    }
    
    getStatusText(status) {
        const statusMap = { 'normal': '정상', 'warning': '점검필요', 'alarm': '알람', 'maintenance': '정비중' };
        return statusMap[status] || '알 수 없음';
    }
}
