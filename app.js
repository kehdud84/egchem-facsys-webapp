// EGChem FACSYS 점검 시스템 - 메인 앱 로직

class EGChemApp {
    constructor() {
        this.currentUser = {
            team: '1-A',
            name: '점검자'
        };
        this.currentInspectionType = null;
        this.currentEquipment = null;
        this.currentStep = null;
        this.inspectionData = {
            inspector: '',
            location: '',
            inspections: [],
            notes: ''
        };
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.showMainApp();
        this.loadInspectionData();
    }
    
    setupEventListeners() {
        // 네비게이션 탭
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        // 점검 유형 버튼
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.selectInspectionType(e.target.dataset.type);
            });
        });
        
        // 점검 폼 제출 (단계별 시스템에서는 직접 호출)
        // document.getElementById('check-form')이 더 이상 존재하지 않으므로 제거
    }
    
    checkLoginStatus() {
        const savedUser = localStorage.getItem('egchem_user');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            this.showMainApp();
        } else {
            this.showLoginScreen();
        }
    }
    
    handleLogin() {
        const teamName = document.getElementById('login-team').value.trim();
        const userName = document.getElementById('login-name').value.trim();
        
        if (!teamName) {
            alert('팀을 선택해주세요.');
            return;
        }
        
        if (!userName) {
            alert('점검자 이름을 입력해주세요.');
            return;
        }
        
        this.currentUser = {
            team: teamName,
            name: userName,
            loginTime: new Date().toISOString()
        };
        
        localStorage.setItem('egchem_user', JSON.stringify(this.currentUser));
        this.showMainApp();
    }
    
    handleLogout() {
        this.currentUser = null;
        localStorage.removeItem('egchem_user');
        this.showLoginScreen();
    }
    
    showLoginScreen() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('main-app').style.display = 'none';
        document.getElementById('login-screen').style.display = 'flex';
    }
    
    showMainApp() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('main-app').style.display = 'flex';
        
        // 메인 화면 표시
        document.getElementById('main-screen').style.display = 'flex';
        document.getElementById('equipment-check-screen').style.display = 'none';
        
        // 구글 시트 연결 상태 확인
        this.checkGoogleSheetsConnection();
    }
    
    openEquipmentCheck() {
        console.log('🔧 openEquipmentCheck 호출됨');
        
        // 메인 화면 숨기고 점검 화면 표시
        const mainScreen = document.getElementById('main-screen');
        const equipmentScreen = document.getElementById('equipment-check-screen');
        
        console.log('🔍 메인 화면 요소:', mainScreen);
        console.log('🔍 점검 화면 요소:', equipmentScreen);
        
        if (mainScreen && equipmentScreen) {
            mainScreen.style.display = 'none';
            equipmentScreen.style.display = 'flex';
            console.log('✅ 화면 전환 성공');
        } else {
            console.error('❌ 화면 요소를 찾을 수 없음');
            return;
        }
        
        // 사용자 정보 표시
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            userNameElement.textContent = `${this.currentUser.team} 팀`;
            console.log('✅ 사용자 정보 표시:', `${this.currentUser.team} 팀`);
        } else {
            console.error('❌ 사용자 이름 요소를 찾을 수 없음');
        }
    }
    
    goBackToMain() {
        // 점검 화면 숨기고 메인 화면 표시
        document.getElementById('equipment-check-screen').style.display = 'none';
        document.getElementById('main-screen').style.display = 'flex';
    }
    
    switchTab(tabName) {
        // 모든 탭 비활성화
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // 모든 화면 숨기기
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        // 선택된 탭 활성화
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-screen`).classList.add('active');
        
        // 탭별 특별 처리
        if (tabName === 'history') {
            this.loadInspectionHistory();
        } else if (tabName === 'settings') {
            this.updateSettingsDisplay();
        }
    }
    
    selectInspectionType(type) {
        console.log('🔍 selectInspectionType 호출됨:', type);
        this.currentInspectionType = type;
        console.log('✅ 현재 점검 유형 설정됨:', this.currentInspectionType);
        
        // 모든 유형 버튼 비활성화
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        // 선택된 버튼 활성화
        const selectedBtn = document.querySelector(`[data-type="${type}"]`);
        if (selectedBtn) {
            selectedBtn.classList.add('selected');
            console.log('✅ 점검 유형 버튼 활성화됨:', type);
        } else {
            console.error('❌ 점검 유형 버튼을 찾을 수 없음:', type);
        }
        
        // 장비 목록 표시
        this.showEquipmentList(type);
    }
    
    showEquipmentList(type) {
        const equipmentItems = document.getElementById('equipment-items');
        
        // 장비 데이터 로드 (실제로는 구글 시트에서 가져옴)
        const equipment = this.getEquipmentForType(type);
        
        equipmentItems.innerHTML = '';
        equipment.forEach(equipment => {
            const item = document.createElement('div');
            item.className = `equipment-item ${equipment.status}`;
            item.innerHTML = `
                <div class="equipment-name">${equipment.name}</div>
                <div class="equipment-status">${equipment.statusText}</div>
            `;
            
            item.addEventListener('click', () => {
                this.selectEquipment(equipment);
            });
            
            equipmentItems.appendChild(item);
        });
    }
    
    selectEquipment(equipment) {
        this.currentEquipment = equipment;
        
        // 모든 장비 아이템 비활성화
        document.querySelectorAll('.equipment-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // 선택된 장비 활성화
        event.target.closest('.equipment-item').classList.add('selected');
        
        // 모바일에서 사이드바 자동 숨김
        this.hideSidebarOnMobile();
        
        // 단계별 점검 시작 (1단계: 점검자 이름 입력)
        this.startStepByStepInspection();
    }
    
    startStepByStepInspection() {
        // 모든 단계 숨기기
        document.querySelectorAll('.inspection-step').forEach(step => {
            step.style.display = 'none';
        });
        
        // 1단계: 점검자 이름 입력 표시
        this.showStep('inspector');
    }
    
    showStep(stepName) {
        console.log('📱 showStep 호출됨:', stepName);
        
        // 모든 단계 숨기기
        const allSteps = document.querySelectorAll('.inspection-step');
        console.log('🔍 찾은 단계들:', allSteps.length);
        allSteps.forEach(step => {
            step.style.display = 'none';
        });
        
        // 선택된 단계 표시
        const stepElement = document.getElementById(`step-${stepName}`);
        console.log('🎯 찾은 단계 요소:', stepElement);
        if (stepElement) {
            stepElement.style.display = 'block';
            this.currentStep = stepName;
            console.log('✅ 단계 표시 성공:', stepName);
        } else {
            console.error('❌ 단계 요소를 찾을 수 없음:', `step-${stepName}`);
        }
    }
    
    nextStep(nextStepName) {
        console.log('🔄 nextStep 호출됨:', nextStepName);
        
        // 점검 내용 단계에서 다음으로 넘어갈 때 검증
        if (this.currentStep === 'inspection' && nextStepName === 'notes') {
            const completedItems = document.querySelectorAll('.check-item.completed');
            if (completedItems.length === 0) {
                alert('최소 하나의 점검 항목을 선택해주세요.');
                return;
            }
            console.log('✅ 점검 항목 검증 통과:', completedItems.length, '개 완료');
        }
        
        // 현재 단계 데이터 저장
        this.saveCurrentStepData();
        console.log('💾 현재 단계 데이터 저장됨:', this.inspectionData);
        
        // 다음 단계로 이동
        this.showStep(nextStepName);
        console.log('📱 다음 단계 표시됨:', nextStepName);
        
        // 다음 단계에 필요한 데이터 로드
        this.loadStepData(nextStepName);
        console.log('📋 다음 단계 데이터 로드됨:', nextStepName);
    }
    
    prevStep(prevStepName) {
        // 이전 단계로 이동
        this.showStep(prevStepName);
    }
    
    saveCurrentStepData() {
        switch(this.currentStep) {
            case 'inspector':
                this.inspectionData.inspector = document.getElementById('inspector-name').value.trim();
                break;
            case 'location':
                // 설치위치는 selectLocation에서 저장됨
                break;
            case 'inspection':
                // 점검 내용은 각 항목 선택 시 저장됨
                break;
            case 'notes':
                this.inspectionData.notes = document.getElementById('notes').value.trim();
                break;
        }
    }
    
    loadStepData(stepName) {
        switch(stepName) {
            case 'inspection':
                this.loadInspectionItems();
                break;
        }
    }
    
    loadInspectionItems() {
        console.log('📋 loadInspectionItems 호출됨');
        
        const checkItems = document.getElementById('check-items');
        if (!checkItems) {
            console.error('❌ check-items 요소를 찾을 수 없음');
            return;
        }
        
        checkItems.innerHTML = '';
        
        const items = this.getInspectionItemsForType(this.currentInspectionType);
        console.log('🔍 점검 항목들:', items);
        
        items.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'check-item';
            itemDiv.innerHTML = `
                <div class="check-item-name">${item}</div>
                <div class="check-item-status">미점검</div>
            `;
            
            // 점검 항목 클릭 이벤트 (클릭하면 점검 완료)
            itemDiv.addEventListener('click', (e) => {
                e.preventDefault();
                
                // 이미 점검된 항목인지 확인
                if (itemDiv.classList.contains('completed')) {
                    console.log('이미 점검된 항목입니다:', item);
                    return;
                }
                
                // 점검 완료 처리
                itemDiv.classList.add('completed');
                itemDiv.querySelector('.check-item-status').textContent = '점검완료';
                
                // 점검 결과 저장 (자동으로 "점검완료"로 처리)
                const itemName = itemDiv.querySelector('.check-item-name').textContent;
                const existingResult = this.inspectionData.inspections.find(r => r.item === itemName);
                
                if (existingResult) {
                    existingResult.result = '점검완료';
                } else {
                    this.inspectionData.inspections.push({
                        item: itemName,
                        result: '점검완료'
                    });
                }
                
                console.log('✅ 점검 항목 완료됨:', itemName);
                
                // 모든 점검 항목이 완료되었는지 확인
                this.checkAllInspectionItemsCompleted();
            });
            
            checkItems.appendChild(itemDiv);
        });
        
        console.log('✅ 점검 항목 로드 완료:', items.length, '개');
    }
    
    selectLocation(location) {
        this.inspectionData.location = location;
        
        // 선택된 위치 하이라이트
        document.querySelectorAll('.location-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        event.target.classList.add('selected');
        
        // 다음 단계로 자동 이동
        setTimeout(() => {
            this.nextStep('inspection');
        }, 500);
    }
    
    setDefaultLocation() {
        // 점검 유형에 따른 기본 위치 설정
        const locationMap = {
            '일일점검': '3동',
            '주간점검': '정제실1',
            '월간점검': '정제실1',
            '분기점검': '정제실1',
            '반기점검': '정제실1',
            '연간점검': '정제실1'
        };
        
        const defaultLocation = locationMap[this.currentInspectionType] || '';
        document.getElementById('location').value = defaultLocation;
    }
    
    showInspectionForm(equipment) {
        const inspectionForm = document.getElementById('inspection-form');
        const checkItems = document.getElementById('check-items');
        
        // 점검 폼 표시
        inspectionForm.style.display = 'block';
        
        // 점검 항목 로드
        const inspectionItems = this.getInspectionItemsForType(this.currentInspectionType);
        
        checkItems.innerHTML = '';
        inspectionItems.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'check-item';
            itemDiv.innerHTML = `
                <div class="check-item-name">${item}</div>
                <div class="check-item-options">
                    <button type="button" class="check-option" data-result="정상">정상</button>
                    <button type="button" class="check-option" data-result="이상">이상</button>
                    <button type="button" class="check-option" data-result="점검필요">점검필요</button>
                    <button type="button" class="check-option" data-result="N/A">N/A</button>
                </div>
            `;
            
            // 점검 옵션 클릭 이벤트
            itemDiv.querySelectorAll('.check-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    e.preventDefault();
                    
                    // 같은 항목의 다른 옵션들 비활성화
                    itemDiv.querySelectorAll('.check-option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    
                    // 선택된 옵션 활성화
                    option.classList.add('selected');
                    
                    // 점검 결과 저장
                    const itemName = itemDiv.querySelector('.check-item-name').textContent;
                    const result = option.dataset.result;
                    const existingResult = this.inspectionData.inspections.find(r => r.item === itemName);
                    
                    if (existingResult) {
                        existingResult.result = result;
                    } else {
                        this.inspectionData.inspections.push({
                            item: itemName,
                            result: result
                        });
                    }
                    
                    // 모든 점검 항목이 선택되었는지 확인
                    this.checkAllInspectionItemsCompleted();
                });
            });
            
            checkItems.appendChild(itemDiv);
        });
        
        // 점검자 이름 자동 입력
        document.getElementById('inspector-name').value = this.currentUser.name;
    }
    
    checkAllInspectionItemsCompleted() {
        const allItems = document.querySelectorAll('.check-item');
        const completedItems = Array.from(allItems).filter(item => {
            return item.classList.contains('completed');
        });
        
        console.log('🔍 점검 완료 확인:', completedItems.length, '/', allItems.length, '완료');
        
        // 하나 이상의 항목이 완료되면 다음 단계로 이동 가능
        if (completedItems.length > 0) {
            console.log('✅ 점검 항목 완료됨, 다음 단계로 이동 가능');
            // 자동 이동은 하지 않고 사용자가 직접 "다음" 버튼을 누르도록 함
        }
    }
    
    submitInspection() {
        // 현재 단계 데이터 저장
        this.saveCurrentStepData();
        
        // 데이터 검증
        if (!this.inspectionData.inspector) {
            alert('점검자 이름을 입력해주세요.');
            return;
        }
        
        if (!this.inspectionData.location) {
            alert('설치위치를 선택해주세요.');
            return;
        }
        
        if (!this.currentEquipment) {
            alert('장비를 선택해주세요.');
            return;
        }
        
        if (this.inspectionData.inspections.length === 0) {
            alert('점검 내용을 선택해주세요.');
            return;
        }
        
        // 기존 프로그램과 동일한 데이터 구조
        const inspectionData = {
            team: this.currentInspectionType, // 점검 유형 (일일점검, 주간점검 등)
            type: this.currentInspectionType, // 점검 유형 (일일점검, 주간점검 등)
            equipment: this.currentEquipment.name,
            location: this.inspectionData.location,
            inspector: this.inspectionData.inspector,
            inspections: this.inspectionData.inspections.map(r => `${r.item}: ${r.result}`).join(', '),
            notes: this.inspectionData.notes,
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString('ko-KR'),
            time: new Date().toLocaleTimeString('ko-KR')
        };
        
        // 구글 시트에 저장
        this.saveToGoogleSheets(inspectionData);
    }
    
    async saveToGoogleSheets(data) {
        try {
            console.log('🔄 점검 데이터 저장 시도:', data);
            
            // 구글 시트 API를 통해 데이터 저장
            const success = await window.googleSheetsManager.addInspectionData(data);
            
            if (success) {
                alert('점검 결과가 성공적으로 저장되었습니다.');
                this.resetInspectionForm();
                this.loadInspectionHistory();
            } else {
                alert('점검 결과 저장에 실패했습니다. 다시 시도해주세요.');
            }
        } catch (error) {
            console.error('점검 데이터 저장 오류:', error);
            
            // 더 자세한 오류 메시지 제공
            let errorMessage = `점검 결과 저장 중 오류가 발생했습니다:\n${error.message}`;
            
            if (error.message.includes('JSONP')) {
                errorMessage += '\n\n해결 방법:\n1. 연결 설정에서 웹앱 URL 확인\n2. Google Apps Script가 배포되었는지 확인\n3. 브라우저 새로고침 후 재시도';
            } else if (error.message.includes('권한')) {
                errorMessage += '\n\n해결 방법:\n1. Google Apps Script 권한 설정 확인\n2. 구글 시트 공유 권한 확인';
            }
            
            alert(errorMessage);
        }
    }
    
    resetInspectionForm() {
        // 폼 초기화
        const inspectionForm = document.getElementById('inspection-form');
        if (inspectionForm) {
            inspectionForm.style.display = 'none';
        }
        
        // 선택 상태 초기화
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        // 장비 선택 상태 초기화
        document.querySelectorAll('.equipment-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // 폼 입력 필드 초기화
        const inspectorName = document.getElementById('inspector-name');
        const location = document.getElementById('location');
        const notes = document.getElementById('notes');
        
        if (inspectorName) inspectorName.value = '';
        if (location) location.value = '';
        if (notes) notes.value = '';
        
        // 점검 항목 초기화
        const checkItems = document.getElementById('check-items');
        if (checkItems) {
            checkItems.innerHTML = '';
        }
        
        this.currentInspectionType = null;
        this.currentEquipment = null;
    }
    
    loadInspectionHistory() {
        // 점검 이력 로드 (실제로는 구글 시트에서 가져옴)
        const historyList = document.getElementById('history-list');
        if (historyList) {
            historyList.innerHTML = '<p>점검 이력을 불러오는 중...</p>';
        
            // 임시 데이터 (실제로는 구글 시트에서 가져옴)
            setTimeout(() => {
                const mockHistory = [
                    {
                        date: '2024-09-24',
                        type: '일일점검',
                        equipment: 'VP-001',
                        inspector: this.currentUser.name
                    },
                    {
                        date: '2024-09-23',
                        type: '주간점검',
                        equipment: 'VP-002',
                        inspector: this.currentUser.name
                    }
                ];
                
                this.displayInspectionHistory(mockHistory);
            }, 1000);
        } else {
            console.log('점검 이력 섹션이 없습니다. 이 기능은 선택사항입니다.');
        }
    }
    
    displayInspectionHistory(history) {
        const historyList = document.getElementById('history-list');
        
        if (!historyList) {
            console.log('점검 이력 섹션이 없습니다.');
            return;
        }
        
        if (history.length === 0) {
            historyList.innerHTML = '<p>점검 이력이 없습니다.</p>';
            return;
        }
        
        historyList.innerHTML = '';
        history.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <div class="history-date">${item.date}</div>
                <div class="history-details">
                    ${item.type} - ${item.equipment} (점검자: ${item.inspector})
                </div>
            `;
            historyList.appendChild(historyItem);
        });
    }
    
    updateSettingsDisplay() {
        // 연결 상태 업데이트
        const connectionStatus = document.getElementById('connection-status');
        const lastSync = document.getElementById('last-sync');
        
        if (window.googleSheetsManager && window.googleSheetsManager.isConnected) {
            connectionStatus.textContent = '연결됨';
            connectionStatus.className = 'status-indicator connected';
            lastSync.textContent = new Date().toLocaleString('ko-KR');
        } else {
            connectionStatus.textContent = '연결 안됨';
            connectionStatus.className = 'status-indicator disconnected';
            lastSync.textContent = '-';
        }
    }
    
    async checkGoogleSheetsConnection() {
        if (window.googleSheetsManager) {
            try {
                await window.googleSheetsManager.initialize();
                console.log('구글 시트 연결 성공');
            } catch (error) {
                console.error('구글 시트 연결 실패:', error);
            }
        }
    }
    
    // 임시 데이터 메서드들 (실제로는 구글 시트에서 가져옴)
    getEquipmentForType(type) {
        // 기존 프로그램과 동일한 장비 목록
        const equipmentData = {
            '일일점검': [
                { name: 'VP-001', status: 'normal', statusText: '정상' },
                { name: 'VP-002', status: 'warning', statusText: '점검필요' }
            ],
            '주간점검': [
                { name: 'VP-001', status: 'normal', statusText: '정상' },
                { name: 'VP-002', status: 'warning', statusText: '점검필요' },
                { name: 'VP-003', status: 'normal', statusText: '정상' },
                { name: 'VP-004', status: 'alarm', statusText: '알람' }
            ],
            '월간점검': [
                { name: 'VP-001', status: 'normal', statusText: '정상' },
                { name: 'VP-002', status: 'warning', statusText: '점검필요' },
                { name: 'VP-003', status: 'normal', statusText: '정상' }
            ],
            '분기점검': [
                { name: 'VP-001', status: 'normal', statusText: '정상' }
            ],
            '반기점검': [
                { name: 'VP-001', status: 'normal', statusText: '정상' }
            ],
            '연간점검': [
                { name: 'VP-001', status: 'normal', statusText: '정상' }
            ]
        };
        
        return equipmentData[type] || [];
    }
    
    getInspectionItemsForType(type) {
        console.log('🔍 getInspectionItemsForType 호출됨:', type);
        
        const inspectionItems = {
            '일일점검': ['오일교체', '누유점검', '모터점검', '외부수리'],
            '주간점검': ['전체점검', '정밀점검', '교체점검', '예방정비'],
            '월간점검': ['종합점검', '성능점검', '안전점검', '정기교체'],
            '분기점검': ['전면점검', '부품교체', '성능측정', '안전확인'],
            '반기점검': ['대점검', '주요부품교체', '성능개선', '안전강화'],
            '연간점검': ['오버홀', '시설개선', '성능업그레이드', '안전시설점검']
        };
        
        const items = inspectionItems[type] || [];
        console.log('📋 점검 항목 반환됨:', items);
        
        return items;
    }
    
    loadInspectionData() {
        // 점검 데이터 로드 (실제로는 구글 시트에서 가져옴)
        console.log('점검 데이터 로드 중...');
    }
    
    hideSidebarOnMobile() {
        // 모바일 화면 크기 감지 (768px 이하)
        if (window.innerWidth <= 768) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.classList.add('hidden');
                console.log('📱 모바일에서 사이드바 자동 숨김');
            }
        }
    }
}

// 전역 함수들 (HTML에서 호출)
function openEquipmentCheck() {
    window.egchemApp.openEquipmentCheck();
}

function goBackToMain() {
    window.egchemApp.goBackToMain();
}

function openApiSetup() {
    window.open('setup-api.html', '_blank');
}

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    window.app = new EGChemApp();
    console.log('✅ EGChemApp 초기화 완료:', window.app);
});
