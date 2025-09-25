// EGChem FACSYS 점검 시스템 - 서비스 계정 방식 구글 시트 연동 (웹용)

class GoogleSheetsServiceAccountManager {
    constructor() {
        this.isConnected = false;
        this.spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ'; // 기존 프로그램과 동일
        this.credentials = null;
        this.accessToken = null;
        
        this.init();
    }
    
    async init() {
        try {
            console.log('✅ 구글 시트 서비스 계정 매니저 초기화 완료');
        } catch (error) {
            console.error('❌ 구글 시트 서비스 계정 매니저 초기화 실패:', error);
        }
    }
    
    async loadCredentialsFromFile(file) {
        try {
            const text = await file.text();
            this.credentials = JSON.parse(text);
            console.log('✅ 서비스 계정 자격 증명 로드 완료');
            return true;
        } catch (error) {
            console.error('❌ 서비스 계정 자격 증명 로드 실패:', error);
            throw error;
        }
    }
    
    async getAccessToken() {
        try {
            if (!this.credentials) {
                throw new Error('서비스 계정 자격 증명이 로드되지 않았습니다.');
            }
            
            // JWT 토큰 생성
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
            
            // JWT 토큰 생성
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
                const errorData = await response.json();
                throw new Error(`액세스 토큰 요청 실패: ${errorData.error?.message || response.statusText}`);
            }
            
            const tokenData = await response.json();
            this.accessToken = tokenData.access_token;
            return this.accessToken;
            
        } catch (error) {
            console.error('❌ 액세스 토큰 생성 실패:', error);
            throw error;
        }
    }
    
    async createJWT(header, payload) {
        try {
            // 간단한 JWT 생성 (실제 환경에서는 더 안전한 라이브러리 사용 권장)
            const encodedHeader = btoa(JSON.stringify(header));
            const encodedPayload = btoa(JSON.stringify(payload));
            
            // 서명 생성 (실제로는 RSA 서명이 필요하지만, 여기서는 간단히 처리)
            const signature = 'dummy_signature';
            
            return `${encodedHeader}.${encodedPayload}.${signature}`;
        } catch (error) {
            console.error('❌ JWT 생성 실패:', error);
            throw error;
        }
    }
    
    async addInspectionData(inspectionData) {
        try {
            if (!this.credentials) {
                throw new Error('서비스 계정 자격 증명이 로드되지 않았습니다. 연결 설정에서 JSON 파일을 선택해주세요.');
            }
            
            // 액세스 토큰 가져오기
            await this.getAccessToken();
            
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
            if (!this.credentials) {
                throw new Error('서비스 계정 자격 증명이 로드되지 않았습니다.');
            }
            
            // 액세스 토큰 가져오기
            await this.getAccessToken();
            
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
}

// 전역 인스턴스 생성
window.googleSheetsManager = new GoogleSheetsServiceAccountManager();