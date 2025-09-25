// EGChem FACSYS 점검 시스템 - 구글 시트 연동

class GoogleSheetsManager {
    constructor() {
        this.isConnected = false;
        this.service = null;
        this.spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ'; // 실제 스프레드시트 ID
        this.credentials = null;
        
        this.init();
    }
    
    async init() {
        try {
            await this.loadCredentials();
            await this.initializeService();
            console.log('✅ 구글 시트 매니저 초기화 완료');
        } catch (error) {
            console.error('❌ 구글 시트 매니저 초기화 실패:', error);
        }
    }
    
    async loadCredentials() {
        // 기존 데스크톱 프로그램과 동일한 설정 사용
        this.spreadsheetId = '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ';
        
        try {
            // API 키 파일 로드 시도
            const response = await fetch('api-key.txt');
            if (response.ok) {
                const apiKey = await response.text();
                this.credentials = {
                    apiKey: apiKey.trim(),
                    clientId: 'YOUR_CLIENT_ID_HERE'
                };
                console.log('✅ API 키 파일 로드 완료');
            } else {
                throw new Error('API 키 파일을 찾을 수 없습니다.');
            }
        } catch (error) {
            console.log('❌ API 키 파일 로드 실패:', error.message);
            // 폴백: 로컬 스토리지에서 API 키 로드
            const apiKey = localStorage.getItem('egchem_api_key');
            if (apiKey) {
                this.credentials = {
                    apiKey: apiKey,
                    clientId: 'YOUR_CLIENT_ID_HERE'
                };
                console.log('✅ 폴백: 사용자 설정 API 키 로드 완료');
            } else {
                console.log('❌ API 키가 설정되지 않았습니다. setup-api.html에서 설정하세요.');
                this.credentials = {
                    apiKey: 'YOUR_API_KEY_HERE',
                    clientId: 'YOUR_CLIENT_ID_HERE'
                };
            }
        }
    }
    
    async generateAccessToken() {
        try {
            if (!this.serviceAccount) {
                throw new Error('서비스 계정 정보가 없습니다.');
            }
            
            // JWT 토큰 생성
            const now = Math.floor(Date.now() / 1000);
            const header = {
                "alg": "RS256",
                "typ": "JWT"
            };
            
            const payload = {
                "iss": this.serviceAccount.client_email,
                "scope": "https://www.googleapis.com/auth/spreadsheets",
                "aud": "https://oauth2.googleapis.com/token",
                "exp": now + 3600,
                "iat": now
            };
            
            // JWT 토큰 생성 (실제로는 라이브러리 사용 권장)
            const token = await this.createJWT(header, payload, this.serviceAccount.private_key);
            
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
            
            if (response.ok) {
                const data = await response.json();
                this.accessToken = data.access_token;
                this.isConnected = true;
                console.log('✅ 액세스 토큰 생성 완료');
            } else {
                throw new Error(`액세스 토큰 생성 실패: ${response.status}`);
            }
            
        } catch (error) {
            console.error('❌ 액세스 토큰 생성 실패:', error);
            this.isConnected = false;
        }
    }
    
    async createJWT(header, payload, privateKey) {
        // 간단한 JWT 생성 (실제로는 라이브러리 사용 권장)
        const encodedHeader = btoa(JSON.stringify(header));
        const encodedPayload = btoa(JSON.stringify(payload));
        
        // 실제로는 Web Crypto API를 사용해야 하지만, 여기서는 간단한 예시
        const signature = await this.sign(`${encodedHeader}.${encodedPayload}`, privateKey);
        
        return `${encodedHeader}.${encodedPayload}.${signature}`;
    }
    
    async sign(data, privateKey) {
        // 실제로는 Web Crypto API를 사용해야 하지만, 여기서는 간단한 예시
        // 실제 환경에서는 crypto-js 라이브러리 사용 권장
        return btoa('signature');
    }
    
    async initializeService() {
        try {
            if (this.accessToken) {
                this.isConnected = true;
                console.log('✅ 서비스 계정으로 구글 시트 API 연결 준비 완료');
            } else if (this.credentials && this.credentials.apiKey && this.credentials.apiKey !== 'YOUR_API_KEY_HERE') {
                this.isConnected = true;
                console.log('✅ API 키로 구글 시트 API 연결 준비 완료');
            } else {
                console.log('❌ 인증 정보가 설정되지 않았습니다.');
                this.isConnected = false;
            }
        } catch (error) {
            console.error('구글 시트 서비스 초기화 실패:', error);
            this.isConnected = false;
        }
    }
    
    async addInspectionData(inspectionData) {
        try {
            if (!this.isConnected) {
                throw new Error('구글 시트에 연결되지 않았습니다.');
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
            return false;
        }
    }
    
    async ensureSheetExists(sheetName) {
        try {
            // Fetch API로 스프레드시트 정보 가져오기
            const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}?key=${this.credentials.apiKey}`);
            
            if (!response.ok) {
                throw new Error(`스프레드시트 조회 실패: ${response.status}`);
            }
            
            const data = await response.json();
            const sheets = data.sheets || [];
            const sheetExists = sheets.some(sheet => sheet.properties.title === sheetName);
            
            if (!sheetExists) {
                // 시트 생성
                const createResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}:batchUpdate?key=${this.credentials.apiKey}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        requests: [{
                            addSheet: {
                                properties: {
                                    title: sheetName
                                }
                            }
                        }]
                    })
                });
                
                if (!createResponse.ok) {
                    throw new Error(`시트 생성 실패: ${createResponse.status}`);
                }
                
                console.log(`✅ 시트 생성 완료: ${sheetName}`);
            }
            
        } catch (error) {
            console.error(`❌ 시트 확인/생성 실패: ${sheetName}`, error);
            throw error;
        }
    }
    
    async setupSheetHeaders(sheetName) {
        try {
            // 기존 프로그램과 동일한 헤더 구조 (7열)
            const headers = [
                '날짜', '점검유형', '장비명', '설치위치', '점검자', '점검내용', '특이사항'
            ];
            
            const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${sheetName}!A1:G1?valueInputOption=RAW&key=${this.credentials.apiKey}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    values: [headers]
                })
            });
            
            if (!response.ok) {
                throw new Error(`헤더 설정 실패: ${response.status}`);
            }
            
            console.log(`✅ 헤더 설정 완료: ${sheetName}`);
            
        } catch (error) {
            console.error(`❌ 헤더 설정 실패: ${sheetName}`, error);
        }
    }
    
    async getSheetId(sheetName) {
        try {
            const response = await this.service.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            
            const sheets = response.result.sheets || [];
            const sheet = sheets.find(s => s.properties.title === sheetName);
            
            return sheet ? sheet.properties.sheetId : null;
            
        } catch (error) {
            console.error('시트 ID 조회 실패:', error);
            return null;
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
            
            const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${sheetName}!A:G:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS&key=${this.credentials.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    values: rowData
                })
            });
            
            console.log(`📡 응답 상태: ${response.status}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error(`❌ 응답 오류:`, errorData);
                throw new Error(`데이터 추가 실패: ${response.status} - ${errorData.error?.message || '알 수 없는 오류'}`);
            }
            
            const result = await response.json();
            console.log(`✅ 데이터 추가 완료: ${sheetName}`, result);
            
        } catch (error) {
            console.error(`❌ 데이터 추가 실패: ${sheetName}`, error);
            throw error;
        }
    }
    
    async getInspectionHistory(userName, limit = 50) {
        try {
            if (!this.isConnected) {
                throw new Error('구글 시트에 연결되지 않았습니다.');
            }
            
            const history = [];
            
            // 모든 점검 시트에서 데이터 조회
            const inspectionTypes = ['일일점검', '주간점검', '월간점검', '분기점검', '반기점검', '연간점검'];
            
            for (const type of inspectionTypes) {
                const sheetName = `${type}_점검`;
                
                try {
                    const response = await this.service.sheets.spreadsheets.values.get({
                        spreadsheetId: this.spreadsheetId,
                        range: `${sheetName}!A:H`
                    });
                    
                    const values = response.result.values || [];
                    
                    // 헤더 제외하고 데이터 처리
                    for (let i = 1; i < values.length; i++) {
                        const row = values[i];
                        if (row.length >= 5 && row[4] === userName) { // 점검자 이름이 일치하는 경우
                            history.push({
                                date: row[0],
                                time: row[1],
                                type: row[2],
                                equipment: row[3],
                                inspector: row[4],
                                item: row[5],
                                result: row[6],
                                note: row[7] || ''
                            });
                        }
                    }
                    
                } catch (error) {
                    // 시트가 존재하지 않는 경우 무시
                    console.log(`시트 ${sheetName} 조회 실패 (존재하지 않을 수 있음)`);
                }
            }
            
            // 날짜순 정렬 (최신순)
            history.sort((a, b) => new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time));
            
            return history.slice(0, limit);
            
        } catch (error) {
            console.error('❌ 점검 이력 조회 실패:', error);
            return [];
        }
    }
    
    async getEquipmentStatus() {
        try {
            if (!this.isConnected) {
                throw new Error('구글 시트에 연결되지 않았습니다.');
            }
            
            // 장비 상태 시트에서 데이터 조회
            const response = await this.service.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: '장비상태!A:D'
            });
            
            const values = response.result.values || [];
            const equipmentStatus = {};
            
            // 헤더 제외하고 데이터 처리
            for (let i = 1; i < values.length; i++) {
                const row = values[i];
                if (row.length >= 4) {
                    equipmentStatus[row[0]] = {
                        name: row[0],
                        type: row[1],
                        status: row[2],
                        lastCheck: row[3]
                    };
                }
            }
            
            return equipmentStatus;
            
        } catch (error) {
            console.error('❌ 장비 상태 조회 실패:', error);
            return {};
        }
    }
    
    async testConnection() {
        try {
            if (!this.isConnected) {
                return { success: false, message: '구글 시트에 연결되지 않았습니다.' };
            }
            
            const response = await this.service.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            
            const title = response.result.properties.title;
            return { 
                success: true, 
                message: `연결 성공! 스프레드시트: ${title}` 
            };
            
        } catch (error) {
            return { 
                success: false, 
                message: `연결 실패: ${error.message}` 
            };
        }
    }
}

// 전역 인스턴스 생성
window.googleSheetsManager = new GoogleSheetsManager();
