// EGChem FACSYS 점검 시스템 - Google Apps Script 웹앱 방식 구글 시트 연동

class GoogleSheetsWebAppManager {
    constructor() {
        this.isConnected = false;
        this.spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ'; // 기존 프로그램과 동일
        this.webAppUrl = ''; // Google Apps Script 웹앱 URL
        
        this.init();
    }
    
    async init() {
        try {
            console.log('✅ 구글 시트 웹앱 매니저 초기화 완료');
        } catch (error) {
            console.error('❌ 구글 시트 웹앱 매니저 초기화 실패:', error);
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
            
            const response = await fetch(this.webAppUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'addInspectionData',
                    sheetName: sheetName,
                    data: rowData[0] // 첫 번째 행 데이터
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`데이터 추가 실패: ${response.status} - ${errorData.error || '알 수 없는 오류'}`);
            }
            
            const result = await response.json();
            console.log('✅ 점검 데이터 저장 완료:', result);
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
    
    async testConnection() {
        try {
            if (!this.webAppUrl) {
                throw new Error('Google Apps Script 웹앱 URL이 설정되지 않았습니다.');
            }
            
            console.log('🔄 연결 테스트 시작:', this.webAppUrl);
            
            // 먼저 GET 방식으로 테스트 (CORS 문제 해결)
            try {
                const getResponse = await fetch(`${this.webAppUrl}?action=testConnection`, {
                    method: 'GET',
                    mode: 'cors'
                });
                
                console.log('📡 GET 응답 상태:', getResponse.status, getResponse.statusText);
                
                if (getResponse.ok) {
                    const result = await getResponse.json();
                    console.log('📊 GET 응답 데이터:', result);
                    
                    if (result.success) {
                        console.log('✅ 구글 시트 연결 테스트 성공 (GET)');
                        this.isConnected = true;
                        return true;
                    } else {
                        throw new Error(`웹앱 응답 오류: ${result.error}`);
                    }
                } else {
                    throw new Error(`GET 요청 실패: ${getResponse.status}`);
                }
            } catch (getError) {
                console.log('⚠️ GET 방식 실패, POST 방식 시도:', getError.message);
                
                // GET이 실패하면 POST 방식으로 시도
                const postResponse = await fetch(this.webAppUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'testConnection'
                    })
                });
                
                console.log('📡 POST 응답 상태:', postResponse.status, postResponse.statusText);
                
                if (postResponse.ok) {
                    const result = await postResponse.json();
                    console.log('📊 POST 응답 데이터:', result);
                    
                    if (result.success) {
                        console.log('✅ 구글 시트 연결 테스트 성공 (POST)');
                        this.isConnected = true;
                        return true;
                    } else {
                        throw new Error(`웹앱 응답 오류: ${result.error}`);
                    }
                } else {
                    const errorText = await postResponse.text();
                    console.error('❌ POST HTTP 오류:', postResponse.status, errorText);
                    throw new Error(`POST HTTP 오류 (${postResponse.status}): ${errorText}`);
                }
            }
        } catch (error) {
            console.error('❌ 구글 시트 연결 테스트 오류:', error);
            throw error; // 오류를 다시 던져서 상위에서 처리할 수 있도록
        }
    }
}

// 전역 인스턴스 생성
window.googleSheetsManager = new GoogleSheetsWebAppManager();
