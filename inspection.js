// EGChem FACSYS 점검 시스템 - 점검 관련 유틸리티

class InspectionManager {
    constructor() {
        this.inspectionTypes = {
            '일일점검': {
                locations: ['3동', '10동', 'EMPTY', 'EMPTY'],
                inspection_items: ['오일교체', '누유점검', '모터점검', '외부수리'],
                warning_days: 1,
                alarm_days: 3,
                equipment_list: ['VP-001', 'VP-002']
            },
            '주간점검': {
                locations: ['정제실1', '정제실2', '정제실3', '정제실4'],
                inspection_items: ['전체점검', '정밀점검', '교체점검', '예방정비'],
                warning_days: 1,
                alarm_days: 7,
                equipment_list: ['VP-001', 'VP-002', 'VP-003', 'VP-004']
            },
            '월간점검': {
                locations: ['정제실1', '정제실2', '정제실3', '정제실4'],
                inspection_items: ['종합점검', '성능점검', '안전점검', '정기교체'],
                warning_days: 3,
                alarm_days: 30,
                equipment_list: ['VP-001', 'VP-002', 'VP-003']
            },
            '분기점검': {
                locations: ['정제실1', '정제실2', '정제실3', '정제실4'],
                inspection_items: ['전면점검', '부품교체', '성능측정', '안전확인'],
                warning_days: 3,
                alarm_days: 90,
                equipment_list: ['VP-001']
            },
            '반기점검': {
                locations: ['정제실1', '정제실2', '정제실3', '정제실4'],
                inspection_items: ['대점검', '주요부품교체', '성능개선', '안전강화'],
                warning_days: 7,
                alarm_days: 180,
                equipment_list: ['VP-001']
            },
            '연간점검': {
                locations: ['정제실1', '정제실2', '정제실3', '정제실4'],
                inspection_items: ['오버홀', '시설개선', '성능업그레이드', '안전시설점검'],
                warning_days: 7,
                alarm_days: 365,
                equipment_list: ['VP-001']
            }
        };
        
        this.equipmentStatus = {};
        this.loadEquipmentStatus();
    }
    
    // 장비 상태 로드
    async loadEquipmentStatus() {
        try {
            if (window.googleSheetsManager && window.googleSheetsManager.isConnected) {
                this.equipmentStatus = await window.googleSheetsManager.getEquipmentStatus();
            } else {
                // 오프라인 모드에서 기본 상태 설정
                this.setDefaultEquipmentStatus();
            }
        } catch (error) {
            console.error('장비 상태 로드 실패:', error);
            this.setDefaultEquipmentStatus();
        }
    }
    
    setDefaultEquipmentStatus() {
        // 기본 장비 상태 설정
        const allEquipment = [];
        Object.values(this.inspectionTypes).forEach(type => {
            allEquipment.push(...type.equipment_list);
        });
        
        // 중복 제거
        const uniqueEquipment = [...new Set(allEquipment)];
        
        uniqueEquipment.forEach(equipment => {
            this.equipmentStatus[equipment] = {
                name: equipment,
                status: 'normal',
                lastCheck: new Date().toISOString(),
                nextCheck: this.calculateNextCheckDate(equipment)
            };
        });
    }
    
    // 다음 점검일 계산
    calculateNextCheckDate(equipmentName) {
        const now = new Date();
        const nextCheck = new Date(now);
        
        // 장비별 점검 주기 설정 (임시)
        const checkIntervals = {
            'VP-001': 1, // 일일
            'VP-002': 7, // 주간
            'VP-003': 30, // 월간
            'VP-004': 90, // 분기
            'VP-005': 180, // 반기
            'VP-006': 365 // 연간
        };
        
        const interval = checkIntervals[equipmentName] || 30;
        nextCheck.setDate(now.getDate() + interval);
        
        return nextCheck.toISOString();
    }
    
    // 장비 상태 확인
    getEquipmentStatus(equipmentName) {
        const equipment = this.equipmentStatus[equipmentName];
        if (!equipment) {
            return { status: 'unknown', statusText: '알 수 없음' };
        }
        
        const now = new Date();
        const lastCheck = new Date(equipment.lastCheck);
        const nextCheck = new Date(equipment.nextCheck);
        
        const daysSinceLastCheck = Math.floor((now - lastCheck) / (1000 * 60 * 60 * 24));
        const daysUntilNextCheck = Math.floor((nextCheck - now) / (1000 * 60 * 60 * 24));
        
        if (daysUntilNextCheck <= 0) {
            return { status: 'alarm', statusText: '긴급 점검 필요' };
        } else if (daysUntilNextCheck <= 3) {
            return { status: 'warning', statusText: '점검 필요' };
        } else {
            return { status: 'normal', statusText: '정상' };
        }
    }
    
    // 점검 유형별 장비 목록 가져오기
    getEquipmentForType(inspectionType) {
        const typeConfig = this.inspectionTypes[inspectionType];
        if (!typeConfig) {
            return [];
        }
        
        return typeConfig.equipment_list.map(equipmentName => {
            const status = this.getEquipmentStatus(equipmentName);
            return {
                name: equipmentName,
                status: status.status,
                statusText: status.statusText
            };
        });
    }
    
    // 점검 유형별 점검 항목 가져오기
    getInspectionItemsForType(inspectionType) {
        const typeConfig = this.inspectionTypes[inspectionType];
        return typeConfig ? typeConfig.inspection_items : [];
    }
    
    // 점검 유형별 위치 목록 가져오기
    getLocationsForType(inspectionType) {
        const typeConfig = this.inspectionTypes[inspectionType];
        return typeConfig ? typeConfig.locations.filter(loc => loc !== 'EMPTY') : [];
    }
    
    // 점검 결과 유효성 검사
    validateInspectionData(data) {
        const errors = [];
        
        if (!data.type) {
            errors.push('점검 유형을 선택해주세요.');
        }
        
        if (!data.equipment) {
            errors.push('장비를 선택해주세요.');
        }
        
        if (!data.inspector || data.inspector.trim() === '') {
            errors.push('점검자 이름을 입력해주세요.');
        }
        
        if (!data.results || data.results.length === 0) {
            errors.push('점검 결과를 입력해주세요.');
        } else {
            data.results.forEach((result, index) => {
                if (!result.item) {
                    errors.push(`${index + 1}번째 점검 항목의 이름이 없습니다.`);
                }
                if (!result.result) {
                    errors.push(`${result.item}의 점검 결과를 선택해주세요.`);
                }
            });
        }
        
        return errors;
    }
    
    // 점검 데이터 포맷팅
    formatInspectionDataForDisplay(data) {
        const formattedData = {
            ...data,
            formattedDate: new Date(data.timestamp).toLocaleDateString('ko-KR'),
            formattedTime: new Date(data.timestamp).toLocaleTimeString('ko-KR'),
            summary: this.generateInspectionSummary(data)
        };
        
        return formattedData;
    }
    
    // 점검 요약 생성
    generateInspectionSummary(data) {
        const totalItems = data.results.length;
        const normalItems = data.results.filter(r => r.result === '정상').length;
        const abnormalItems = data.results.filter(r => r.result === '이상').length;
        const needCheckItems = data.results.filter(r => r.result === '점검필요').length;
        const naItems = data.results.filter(r => r.result === 'N/A').length;
        
        return {
            total: totalItems,
            normal: normalItems,
            abnormal: abnormalItems,
            needCheck: needCheckItems,
            na: naItems,
            status: abnormalItems > 0 ? 'abnormal' : (needCheckItems > 0 ? 'warning' : 'normal')
        };
    }
    
    // 점검 통계 생성
    generateInspectionStatistics(historyData) {
        const stats = {
            totalInspections: historyData.length,
            byType: {},
            byEquipment: {},
            byInspector: {},
            recentTrends: []
        };
        
        historyData.forEach(inspection => {
            // 점검 유형별 통계
            if (!stats.byType[inspection.type]) {
                stats.byType[inspection.type] = 0;
            }
            stats.byType[inspection.type]++;
            
            // 장비별 통계
            if (!stats.byEquipment[inspection.equipment]) {
                stats.byEquipment[inspection.equipment] = 0;
            }
            stats.byEquipment[inspection.equipment]++;
            
            // 점검자별 통계
            if (!stats.byInspector[inspection.inspector]) {
                stats.byInspector[inspection.inspector] = 0;
            }
            stats.byInspector[inspection.inspector]++;
        });
        
        return stats;
    }
    
    // 점검 알림 생성
    generateInspectionAlerts() {
        const alerts = [];
        const now = new Date();
        
        Object.keys(this.equipmentStatus).forEach(equipmentName => {
            const equipment = this.equipmentStatus[equipmentName];
            const nextCheck = new Date(equipment.nextCheck);
            const daysUntilCheck = Math.floor((nextCheck - now) / (1000 * 60 * 60 * 24));
            
            if (daysUntilCheck <= 0) {
                alerts.push({
                    type: 'urgent',
                    equipment: equipmentName,
                    message: `${equipmentName} 긴급 점검 필요`,
                    daysOverdue: Math.abs(daysUntilCheck)
                });
            } else if (daysUntilCheck <= 3) {
                alerts.push({
                    type: 'warning',
                    equipment: equipmentName,
                    message: `${equipmentName} 점검 예정 (${daysUntilCheck}일 후)`,
                    daysUntilCheck: daysUntilCheck
                });
            }
        });
        
        return alerts;
    }
    
    // 점검 일정 생성
    generateInspectionSchedule(days = 30) {
        const schedule = [];
        const now = new Date();
        const endDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));
        
        Object.keys(this.equipmentStatus).forEach(equipmentName => {
            const equipment = this.equipmentStatus[equipmentName];
            const nextCheck = new Date(equipment.nextCheck);
            
            if (nextCheck <= endDate) {
                schedule.push({
                    equipment: equipmentName,
                    scheduledDate: nextCheck,
                    daysUntilCheck: Math.floor((nextCheck - now) / (1000 * 60 * 60 * 24)),
                    priority: nextCheck <= now ? 'urgent' : (nextCheck <= new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000)) ? 'high' : 'normal')
                });
            }
        });
        
        // 날짜순 정렬
        schedule.sort((a, b) => a.scheduledDate - b.scheduledDate);
        
        return schedule;
    }
}

// 전역 인스턴스 생성
window.inspectionManager = new InspectionManager();
