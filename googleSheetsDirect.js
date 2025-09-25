// EGChem FACSYS 점검 시스템 - 직접 구글 시트 연동 (기존 프로그램과 동일한 방식)

class GoogleSheetsDirectManager {
    constructor() {
        this.isConnected = false;
        this.spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ'; // 기존 프로그램과 동일
        this.credentials = null;
        
        this.init();
    }
    
    async init() {
        try {
            await this.loadCredentials();
            this.isConnected = true;
            console.log('✅ 구글 시트 직접 매니저 초기화 완료');
        } catch (error) {
            console.error('❌ 구글 시트 직접 매니저 초기화 실패:', error);
            this.isConnected = false;
        }
    }
    
    async loadCredentials() {
        try {
            // 기존 프로그램의 credentials.json 파일 로드
            const response = await fetch('credentials.json');
            if (response.ok) {
                this.credentials = await response.json();
                console.log('✅ 서비스 계정 자격 증명 로드 완료');
            } else {
                throw new Error('credentials.json 파일을 찾을 수 없습니다.');
            }
        } catch (error) {
            console.error('❌ 서비스 계정 자격 증명 로드 실패:', error);
            throw error;
        }
    }
    
    async addInspectionData(inspectionData) {
        try {
            // API 키 확인
            const apiKey = this.getApiKey();
            if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
                throw new Error('API 키가 설정되지 않았습니다. 연결 설정에서 API 키를 입력해주세요.');
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
            throw error; // 오류를 다시 던져서 상위에서 처리할 수 있도록
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
            console.log(`📊 스프레드시트 ID: ${this.spreadsheetId}`);
            console.log(`🔑 API 키: ${this.getApiKey().substring(0, 10)}...`);
            
            // API 키를 사용한 직접 API 호출
            const apiKey = this.getApiKey();
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${sheetName}!A:G:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS&key=${apiKey}`;
            
            console.log(`🌐 요청 URL: ${url}`);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    values: rowData
                })
            });
            
            console.log(`📡 응답 상태: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error(`❌ 응답 오류:`, errorData);
                
                // 구체적인 오류 메시지 제공
                let errorMessage = `데이터 추가 실패 (${response.status})`;
                if (errorData.error) {
                    errorMessage += `: ${errorData.error.message}`;
                    if (errorData.error.message.includes('permission')) {
                        errorMessage += '\n\n해결 방법:\n1. 구글 시트가 공유되어 있는지 확인\n2. API 키가 올바른지 확인\n3. 구글 시트에 "1-A" 시트가 있는지 확인';
                    }
                }
                
                throw new Error(errorMessage);
            }
            
            const result = await response.json();
            console.log('✅ 데이터 추가 성공:', result);
            return result;
            
        } catch (error) {
            console.error('❌ 데이터 추가 실패:', error);
            throw error;
        }
    }
    
    async getAccessToken() {
        try {
            // JWT 토큰 생성 (서비스 계정 방식)
            const now = Math.floor(Date.now() / 1000);
            const header = {
                "alg": "RS256",
                "typ": "JWT"
            };
            
            const payload = {
                "iss": this.credentials.client_email,
                "scope": "https://www.googleapis.com/auth/spreadsheets",
                "aud": "https://oauth2.googleapis.com/token",
                "exp": now + 3600,
                "iat": now
            };
            
            // JWT 토큰 생성 (간단한 방식)
            const token = await this.createJWT(header, payload);
            
            // 액세스 토큰 요청
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                    'assertion': token
                })
            });
            
            if (!response.ok) {
                throw new Error('액세스 토큰 요청 실패');
            }
            
            const tokenData = await response.json();
            return tokenData.access_token;
            
        } catch (error) {
            console.error('❌ 액세스 토큰 생성 실패:', error);
            throw error;
        }
    }
    
    async createJWT(header, payload) {
        // 간단한 JWT 생성 (실제로는 더 복잡한 라이브러리 사용 권장)
        const encodedHeader = btoa(JSON.stringify(header));
        const encodedPayload = btoa(JSON.stringify(payload));
        
        // 서명 생성 (실제로는 RSA 서명 필요)
        const signature = 'dummy_signature';
        
        return `${encodedHeader}.${encodedPayload}.${signature}`;
    }
    
    async testConnection() {
        try {
            // API 키 방식으로 연결 테스트
            const apiKey = this.getApiKey();
            if (!apiKey) {
                throw new Error('API 키가 설정되지 않았습니다.');
            }
            
            const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}?key=${apiKey}`);
            
            if (response.ok) {
                console.log('✅ 구글 시트 연결 테스트 성공');
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
    
    getApiKey() {
        // API 키를 로컬 스토리지에서 가져오거나 기본값 사용
        return localStorage.getItem('google_api_key') || 'YOUR_API_KEY_HERE';
    }
    
    setApiKey(apiKey) {
        // API 키를 로컬 스토리지에 저장
        localStorage.setItem('google_api_key', apiKey);
        this.isConnected = true;
    }
}

// 전역 인스턴스 생성
window.googleSheetsManager = new GoogleSheetsDirectManager();
