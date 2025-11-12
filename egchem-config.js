// EGChem FACSYS 웹앱 설정
const EGCHEM_CONFIG = {
    apiKey: 'AIzaSyAeDoupZ-YYB43TSvJwaBXZM7nonCIPcks',
    spreadsheetId: '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ',
    // 🔥 중요: 기본 웹앱 URL (Google Apps Script 배포 URL)
    // 사용자가 설정하지 않아도 이 URL을 사용합니다.
    // Google Apps Script에서 배포한 웹앱 URL을 여기에 입력하세요.
    // 형식: https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
    defaultWebAppUrl: '', // 기본값 없음 (사용자 설정 또는 localStorage에서 가져옴)
    version: '1.0'
};

// 전역 설정 적용
if (typeof window !== 'undefined') {
    window.EGCHEM_CONFIG = EGCHEM_CONFIG;
}