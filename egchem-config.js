// EGChem FACSYS 웹앱 설정
const EGCHEM_CONFIG = {
    apiKey: 'AIzaSyAeDoupZ-YYB43TSvJwaBXZM7nonCIPcks',
    spreadsheetId: '1QjU-kQDRgDrZ5tUn6awJhRWWx9u0Mt4uLCFmkOqLNcQ',
    version: '1.0'
};

// 전역 설정 적용
if (typeof window !== 'undefined') {
    window.EGCHEM_CONFIG = EGCHEM_CONFIG;
}