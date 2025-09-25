// EGChem FACSYS 점검 시스템 - 간단한 구글 시트 연동 (OAuth2 방식)

class GoogleSheetsSimpleManager {
    constructor() {
        this.isConnected = false;
        this.spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ'; // 기존 프로그램과 동일
        this.accessToken = null;
        
        this.init();
    }
    
    async init() {
        try {
            console.log('✅ 구글 시트 간단 매니저 초기화 완료');
        } catch (error) {
            console.error('❌ 구글 시트 간단 매니저 초기화 실패:', error);
        }
    }
    
    async addInspectionData(inspectionData) {
        try {
            if (!this.accessToken) {
                throw new Error('구글 계정 로그인이 필요합니다. "구글 로그인" 버튼을 클릭해주세요.');
            }
            
            // 기존 프로그램과 동일: "1-A" 시트 사용 (고정)
            const sheetName = "1-A";
            
            // 데이터 추가 (기존 프로그램과 동일한 형식)
            const rowData = this.formatInspectionDataForSheet(inspectionData);
            await this.appendDataToSheet(sheetName, rowData);
            
            console.log('✅ 점검 데이터 저장 완료:', inspectionData);
            return true;
            
        } catch (error) {
            console.error('❌ 점검 데이터 저장 실패:', error);
            throw error;
        }
    }
    
    formatInspectionDataForSheet(inspectionData) {
        // 기존 프로그램과 완전히 동일한 FACSYS 스타일 데이터 형식
        // 순서: 날짜, 점검유형, 장비명, 설치위치, 점검자, 점검내용, 특이사항
        
        const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식
        const teamName = inspectionData.team || '1-A';
        const equipmentName = inspectionData.equipment;
        const location = inspectionData.location || '';
        const inspectorName = inspectionData.inspector;
        const checkContent = inspectionData.inspections || '';
        const notes = inspectionData.notes || '';
        
        // 기존 프로그램과 동일한 7열 구조
        const row = [
            dateStr,           // A: 날짜
            teamName,          // B: 점검 유형 (팀명)
            equipmentName,     // C: 장비명
            location,          // D: 설치위치
            inspectorName,     // E: 점검자
            checkContent,      // F: 점검내용
            notes              // G: 특이사항
        ];
        
        return [row];
    }
    
    async appendDataToSheet(sheetName, rowData) {
        try {
            console.log(`🔄 데이터 추가 시도: ${sheetName}`, rowData);
            
            const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${sheetName}!A:G:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                },
                body: JSON.stringify({
                    values: rowData
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error(`❌ 응답 오류:`, errorData);
                throw new Error(`데이터 추가 실패: ${response.status} - ${errorData.error?.message || '알 수 없는 오류'}`);
            }
            
            const result = await response.json();
            console.log('✅ 데이터 추가 성공:', result);
            return result;
            
        } catch (error) {
            console.error('❌ 데이터 추가 실패:', error);
            throw error;
        }
    }
    
    async testConnection() {
        try {
            if (!this.accessToken) {
                throw new Error('구글 계정 로그인이 필요합니다.');
            }
            
            const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            
            if (response.ok) {
                console.log('✅ 구글 시트 연결 테스트 성공');
                this.isConnected = true;
                return true;
            } else {
                const errorData = await response.json();
                console.error('❌ 구글 시트 연결 테스트 실패:', response.status, errorData);
                return false;
            }
        } catch (error) {
            console.error('❌ 구글 시트 연결 테스트 오류:', error);
            return false;
        }
    }
    
    // 구글 로그인 (OAuth2)
    async googleLogin() {
        try {
            // Google OAuth2 클라이언트 ID (공개용)
            const clientId = 'YOUR_CLIENT_ID_HERE'; // 실제 클라이언트 ID로 교체 필요
            
            // OAuth2 인증 URL 생성
            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
                `client_id=${clientId}&` +
                `redirect_uri=${encodeURIComponent(window.location.origin)}&` +
                `scope=${encodeURIComponent('https://www.googleapis.com/auth/spreadsheets')}&` +
                `response_type=token&` +
                `state=google_auth`;
            
            // 새 창에서 인증
            const authWindow = window.open(authUrl, 'google_auth', 'width=500,height=600');
            
            // 인증 완료 대기
            return new Promise((resolve, reject) => {
                const checkAuth = setInterval(() => {
                    try {
                        if (authWindow.closed) {
                            clearInterval(checkAuth);
                            reject(new Error('인증이 취소되었습니다.'));
                        }
                        
                        // URL에서 액세스 토큰 추출 (실제로는 더 복잡한 처리가 필요)
                        const url = authWindow.location.href;
                        if (url.includes('access_token=')) {
                            const token = url.split('access_token=')[1].split('&')[0];
                            this.accessToken = token;
                            this.isConnected = true;
                            authWindow.close();
                            clearInterval(checkAuth);
                            resolve(true);
                        }
                    } catch (error) {
                        // CORS 오류는 정상적인 동작
                    }
                }, 1000);
            });
            
        } catch (error) {
            console.error('❌ 구글 로그인 실패:', error);
            throw error;
        }
    }
}

// 전역 인스턴스 생성
window.googleSheetsManager = new GoogleSheetsSimpleManager();