// EGChem FACSYS 점검 시스템 - JSONP 방식 구글 시트 연동 (CORS 문제 해결)

class GoogleSheetsJSONPManager {
    constructor() {
        this.isConnected = false;
        this.spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ'; // 기존 프로그램과 동일
        this.webAppUrl = ''; // Google Apps Script 웹앱 URL
        
        this.init();
    }
    
    async init() {
        try {
            console.log('✅ 구글 시트 JSONP 매니저 초기화 완료');
            
            // 저장된 웹앱 URL이 있으면 자동으로 연결 시도
            const savedUrl = localStorage.getItem('google_webapp_url');
            if (savedUrl && savedUrl.trim() !== '') {
                console.log('🔄 저장된 웹앱 URL 발견, 자동 연결 시도:', savedUrl);
                this.webAppUrl = savedUrl;
                
                // 자동 연결 테스트 (백그라운드에서 조용히 실행)
                this.autoConnect();
            }
        } catch (error) {
            console.error('❌ 구글 시트 JSONP 매니저 초기화 실패:', error);
        }
    }
    
    async autoConnect() {
        try {
            console.log('🔄 자동 연결 테스트 시작...');
            const success = await this.testConnection();
            
            if (success) {
                console.log('✅ 자동 연결 성공');
                this.isConnected = true;
                
                // 연결 성공 시 상태 업데이트 (UI가 있다면)
                this.updateConnectionStatus(true);
            } else {
                console.log('⚠️ 자동 연결 실패, 수동 연결 필요');
                this.isConnected = false;
                this.updateConnectionStatus(false);
            }
        } catch (error) {
            console.log('⚠️ 자동 연결 중 오류:', error.message);
            this.isConnected = false;
            this.updateConnectionStatus(false);
        }
    }
    
    updateConnectionStatus(connected) {
        // 메인 화면 연결 상태 업데이트
        const mainStatusElement = document.getElementById('main-connection-status');
        if (mainStatusElement) {
            if (connected) {
                mainStatusElement.textContent = '✅ 연결됨';
                mainStatusElement.className = 'status-indicator connected';
            } else {
                mainStatusElement.textContent = '❌ 연결 안됨';
                mainStatusElement.className = 'status-indicator disconnected';
            }
        }
        
        // 연결 설정 모달의 연결 상태 업데이트 (모달이 열려있다면)
        const modalStatusElement = document.getElementById('connection-status');
        if (modalStatusElement) {
            if (connected) {
                modalStatusElement.textContent = '연결됨 (자동)';
                modalStatusElement.className = 'status-indicator connected';
            } else {
                modalStatusElement.textContent = '연결 안됨';
                modalStatusElement.className = 'status-indicator disconnected';
            }
        }
    }
    
    setWebAppUrl(url) {
        this.webAppUrl = url;
        console.log('✅ 웹앱 URL 설정:', url);
    }
    
    async addInspectionData(inspectionData) {
        try {
            if (!this.webAppUrl) {
                throw new Error('Google Apps Script 웹앱 URL이 설정되지 않았습니다. 연결 설정에서 URL을 입력해주세요.');
            }
            
            // 기존 프로그램과 동일: "1-A" 시트 사용 (고정)
            const sheetName = "1-A";
            
            // 데이터 추가 (기존 프로그램과 동일한 형식)
            const rowData = this.formatInspectionDataForSheet(inspectionData);
            
            return new Promise((resolve, reject) => {
                const callbackName = `callback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                // 전역 콜백 함수 생성
                window[callbackName] = (result) => {
                    // 스크립트 태그 제거
                    if (script.parentNode) {
                        document.head.removeChild(script);
                    }
                    delete window[callbackName];
                    
                    if (result.success) {
                        console.log('✅ 점검 데이터 저장 완료:', result);
                        resolve(true);
                    } else {
                        console.error('❌ 점검 데이터 저장 실패:', result.error);
                        reject(new Error(result.error || '알 수 없는 오류'));
                    }
                };
                
                // JSONP 요청을 위한 스크립트 태그 생성
                const script = document.createElement('script');
                const params = new URLSearchParams({
                    callback: callbackName,
                    action: 'addInspectionData',
                    sheetName: sheetName,
                    data: JSON.stringify(rowData[0])
                });
                
                script.src = `${this.webAppUrl}?${params.toString()}`;
                script.onerror = (error) => {
                    console.error('❌ JSONP 스크립트 로드 실패:', error);
                    if (script.parentNode) {
                        document.head.removeChild(script);
                    }
                    delete window[callbackName];
                    reject(new Error('JSONP 요청 실패: 스크립트를 로드할 수 없습니다. 웹앱 URL을 확인해주세요.'));
                };
                
                document.head.appendChild(script);
            });
            
        } catch (error) {
            console.error('❌ 점검 데이터 저장 실패:', error);
            throw error;
        }
    }
    
    formatInspectionDataForSheet(inspectionData) {
        // 기존 프로그램과 완전히 동일한 FACSYS 스타일 데이터 형식
        // 순서: 날짜, 점검유형, 장비명, 설치위치, 점검자, 점검내용, 특이사항
        
        // 한국 시간 기준으로 날짜 생성 (KST: UTC+9)
        const now = new Date();
        const koreanTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
        const dateStr = koreanTime.toISOString().split('T')[0]; // YYYY-MM-DD 형식
        const inspectionType = inspectionData.team || inspectionData.type || '일일점검'; // 점검 유형
        const equipmentName = inspectionData.equipment;
        const location = inspectionData.location || '';
        const inspectorName = inspectionData.inspector;
        const checkContent = inspectionData.inspections || '';
        const notes = inspectionData.notes || '';
        
        // 기존 프로그램과 동일한 7열 구조
        const row = [
            dateStr,           // A: 날짜
            inspectionType,    // B: 점검 유형 (일일점검, 주간점검 등)
            equipmentName,     // C: 장비명
            location,          // D: 설치위치
            inspectorName,      // E: 점검자
            checkContent,      // F: 점검내용
            notes              // G: 특이사항
        ];
        
        return [row];
    }
    
    async testConnection() {
        try {
            if (!this.webAppUrl) {
                throw new Error('Google Apps Script 웹앱 URL이 설정되지 않았습니다.');
            }
            
            console.log('🔄 JSONP 연결 테스트 시작:', this.webAppUrl);
            
            return new Promise((resolve, reject) => {
                const callbackName = `callback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                // 전역 콜백 함수 생성
                window[callbackName] = (result) => {
                    // 스크립트 태그 제거
                    if (script.parentNode) {
                        document.head.removeChild(script);
                    }
                    delete window[callbackName];
                    
                    if (result.success) {
                        console.log('✅ 구글 시트 연결 테스트 성공 (JSONP)');
                        this.isConnected = true;
                        resolve(true);
                    } else {
                        console.error('❌ 구글 시트 연결 테스트 실패:', result.error);
                        reject(new Error(result.error || '알 수 없는 오류'));
                    }
                };
                
                // JSONP 요청을 위한 스크립트 태그 생성
                const script = document.createElement('script');
                const params = new URLSearchParams({
                    callback: callbackName,
                    action: 'testConnection'
                });
                
                script.src = `${this.webAppUrl}?${params.toString()}`;
                script.onerror = (error) => {
                    console.error('❌ JSONP 스크립트 로드 실패:', error);
                    if (script.parentNode) {
                        document.head.removeChild(script);
                    }
                    delete window[callbackName];
                    reject(new Error('JSONP 요청 실패: 스크립트를 로드할 수 없습니다. 웹앱 URL을 확인해주세요.'));
                };
                
                document.head.appendChild(script);
            });
            
        } catch (error) {
            console.error('❌ 구글 시트 연결 테스트 오류:', error);
            throw error;
        }
    }
}

// 전역 인스턴스 생성
window.googleSheetsManager = new GoogleSheetsJSONPManager();
